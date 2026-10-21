<?php
/**
 * Class TGS_HTSOFT_Inventory_Calculator
 *
 * Tính tồn kho từ ledger items
 */

if (!defined('ABSPATH')) {
    exit;
}

class TGS_HTSOFT_Inventory_Calculator {

    private $blog_id;

    public function __construct($blog_id) {
        $this->blog_id = $blog_id;
    }

    /**
     * Tính tồn kho cho danh sách SKU
     *
     * @param array $excel_items Danh sách items từ Excel
     * @return array Mảng [sku => ['quantity' => float, 'global_product_name' => string]]
     */
    public function calculate_inventory($excel_items) {
        global $wpdb;

        // Validate input
        if (!is_array($excel_items)) {
            return array();
        }

        // Lấy tất cả SKU cần tính
        $skus = array_map(function($item) {
            return $item['sku'];
        }, $excel_items);

        if (empty($skus)) {
            return array();
        }

        // Switch sang blog
        switch_to_blog($this->blog_id);

        $prefix = $wpdb->prefix;
        $placeholders = implode(',', array_fill(0, count($skus), '%s'));

        // Query lấy tồn từ ledger_item
        // Chỉ lấy phiếu đã duyệt (local_ledger_approver_status = 1)
        // Giữ khớp với TGS_Inventory_Helper của tgs_shop_management: dùng ABS cho
        // nhập/xuất/hoàn, và loại bỏ phiếu lẫn dòng đã xoá mềm. Thiếu điều kiện
        // is_deleted thì phiếu đã xoá vẫn được cộng vào tồn, làm báo cáo đối chiếu
        // báo lệch trong khi trang tồn kho của shop lại thấy khớp.
        $query = "
            SELECT
                li.local_product_sku,
                SUM(
                    CASE
                        WHEN li.local_ledger_item_type = 1 THEN ABS(li.quantity)   -- Nhập: cộng
                        WHEN li.local_ledger_item_type = 2 THEN -ABS(li.quantity)  -- Xuất: trừ
                        WHEN li.local_ledger_item_type = 3 THEN ABS(li.quantity)   -- Hoàn hàng: cộng
                        WHEN li.local_ledger_item_type = 21 THEN li.quantity        -- Điều chỉnh: +/- theo dấu
                        ELSE 0
                    END
                ) as total_quantity
            FROM {$prefix}local_ledger_item li
            INNER JOIN {$prefix}local_ledger l ON li.local_ledger_id = l.local_ledger_id
            WHERE li.local_product_sku IN ({$placeholders})
                AND l.local_ledger_approver_status = 1
                AND li.local_ledger_item_type IN (1, 2, 3, 21)
                AND (li.is_deleted = 0 OR li.is_deleted IS NULL)
                AND (l.is_deleted = 0 OR l.is_deleted IS NULL)
            GROUP BY li.local_product_sku
        ";

        $results = $wpdb->get_results($wpdb->prepare($query, ...$skus));

        // Map kết quả
        $inventory = array();
        foreach ($results as $row) {
            $inventory[$row->local_product_sku] = array(
                'quantity' => floatval($row->total_quantity),
                'global_product_name' => '',
            );
        }

        // Cộng chuyển kho global (phiếu chuyển kho mới không còn ghi local_ledger): bên đi trừ, bên đến cộng.
        foreach (self::global_transfer_net($this->blog_id, $skus) as $sku => $q) {
            if (!isset($inventory[$sku])) {
                $inventory[$sku] = array('quantity' => 0, 'global_product_name' => '');
            }
            $inventory[$sku]['quantity'] += $q;
        }

        // Lấy tên sản phẩm từ global
        $global_query = "
            SELECT global_product_sku, global_product_name
            FROM {$wpdb->base_prefix}global_product_name
            WHERE global_product_sku IN ({$placeholders})
        ";

        $global_results = $wpdb->get_results($wpdb->prepare($global_query, ...$skus));

        foreach ($global_results as $row) {
            if (isset($inventory[$row->global_product_sku])) {
                $inventory[$row->global_product_sku]['global_product_name'] = $row->global_product_name;
            } else {
                // SKU không có ledger item nào -> tồn = 0
                $inventory[$row->global_product_sku] = array(
                    'quantity' => 0,
                    'global_product_name' => $row->global_product_name,
                );
            }
        }

        restore_current_blog();

        return $inventory;
    }

