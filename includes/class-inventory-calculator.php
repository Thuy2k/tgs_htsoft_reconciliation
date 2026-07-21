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
        $query = "
            SELECT
                li.local_product_sku,
                SUM(
                    CASE
                        WHEN li.local_ledger_item_type = 1 THEN li.quantity  -- Nhập: cộng
                        WHEN li.local_ledger_item_type = 2 THEN -li.quantity -- Xuất: trừ
                        WHEN li.local_ledger_item_type = 3 THEN li.quantity  -- Hoàn hàng: cộng
                        WHEN li.local_ledger_item_type = 21 THEN li.quantity -- Điều chỉnh: +/- tùy giá trị
                        ELSE 0
                    END
                ) as total_quantity
            FROM {$prefix}local_ledger_item li
            INNER JOIN {$prefix}local_ledger l ON li.local_ledger_id = l.local_ledger_id
            WHERE li.local_product_sku IN ({$placeholders})
                AND l.local_ledger_approver_status = 1
                AND li.local_ledger_item_type IN (1, 2, 3, 21)
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
}
