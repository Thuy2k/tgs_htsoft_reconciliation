<?php
/**
 * Class TGS_HTSOFT_Adjustment_Creator
 *
 * Tạo phiếu điều chỉnh tự động theo chuẩn hệ thống
 */

if (!defined('ABSPATH')) {
    exit;
}

class TGS_HTSOFT_Adjustment_Creator {

    private $blog_id;

    public function __construct($blog_id) {
        $this->blog_id = $blog_id;
    }

    /**
     * Tạo phiếu điều chỉnh theo chuẩn TGS_Ajax_Adjustment
     *
     * QUAN TRỌNG: Phiếu sẽ được tạo trong blog_id được truyền vào constructor
     *
     * @param array $items Danh sách items cần điều chỉnh
     * @param string $note Ghi chú phiếu
     * @return int local_ledger_id
     */
    public function create_adjustment($items, $note = '') {
        global $wpdb;

        if (empty($items)) {
            throw new Exception("Không có item nào để tạo phiếu điều chỉnh");
        }

        // QUAN TRỌNG: Switch sang blog cụ thể để tạo phiếu ở đúng website
        switch_to_blog($this->blog_id);

        // Force prefix cho blog này (workaround nếu switch_to_blog không cập nhật prefix)
        $blog_prefix = $wpdb->get_blog_prefix($this->blog_id);

        $now = current_time('mysql');
        $user_id = get_current_user_id() ?: 0;

        // Load constants từ hệ thống - sử dụng TGS_Shop_Constants nếu có
        if (class_exists('TGS_Shop_Constants')) {
            TGS_Shop_Constants::init();
        }

        // Fallback nếu constants chưa được define
        if (!defined('TGS_LEDGER_TYPE_PRODUCT_EDIT')) {
            define('TGS_LEDGER_TYPE_PRODUCT_EDIT', 21);
        }
        if (!defined('TGS_APPROVER_STATUS_APPROVED')) {
            define('TGS_APPROVER_STATUS_APPROVED', 1);
        }
        if (!defined('TGS_LEDGER_STATUS_APPROVED')) {
            define('TGS_LEDGER_STATUS_APPROVED', 2);
        }

        // DÙNG BLOG PREFIX TRỰC TIẾP thay vì $wpdb->prefix
        $ledger_tbl = $blog_prefix . 'local_ledger';
        $item_tbl = $blog_prefix . 'local_ledger_item';
        $meta_tbl = $blog_prefix . 'local_ledger_meta';

        // Debug: Kiểm tra table names
        error_log("Creating adjustment in blog_id: {$this->blog_id}");
        error_log("  Blog prefix: {$blog_prefix}");
        error_log("  Ledger table: {$ledger_tbl}");
        error_log("  Meta table: {$meta_tbl}");

        try {
            $wpdb->query('START TRANSACTION');

            // 1. Tạo metadata trước
            $meta_seed = array(
                'adjustment_source' => 'htsoft_reconciliation',
                'edit_type' => 'inventory',
                'is_manual' => 0,
                'is_auto_approved' => 1,
                'fields_changed' => array(),
                'lines' => array(),
            );

            $wpdb->insert($meta_tbl, array(
                'local_ledger_meta_value' => wp_json_encode($meta_seed, JSON_UNESCAPED_UNICODE),
                'user_id' => $user_id,
                'is_deleted' => 0,
                'created_at' => $now,
                'updated_at' => $now,
            ));

            $meta_id = (int) $wpdb->insert_id;
            if ($meta_id <= 0) {
                throw new Exception('Không thể tạo metadata phiếu điều chỉnh.');
            }

            // 2. Tạo ledger (phiếu cha)
            $code = $this->generate_adjustment_code();

            $wpdb->insert($ledger_tbl, array(
                'local_ledger_code' => $code,
                'local_ledger_title' => 'Phiếu điều chỉnh HTSOFT ' . $code,
                'local_ledger_type' => TGS_LEDGER_TYPE_PRODUCT_EDIT,
                'local_ledger_note' => $note ?: 'Điều chỉnh từ đối chiếu HTSOFT',
                'local_ledger_total_amount' => 0,
                'local_ledger_meta_id' => $meta_id,
                'local_ledger_status' => TGS_LEDGER_STATUS_APPROVED,
                'local_ledger_approver_status' => TGS_APPROVER_STATUS_APPROVED,
                'local_ledger_approver_id' => $user_id,
                'user_id' => $user_id,
                'is_deleted' => 0,
                'created_at' => $now,
                'updated_at' => $now,
            ));

            $ledger_id = (int) $wpdb->insert_id;
            if ($ledger_id <= 0) {
                throw new Exception('Không thể tạo phiếu điều chỉnh.');
            }

            // 3. Tạo các ledger_item
            $line_logs = array();
            $item_ids = array();
            $total_impact = 0.0;

            foreach ($items as $item) {
                $sku = trim($item['sku']);
                $system_qty = floatval($item['system_qty']);
                $excel_qty = floatval($item['excel_qty']);
                $diff = $system_qty - $excel_qty; // Chênh lệch để hiển thị

                if (abs($diff) < 0.01) {
                    continue;
                }

                // QUAN TRỌNG: quantity = Tồn mới - Tồn cũ = Excel - System
                // VD: system=1, excel=0 → adjustment_quantity = 0 - 1 = -1
                // Khi áp dụng: 1 + (-1) = 0 ✅
                $adjustment_quantity = $excel_qty - $system_qty;

                // Lấy product info từ TGS_Global_Product_Source
                if (class_exists('TGS_Global_Product_Source')) {
                    $product = TGS_Global_Product_Source::get_product($sku, array(
                        'by' => 'sku',
                        'blog_id' => $this->blog_id,
                        'with_stock' => true,
                    ));
                } else {
                    // Fallback: query trực tiếp
                    $product = $wpdb->get_row($wpdb->prepare(
                        "SELECT g.global_product_name_id, g.global_product_sku, g.global_product_name
                         FROM {$wpdb->base_prefix}global_product_name g
                         WHERE g.global_product_sku = %s
                         LIMIT 1",
                        $sku
                    ));
                }

                if (!$product) {
                    continue;
                }

                // TGS_Global_Product_Source::get_product() trả về array, không phải object
                $product_id = isset($product['local_product_name_id'])
                    ? (int) $product['local_product_name_id']
                    : (int) $product['global_product_name_id'];

                $product_name = isset($product['local_product_name'])
                    ? $product['local_product_name']
                    : $product['global_product_name'];

                $price = isset($product['local_product_price_after_tax'])
                    ? (float) $product['local_product_price_after_tax']
                    : 0;

                $is_tracking = isset($product['local_product_is_tracking'])
                    ? (int) $product['local_product_is_tracking']
                    : 0;

                $global_product_id = (int) $product['global_product_name_id'];

                // Item meta
                $item_meta = array(
                    'adjustment_type' => 'inventory',
                    'old_value' => $system_qty,
                    'new_value' => $excel_qty,
                    'diff_value' => $diff,
                    'line_reason' => "Đối chiếu HTSOFT: Chênh lệch " . number_format($diff, 2),
                    'fields_changed' => array(
                        'quantity' => array(
                            'old' => $system_qty,
                            'new' => $excel_qty,
                        ),
                    ),
                );

                $wpdb->insert($item_tbl, array(
                    'local_ledger_id' => $ledger_id,
                    'local_product_name_id' => $product_id,
                    'global_product_name_id' => $global_product_id,
                    'quantity' => $adjustment_quantity,
                    'price' => $price,
                    'local_ledger_item_note' => $item_meta['line_reason'],
                    'local_ledger_item_meta' => wp_json_encode($item_meta, JSON_UNESCAPED_UNICODE),
                    'local_ledger_item_type' => TGS_LEDGER_TYPE_PRODUCT_EDIT,
                    'is_tracking' => $is_tracking,
                    'local_product_sku' => $sku,
                    'user_id' => $user_id,
                    'is_deleted' => 0,
                    'created_at' => $now,
                    'updated_at' => $now,
                ));

                $item_id = (int) $wpdb->insert_id;
                if ($item_id <= 0) {
                    throw new Exception("Không thể tạo ledger_item cho SKU {$sku}");
                }

                $item_ids[] = $item_id;
                $line_logs[] = array(
                    'product_id' => $product_id,
                    'sku' => $sku,
                    'product_name' => $product_name,
                    'old_value' => $system_qty,
                    'new_value' => $excel_qty,
                    'diff_value' => $diff,
                    'adjustment_quantity' => $adjustment_quantity,
                    'reason' => $item_meta['line_reason'],
                );

                $total_impact += abs($adjustment_quantity * $price);
            }

            if (empty($item_ids)) {
                throw new Exception('Không có dòng điều chỉnh hợp lệ để lưu phiếu.');
            }

            // 4. Update metadata với line_logs
            $meta_update = array(
                'adjustment_source' => 'htsoft_reconciliation',
                'edit_type' => 'inventory',
                'is_manual' => 0,
                'is_auto_approved' => 1,
                'line_count' => count($line_logs),
                'fields_changed' => array(
                    'line_count' => array(
                        'old' => 0,
                        'new' => count($line_logs),
                    ),
                ),
                'lines' => $line_logs,
            );

            $wpdb->update(
                $meta_tbl,
                array(
                    'local_ledger_meta_value' => wp_json_encode($meta_update, JSON_UNESCAPED_UNICODE),
                    'updated_at' => $now,
                ),
                array('local_ledger_meta_id' => $meta_id),
                array('%s', '%s'),
                array('%d')
            );

            // 5. Update ledger với item_ids và total_amount
            $wpdb->update(
                $ledger_tbl,
                array(
                    'local_ledger_item_id' => wp_json_encode($item_ids, JSON_UNESCAPED_UNICODE),
                    'local_ledger_total_amount' => $total_impact,
                    'updated_at' => $now,
                ),
                array('local_ledger_id' => $ledger_id),
                array('%s', '%f', '%s'),
                array('%d')
            );

            $wpdb->query('COMMIT');

            // QUAN TRỌNG: Restore về blog ban đầu sau khi tạo xong phiếu
            restore_current_blog();

            return $ledger_id;

        } catch (Exception $e) {
            $wpdb->query('ROLLBACK');

            // QUAN TRỌNG: Phải restore ngay cả khi có lỗi
            restore_current_blog();

            throw $e;
        }
    }

    /**
     * Generate mã phiếu theo chuẩn hệ thống
     */
    private function generate_adjustment_code() {
        if (function_exists('tgs_shop_generate_ticket_code')) {
            return tgs_shop_generate_ticket_code('DC');
        }

        return 'DC-HTSOFT-' . date('Ymd') . '-' . str_pad(mt_rand(0, 9999), 4, '0', STR_PAD_LEFT);
    }
}