    /**
     * TỒN CÁC SKU CHỈ CÓ Ở HỆ THỐNG (không có trong file Excel HTsoft) mà CÒN TỒN ≠ 0.
     *
     * Vì sao: file Excel là chiều HTsoft. Website thực có thể ĐANG THỪA mã hàng
     * (nhập linh tinh) mà HTsoft không có → không nằm trong Excel nên không được
     * đối chiếu, báo "không lệch" trong khi thực tế website thừa tồn. Lấy thêm các
     * mã này (coi Excel = 0) để cân về 0 cho khớp HTsoft.
     *
     * Công thức tồn khớp HỆT calculate_inventory (type 1/2/3/21, loại phiếu/dòng xoá,
     * chỉ phiếu đã duyệt). Trả [sku => ['quantity','global_product_name']] — đã BỎ các
     * SKU nằm trong $exclude_skus (danh sách SKU của Excel).
     *
     * @param array $exclude_skus SKU đã có trong Excel (bỏ qua để không trùng)
     * @return array
     */
    public function calculate_system_only_inventory($exclude_skus = array()) {
        global $wpdb;

        switch_to_blog($this->blog_id);
        $prefix = $wpdb->prefix;

        // Group toàn bộ tồn theo SKU (chỉ giữ SKU còn tồn ≠ 0). Đây là thao tác đối
        // chiếu thủ công (không phải hot-path), chấp nhận group-by toàn bảng.
        $query = "
            SELECT
                li.local_product_sku AS sku,
                SUM(
                    CASE
                        WHEN li.local_ledger_item_type = 1 THEN ABS(li.quantity)
                        WHEN li.local_ledger_item_type = 2 THEN -ABS(li.quantity)
                        WHEN li.local_ledger_item_type = 3 THEN ABS(li.quantity)
                        WHEN li.local_ledger_item_type = 21 THEN li.quantity
                        ELSE 0
                    END
                ) AS total_quantity
            FROM {$prefix}local_ledger_item li
            INNER JOIN {$prefix}local_ledger l ON li.local_ledger_id = l.local_ledger_id
            WHERE l.local_ledger_approver_status = 1
                AND li.local_ledger_item_type IN (1, 2, 3, 21)
                AND (li.is_deleted = 0 OR li.is_deleted IS NULL)
                AND (l.is_deleted = 0 OR l.is_deleted IS NULL)
                AND li.local_product_sku IS NOT NULL
                AND li.local_product_sku <> ''
            GROUP BY li.local_product_sku
        ";

        $rows = $wpdb->get_results($query);

        // Tồn ròng = local_ledger + chuyển kho global; lọc tồn ≠ 0 SAU khi cộng (không lọc bằng HAVING được nữa).
        $totals = array();
        foreach ((array) $rows as $r) {
            $totals[(string) $r->sku] = floatval($r->total_quantity);
        }
        foreach (self::global_transfer_net($this->blog_id) as $sku => $q) {
            $totals[(string) $sku] = ($totals[(string) $sku] ?? 0) + $q;
        }
        $rows = array();
        foreach ($totals as $sku => $q) {
            if (abs($q) > 0.001) {
                $rows[] = (object) array('sku' => (string) $sku, 'total_quantity' => $q);
            }
        }

        // Tập SKU Excel để loại (so khớp đúng chuỗi như calculate_inventory).
        $exclude = array();
        foreach ((array) $exclude_skus as $s) {
            $exclude[(string) $s] = true;
        }

        $out = array();
        $need_names = array();
        foreach ((array) $rows as $r) {
            $sku = (string) $r->sku;
            if ($sku === '' || isset($exclude[$sku])) {
                continue;
            }
            $out[$sku] = array(
                'quantity' => floatval($r->total_quantity),
                'global_product_name' => '',
            );
            $need_names[] = $sku;
        }

        // Tên sản phẩm từ global (danh mục chung).
        if (!empty($need_names)) {
            $ph = implode(',', array_fill(0, count($need_names), '%s'));
            $names = $wpdb->get_results($wpdb->prepare(
                "SELECT global_product_sku, global_product_name
                   FROM {$wpdb->base_prefix}global_product_name
                  WHERE global_product_sku IN ({$ph})",
                ...$need_names
            ));
            foreach ((array) $names as $n) {
                if (isset($out[$n->global_product_sku])) {
                    $out[$n->global_product_sku]['global_product_name'] = $n->global_product_name;
                }
            }
        }

        restore_current_blog();

        return $out;
    }

    /**
     * SL ĐI ĐƯỜNG (hàng đang về) theo từng SKU — CHỈ để đối chiếu với cột "SL đi đường" của file Excel, KHÔNG dùng để cân
     * tồn. = phiếu chuyển kho global bên đi đã duyệt xuất, website này CHƯA nhận (import_status = 0; 2 = từ chối).
     *
     * @return array [sku => qty]
     */
    public function calculate_in_transit_all() {
        global $wpdb;

        if (!class_exists('TGS_Global_Transfer') || !TGS_Global_Transfer::ready()) {
            return array();
        }
        $T = TGS_Global_Transfer::table();
        $I = TGS_Global_Transfer::item_table();
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT i.sku AS sku, COALESCE(SUM(i.quantity), 0) AS qty
               FROM {$T} t
               INNER JOIN {$I} i ON i.transfer_id = t.transfer_id AND i.is_deleted = 0
              WHERE t.to_blog_id = %d AND t.is_deleted = 0
                AND t.export_status = 1 AND t.import_status = 0
                AND i.sku IS NOT NULL AND i.sku <> ''
              GROUP BY i.sku",
            (int) $this->blog_id
        ));
        $map = array();
        foreach ((array) $rows as $r) {
            $map[(string) $r->sku] = (float) $r->qty;
        }
        return $map;
    }

    /**
     * Số lượng ròng từ chuyển kho global (wp_global_transfer) của website: [sku => qty có dấu].
     * $skus rỗng = mọi mã. Chưa có bảng / chưa nạp class thì trả rỗng.
     */
    private static function global_transfer_net($blog_id, array $skus = array()) {
        if (!class_exists('TGS_Global_Transfer') || !TGS_Global_Transfer::ready()) {
            return array();
        }
        $skus = array_values(array_filter(array_map('strval', $skus), 'strlen'));
        return TGS_Global_Transfer::net((int) $blog_id, $skus, 'sku');
    }
}
