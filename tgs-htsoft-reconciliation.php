<?php
/**
 * Plugin Name: TGS HTSOFT Reconciliation
 * Plugin URI: https://bizgpt.vn/
 * Description: Plugin đối chiếu tồn kho giữa HTSOFT và hệ thống TGS Shop
 * Version: 1.0.0
 * Author: BIZGPT_AI
 * Author URI: https://bizgpt.vn/
 * License: GPL v2 or later
 * Text Domain: tgs-htsoft-reconciliation
 */

if (!defined('ABSPATH')) {
    exit;
}

// Constants
define('TGS_HTSOFT_RECON_VERSION', '1.0.0');
define('TGS_HTSOFT_RECON_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('TGS_HTSOFT_RECON_PLUGIN_URL', plugin_dir_url(__FILE__));

class TGS_HTSOFT_Reconciliation {

    private static $instance = null;

    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        // Hook vào workflow nav để thêm menu
        add_filter('tgs_shop_workflow_nav', array($this, 'add_to_workflow_nav'), 10, 2);

        // Enqueue scripts và styles
        add_action('admin_enqueue_scripts', array($this, 'enqueue_assets'));

        // AJAX handlers
        add_action('wp_ajax_tgs_htsoft_parse_excel', array($this, 'ajax_parse_excel'));
        add_action('wp_ajax_tgs_htsoft_get_tab_data', array($this, 'ajax_get_tab_data'));
        add_action('wp_ajax_tgs_htsoft_create_adjustment', array($this, 'ajax_create_adjustment'));

        // Include required files
        $this->includes();
    }

    /**
     * Thêm menu vào workflow nav (trong menu Quản trị -> Hệ thống)
     */
    public function add_to_workflow_nav($workflow_nav, $current_view) {
        if (isset($workflow_nav['admin']['sections'])) {
            // Tìm section "Hệ thống" (heading: "Hệ thống")
            foreach ($workflow_nav['admin']['sections'] as $key => $section) {
                if (isset($section['heading']) && $section['heading'] === 'Hệ thống') {
                    // Thêm menu "Đối chiếu HTSOFT" vào đầu danh sách items
                    array_unshift($workflow_nav['admin']['sections'][$key]['items'], array(
                        'view' => 'htsoft-reconciliation',
                        'label' => 'Đối chiếu HTSOFT',
                        'icon' => 'bx bx-git-compare',
                    ));
                    break;
                }
            }
        }
        return $workflow_nav;
    }

    private function includes() {
        require_once TGS_HTSOFT_RECON_PLUGIN_DIR . 'includes/class-excel-parser.php';
        require_once TGS_HTSOFT_RECON_PLUGIN_DIR . 'includes/class-inventory-calculator.php';
        require_once TGS_HTSOFT_RECON_PLUGIN_DIR . 'includes/class-adjustment-creator.php';

        // LUỒNG RIÊNG: khảo sát feedback shop (asset + AJAX + modal tự đăng ký).
        require_once TGS_HTSOFT_RECON_PLUGIN_DIR . 'includes/class-feedback-module.php';
        TGS_HTSOFT_Feedback_Module::init();
    }

    // XÓA FUNCTION NÀY - không cần nữa
    // public function add_mega_nav_menu() { ... }

    public function enqueue_assets($hook) {
        if ($hook !== 'toplevel_page_tgs-shop-management') {
            return;
        }

        $current_view = isset($_GET['view']) ? sanitize_text_field($_GET['view']) : '';
        if ($current_view !== 'htsoft-reconciliation') {
            return;
        }

        // SheetJS with style support (xlsx-js-style - drop-in replacement)
        wp_enqueue_script(
            'sheetjs',
            'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js',
            array(),
            '1.2.0',
            true
        );

        // Dùng filemtime làm version: TGS_HTSOFT_RECON_VERSION là hằng số cứng
        // '1.0.0' nên sửa file js/css xong trình duyệt vẫn nạp bản cache cũ.
        $js_path = plugin_dir_path(__FILE__) . 'assets/js/reconciliation.js';
        $css_path = plugin_dir_path(__FILE__) . 'assets/css/reconciliation.css';
        $js_ver = file_exists($js_path) ? filemtime($js_path) : TGS_HTSOFT_RECON_VERSION;
        $css_ver = file_exists($css_path) ? filemtime($css_path) : TGS_HTSOFT_RECON_VERSION;

        wp_enqueue_script(
            'tgs-htsoft-recon',
            plugin_dir_url(__FILE__) . 'assets/js/reconciliation.js',
            array('jquery', 'sheetjs'),
            $js_ver,
            true
        );

        wp_enqueue_style(
            'tgs-htsoft-recon',
            plugin_dir_url(__FILE__) . 'assets/css/reconciliation.css',
            array(),
            $css_ver
        );

        wp_localize_script('tgs-htsoft-recon', 'tgsHtsoftRecon', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('tgs_htsoft_recon_nonce'),
        ));
    }

    public function ajax_parse_excel() {
        check_ajax_referer('tgs_htsoft_recon_nonce', 'nonce');

        try {
            global $wpdb;
            $excel_data = json_decode(stripslashes($_POST['excel_data']), true);
            $selected_sheet = sanitize_text_field($_POST['selected_sheet']);

            $parser = new TGS_HTSOFT_Excel_Parser();
            $result = $parser->parse_and_group($excel_data, $selected_sheet);

            // Bổ sung tên website cho mỗi tab
            foreach ($result['tabs'] as &$tab) {
                $site_code = $tab['site_code'];

                // Tìm blog từ site_code
                $blog = $wpdb->get_row($wpdb->prepare(
                    "SELECT blog_id FROM {$wpdb->blogs} WHERE tgs_site_code = %s",
                    $site_code
                ));

                if ($blog) {
                    switch_to_blog($blog->blog_id);
                    $tab['site_name'] = get_bloginfo('name');
                    restore_current_blog();
                } else {
                    $tab['site_name'] = '';
                }
            }

            wp_send_json_success($result);
        } catch (Exception $e) {
            wp_send_json_error(array('message' => $e->getMessage()));
        }
    }

    public function ajax_get_tab_data() {
        check_ajax_referer('tgs_htsoft_recon_nonce', 'nonce');

        try {
            global $wpdb;
            $site_code = sanitize_text_field($_POST['site_code']);
            $excel_items = json_decode(stripslashes($_POST['excel_items']), true);

            // Validate decoded data
            if (!is_array($excel_items)) {
                throw new Exception("Dữ liệu Excel không hợp lệ");
            }

            // Tìm blog_id từ tgs_site_code
            $blog = $wpdb->get_row($wpdb->prepare(
                "SELECT blog_id, domain, path FROM {$wpdb->blogs} WHERE tgs_site_code = %s",
                $site_code
            ));

            if (!$blog) {
                throw new Exception("Không tìm thấy website với mã: {$site_code}");
            }

            $blog_id = $blog->blog_id;

            // Lấy tên website
            switch_to_blog($blog_id);
            $site_name = get_bloginfo('name');
            restore_current_blog();

            // Tính tồn từ hệ thống
            $calculator = new TGS_HTSOFT_Inventory_Calculator($blog_id);
            $system_inventory = $calculator->calculate_inventory($excel_items);

            // So sánh
            $comparison = array();
            foreach ($excel_items as $item) {
                $sku = $item['sku'];
                $excel_qty = floatval($item['quantity']);
                $system_qty = isset($system_inventory[$sku]) ? $system_inventory[$sku]['quantity'] : 0;
                $diff = $system_qty - $excel_qty;

                $comparison[] = array(
                    'sku' => $sku,
                    'product_name' => $item['product_name'],
                    'excel_qty' => $excel_qty,
                    'system_qty' => $system_qty,
                    'diff' => $diff,
                    'global_product_name' => isset($system_inventory[$sku]) ? $system_inventory[$sku]['global_product_name'] : '',
                );
            }

            // Lấy thống kê ngày hôm nay
            $blog_prefix = $wpdb->get_blog_prefix($blog_id);
            $today_start = date('Y-m-d 00:00:00');
            $today_end = date('Y-m-d 23:59:59');

            // Số đơn bán hàng
            $orders_count = $wpdb->get_var($wpdb->prepare(
                "SELECT COUNT(*)
                 FROM {$blog_prefix}local_ledger
                 WHERE local_ledger_type = 10
                 AND local_ledger_approver_status = 1
                 AND (is_deleted = 0 OR is_deleted IS NULL)
                 AND created_at BETWEEN %s AND %s",
                $today_start,
                $today_end
            ));

            // Tổng doanh thu (phiếu thu type = 7)
            $revenue = $wpdb->get_var($wpdb->prepare(
                "SELECT SUM(local_ledger_total_amount)
                 FROM {$blog_prefix}local_ledger
                 WHERE local_ledger_type = 7
                 AND local_ledger_approver_status = 1
                 AND (is_deleted = 0 OR is_deleted IS NULL)
                 AND created_at BETWEEN %s AND %s",
                $today_start,
                $today_end
            ));

            // Tiền hoàn lại khách (phiếu chi type = 8) — đối xứng với phiếu thu
            // type = 7. Phiếu chi được sinh ra khi hoàn hàng, lọc theo created_at
            // tức thời điểm bấm tạo phiếu.
            $refund_amount = $wpdb->get_var($wpdb->prepare(
                "SELECT SUM(local_ledger_total_amount)
                 FROM {$blog_prefix}local_ledger
                 WHERE local_ledger_type = 8
                 AND local_ledger_approver_status = 1
                 AND (is_deleted = 0 OR is_deleted IS NULL)
                 AND created_at BETWEEN %s AND %s",
                $today_start,
                $today_end
            ));

            // Ghi chú phiếu bán hàng
            $sales_notes = array();
            $notes_results = $wpdb->get_results($wpdb->prepare(
                "SELECT local_ledger_note, created_at
                 FROM {$blog_prefix}local_ledger
                 WHERE local_ledger_type = 10
                 AND local_ledger_approver_status = 1
                 AND local_ledger_note LIKE %s
                 AND created_at BETWEEN %s AND %s
                 ORDER BY created_at DESC",
                '%Ghi chú%',
                $today_start,
                $today_end
            ));

            if ($notes_results) {
                foreach ($notes_results as $note_row) {
                    $sales_notes[] = array(
                        'note' => $note_row->local_ledger_note,
                        'created_at' => $note_row->created_at,
                    );
                }
            }

            wp_send_json_success(array(
                'blog_id' => $blog_id,
                'site_name' => $site_name,
                'comparison' => $comparison,
                'total_items' => count($comparison),
                'items_with_diff' => count(array_filter($comparison, function($item) {
                    return abs($item['diff']) > 0.01;
                })),
                'orders_count' => intval($orders_count),
                'revenue' => floatval($revenue),
                'refund_amount' => floatval($refund_amount),
                'net_revenue' => max(0, floatval($revenue) - floatval($refund_amount)),
                'sales_notes' => $sales_notes,
            ));

        } catch (Exception $e) {
            wp_send_json_error(array('message' => $e->getMessage()));
        }
    }

    public function ajax_create_adjustment() {
        check_ajax_referer('tgs_htsoft_recon_nonce', 'nonce');

        try {
            $blog_id = intval($_POST['blog_id']);
            $items = json_decode(stripslashes($_POST['items']), true);
            $note = sanitize_text_field($_POST['note']);

            if ($blog_id <= 0) {
                throw new Exception("Blog ID không hợp lệ: {$blog_id}");
            }

            $creator = new TGS_HTSOFT_Adjustment_Creator($blog_id);
            $ledger_id = $creator->create_adjustment($items, $note);

            wp_send_json_success(array(
                'ledger_id' => $ledger_id,
                'blog_id' => $blog_id,
                'message' => 'Đã tạo phiếu điều chỉnh thành công',
                'detail_url' => get_admin_url($blog_id, "admin.php?page=tgs-shop-management&view=ticket-adjustment-detail&id={$ledger_id}")
            ));

        } catch (Exception $e) {
            wp_send_json_error(array('message' => $e->getMessage()));
        }
    }
}

// Initialize plugin
add_action('plugins_loaded', array('TGS_HTSOFT_Reconciliation', 'get_instance'));
