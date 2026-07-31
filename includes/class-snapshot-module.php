<?php
/**
 * Class TGS_HTSOFT_Snapshot_Module
 *
 * LUỒNG "Báo cáo so sánh HTSOFT" - tách khỏi luồng đối chiếu/tạo phiếu điều chỉnh.
 *
 * Hai nửa của luồng:
 *  1. Quản trị: sau khi phân tích file Excel HTSOFT, bấm "Lưu phiên đối chiếu"
 *     -> chụp lại toàn bộ shop trong file tại đúng khung giờ đó (cả số HTSOFT
 *        lẫn số realtime của hệ thống mới) vào bảng global + JSONL từng shop.
 *  2. Mọi người (shop, sếp): mở view 'htsoft-compare-report' trên site của mình,
 *     chọn phiên quét, lọc mã shop, xem chênh lệch và điền ghi chú giải thích.
 *     Ghi chú tự lưu, mọi thay đổi được ghi nhật ký JSONL.
 *
 * Yêu cầu quyền:
 *  - Ghi snapshot / xoá phiên: manage_options.
 *  - Xem báo cáo + điền ghi chú: chỉ cần đăng nhập (chốt theo yêu cầu vận hành).
 */

if (!defined('ABSPATH')) {
    exit;
}

class TGS_HTSOFT_Snapshot_Module {

    const NONCE_ACTION = 'tgs_htsoft_snapshot_nonce';
    const PAGE_HOOK    = 'toplevel_page_tgs-shop-management';
    const VIEW_REPORT  = 'htsoft-compare-report';
    const VIEW_RECON   = 'htsoft-reconciliation';

    public static function init() {
        add_action('admin_init', array(__CLASS__, 'maybe_install'));

        // Đăng ký view mới vào router của tgs_shop_management (chạy trên MỌI site).
        add_filter('tgs_shop_dashboard_routes', array(__CLASS__, 'register_route'));
        add_filter('tgs_shop_workflow_nav', array(__CLASS__, 'add_nav_item'), 10, 2);

        add_action('admin_enqueue_scripts', array(__CLASS__, 'enqueue_assets'), 20);

        // --- Ghi snapshot (quản trị) ---
        add_action('wp_ajax_tgs_htsoft_snapshot_start', array(__CLASS__, 'ajax_start'));
        add_action('wp_ajax_tgs_htsoft_snapshot_add_site', array(__CLASS__, 'ajax_add_site'));
        add_action('wp_ajax_tgs_htsoft_snapshot_finish', array(__CLASS__, 'ajax_finish'));
        add_action('wp_ajax_tgs_htsoft_snapshot_delete', array(__CLASS__, 'ajax_delete'));

        // --- Đọc báo cáo + ghi chú (mọi người đăng nhập) ---
        add_action('wp_ajax_tgs_htsoft_report_snapshots', array(__CLASS__, 'ajax_snapshots'));
        add_action('wp_ajax_tgs_htsoft_report_overview', array(__CLASS__, 'ajax_overview'));
        add_action('wp_ajax_tgs_htsoft_report_site', array(__CLASS__, 'ajax_site_detail'));
        add_action('wp_ajax_tgs_htsoft_report_save_note', array(__CLASS__, 'ajax_save_note'));
        add_action('wp_ajax_tgs_htsoft_report_note_history', array(__CLASS__, 'ajax_note_history'));
        add_action('wp_ajax_tgs_htsoft_report_live_stock', array(__CLASS__, 'ajax_live_stock'));
    }

    public static function maybe_install() {
        TGS_HTSOFT_Snapshot_DB::maybe_install();
    }

    /* ---------------------------------------------------------------------
     * Điều hướng
     * ------------------------------------------------------------------ */

    public static function register_route($routes) {
        $routes[self::VIEW_REPORT] = array(
            'Báo cáo so sánh HTSOFT',
            TGS_HTSOFT_RECON_PLUGIN_DIR . 'admin-views/compare-report.php',
        );
        return $routes;
    }

    /**
     * Đặt trong nhóm "Báo cáo" để shop nào cũng thấy, không nằm trong nhóm
     * quản trị như trang đối chiếu gốc.
     */
    public static function add_nav_item($workflow_nav, $current_view) {
        if (!isset($workflow_nav['reports']['sections'])) {
            return $workflow_nav;
        }

        foreach ($workflow_nav['reports']['sections'] as $key => $section) {
            if (isset($section['heading']) && $section['heading'] === 'Kho & vận hành') {
                $workflow_nav['reports']['sections'][$key]['items'][] = array(
                    'view'  => self::VIEW_REPORT,
                    'label' => 'So sánh HTSOFT / hệ thống',
                    'icon'  => 'bx bx-git-compare',
                );
                return $workflow_nav;
            }
        }

        return $workflow_nav;
    }

    /* ---------------------------------------------------------------------
     * Assets
     * ------------------------------------------------------------------ */

    public static function enqueue_assets($hook) {
        if ($hook !== self::PAGE_HOOK) {
            return;
        }

        $view = isset($_GET['view']) ? sanitize_text_field(wp_unslash($_GET['view'])) : '';

        // Trang đối chiếu: chỉ cần thêm luồng "Lưu phiên đối chiếu".
        if ($view === self::VIEW_RECON) {
            if (!current_user_can('manage_options')) {
                return;
            }

            $save_js = TGS_HTSOFT_RECON_PLUGIN_DIR . 'assets/js/snapshot-save.js';
            $css_path = TGS_HTSOFT_RECON_PLUGIN_DIR . 'assets/css/compare-report.css';

            wp_enqueue_script(
                'tgs-htsoft-snapshot-save',
                TGS_HTSOFT_RECON_PLUGIN_URL . 'assets/js/snapshot-save.js',
                array('jquery', 'tgs-htsoft-recon'),
                file_exists($save_js) ? filemtime($save_js) : TGS_HTSOFT_RECON_VERSION,
                true
            );

            wp_enqueue_style(
                'tgs-htsoft-compare-report',
                TGS_HTSOFT_RECON_PLUGIN_URL . 'assets/css/compare-report.css',
                array(),
                file_exists($css_path) ? filemtime($css_path) : TGS_HTSOFT_RECON_VERSION
            );

            wp_localize_script('tgs-htsoft-snapshot-save', 'tgsHtsoftSnapshot', self::js_config());
            return;
        }

        if ($view !== self::VIEW_REPORT) {
            return;
        }

        $js_path  = TGS_HTSOFT_RECON_PLUGIN_DIR . 'assets/js/compare-report.js';
        $css_path = TGS_HTSOFT_RECON_PLUGIN_DIR . 'assets/css/compare-report.css';

        wp_enqueue_script(
            'tgs-htsoft-compare-report',
            TGS_HTSOFT_RECON_PLUGIN_URL . 'assets/js/compare-report.js',
            array('jquery'),
            file_exists($js_path) ? filemtime($js_path) : TGS_HTSOFT_RECON_VERSION,
            true
        );

        wp_enqueue_style(
            'tgs-htsoft-compare-report',
            TGS_HTSOFT_RECON_PLUGIN_URL . 'assets/css/compare-report.css',
            array(),
            file_exists($css_path) ? filemtime($css_path) : TGS_HTSOFT_RECON_VERSION
        );

        wp_localize_script('tgs-htsoft-compare-report', 'tgsHtsoftReport', self::js_config());
    }

    private static function js_config() {
        global $wpdb;

        $blog_id = get_current_blog_id();
        $my_site_code = $wpdb->get_var($wpdb->prepare(
            "SELECT tgs_site_code FROM {$wpdb->blogs} WHERE blog_id = %d",
            $blog_id
        ));

        return array(
            'ajaxUrl'    => admin_url('admin-ajax.php'),
            'nonce'      => wp_create_nonce(self::NONCE_ACTION),
            'mySiteCode' => $my_site_code ? (string) $my_site_code : '',
            'canManage'  => current_user_can('manage_options') ? 1 : 0,
            'reportUrl'  => admin_url('admin.php?page=tgs-shop-management&view=' . self::VIEW_REPORT),
        );
    }

    /* ---------------------------------------------------------------------
     * Kiểm tra quyền
     * ------------------------------------------------------------------ */

    private static function guard_read() {
        check_ajax_referer(self::NONCE_ACTION, 'nonce');
        if (!is_user_logged_in()) {
            wp_send_json_error(array('message' => 'Bạn cần đăng nhập để xem báo cáo này'));
        }
    }

    private static function guard_write() {
        check_ajax_referer(self::NONCE_ACTION, 'nonce');
        if (!current_user_can('manage_options')) {
            wp_send_json_error(array('message' => 'Chỉ quản trị mới được lưu/xoá phiên đối chiếu'));
        }
    }

    private static function current_user_name() {
        $user = wp_get_current_user();
        if (!$user || !$user->exists()) {
            return 'khách';
        }
        return $user->display_name !== '' ? $user->display_name : $user->user_login;
    }

    /* ---------------------------------------------------------------------
     * Ghi snapshot
     * ------------------------------------------------------------------ */

    /**
     * Mở 1 phiên quét mới. JS gọi 1 lần trước khi đẩy từng shop lên.
     */
    public static function ajax_start() {
        self::guard_write();

        global $wpdb;

        try {
            $now = current_time('mysql');
            $scan_date = date('Y-m-d', strtotime($now));

            $label = isset($_POST['label']) ? sanitize_text_field(wp_unslash($_POST['label'])) : '';
            if ($label === '') {
                $label = 'Quét lúc ' . date_i18n('H:i d/m/Y', strtotime($now));
            }

            $htsoft_export_at = self::parse_datetime(isset($_POST['htsoft_export_at']) ? wp_unslash($_POST['htsoft_export_at']) : '');

            $snapshot_code = self::generate_code($scan_date);

            $inserted = $wpdb->insert(TGS_HTSOFT_Snapshot_DB::table_snapshot(), array(
                'snapshot_code'    => $snapshot_code,
                'label'            => $label,
                'scan_date'        => $scan_date,
                'htsoft_export_at' => $htsoft_export_at,
                'scanned_at'       => $now,
                'source_file'      => isset($_POST['source_file']) ? sanitize_text_field(wp_unslash($_POST['source_file'])) : '',
                'sheet_name'       => isset($_POST['sheet_name']) ? sanitize_text_field(wp_unslash($_POST['sheet_name'])) : '',
                'admin_note'       => isset($_POST['admin_note']) ? sanitize_textarea_field(wp_unslash($_POST['admin_note'])) : '',
                'status'           => 'running',
                'created_by'       => get_current_user_id(),
                'created_by_name'  => self::current_user_name(),
                'created_at'       => $now,
                'updated_at'       => $now,
            ));

            if (!$inserted) {
                throw new Exception('Không tạo được phiên đối chiếu: ' . $wpdb->last_error);
            }

            wp_send_json_success(array(
                'snapshot_id'   => intval($wpdb->insert_id),
                'snapshot_code' => $snapshot_code,
                'scan_date'     => $scan_date,
                'scanned_at'    => $now,
                'label'         => $label,
            ));
        } catch (Exception $e) {
            wp_send_json_error(array('message' => $e->getMessage()));
        }
    }

    /**
     * Đẩy dữ liệu 1 shop vào phiên. Gọi lần lượt từng shop để tránh vượt
     * giới hạn kích thước POST khi file Excel có hàng chục nghìn dòng.
     */
    public static function ajax_add_site() {
        self::guard_write();

        global $wpdb;

        try {
            $snapshot_id = intval($_POST['snapshot_id']);
            $snapshot = self::get_snapshot($snapshot_id);
            if (!$snapshot) {
                throw new Exception('Phiên đối chiếu không tồn tại');
            }

            $site_code = isset($_POST['site_code']) ? sanitize_text_field(wp_unslash($_POST['site_code'])) : '';
            $blog_id   = isset($_POST['blog_id']) ? intval($_POST['blog_id']) : 0;
            $site_name = isset($_POST['site_name']) ? sanitize_text_field(wp_unslash($_POST['site_name'])) : '';

            if ($site_code === '') {
                throw new Exception('Thiếu mã shop');
            }

            $comparison = isset($_POST['comparison']) ? json_decode(wp_unslash($_POST['comparison']), true) : null;
            if (!is_array($comparison)) {
                throw new Exception("Dữ liệu so sánh của shop {$site_code} không hợp lệ");
            }

            $sales_notes = isset($_POST['sales_notes']) ? json_decode(wp_unslash($_POST['sales_notes']), true) : array();
            if (!is_array($sales_notes)) {
                $sales_notes = array();
            }

            // Chuẩn hoá từng dòng: giữ cả 2 vế số liệu tại đúng thời điểm quét.
            $items = array();
            $diff_items = 0;
            $diff_plus = 0.0;
            $diff_minus = 0.0;

            foreach ($comparison as $row) {
                $diff = isset($row['diff']) ? floatval($row['diff']) : 0;
                $name = '';
                if (!empty($row['global_product_name'])) {
                    $name = $row['global_product_name'];
                } elseif (!empty($row['product_name'])) {
                    $name = $row['product_name'];
                }

                $items[] = array(
                    'sku'         => isset($row['sku']) ? (string) $row['sku'] : '',
                    'name'        => (string) $name,
                    'htsoft_qty'  => isset($row['excel_qty']) ? floatval($row['excel_qty']) : 0,
                    'system_qty'  => isset($row['system_qty']) ? floatval($row['system_qty']) : 0,
                    'diff'        => $diff,
                );

                if (abs($diff) > 0.01) {
                    $diff_items++;
                    if ($diff > 0) {
                        $diff_plus += $diff;
                    } else {
                        $diff_minus += $diff;
                    }
                }
            }

            $orders_count   = isset($_POST['orders_count']) ? intval($_POST['orders_count']) : 0;
            $revenue        = isset($_POST['revenue']) ? floatval($_POST['revenue']) : 0;
            $refund_amount  = isset($_POST['refund_amount']) ? floatval($_POST['refund_amount']) : 0;
            $net_revenue    = isset($_POST['net_revenue']) ? floatval($_POST['net_revenue']) : max(0, $revenue - $refund_amount);
            $has_activity   = ($orders_count > 0 || $net_revenue > 0) ? 1 : 0;

            $payload = array(
                'snapshot_code'    => $snapshot->snapshot_code,
                'snapshot_id'      => intval($snapshot->snapshot_id),
                'label'            => $snapshot->label,
                'scan_date'        => $snapshot->scan_date,
                // Hai mốc thời gian là phần quan trọng nhất của bản lưu vết.
                'htsoft_export_at' => $snapshot->htsoft_export_at,
                'scanned_at'       => $snapshot->scanned_at,
                'source_file'      => $snapshot->source_file,
                'sheet_name'       => $snapshot->sheet_name,
                'created_by'       => intval($snapshot->created_by),
                'created_by_name'  => $snapshot->created_by_name,
                'blog_id'          => $blog_id,
                'site_code'        => $site_code,
                'site_name'        => $site_name,
                'stats'            => array(
                    'total_items'    => count($items),
                    'diff_items'     => $diff_items,
                    'diff_qty_plus'  => round($diff_plus, 3),
                    'diff_qty_minus' => round($diff_minus, 3),
                    'orders_count'   => $orders_count,
                    'revenue'        => $revenue,
                    'refund_amount'  => $refund_amount,
                    'net_revenue'    => $net_revenue,
                    'has_activity'   => $has_activity,
                ),
                'items'            => $items,
                'sales_notes'      => $sales_notes,
            );

            $jsonl_file = '';
            if ($blog_id > 0) {
                $jsonl_file = TGS_HTSOFT_Snapshot_Store::append_snapshot($blog_id, $snapshot->scan_date, $payload);
            }

            $row_data = array(
                'snapshot_id'    => $snapshot_id,
                'blog_id'        => $blog_id,
                'site_code'      => $site_code,
                'site_name'      => $site_name,
                'total_items'    => count($items),
                'diff_items'     => $diff_items,
                'diff_qty_plus'  => round($diff_plus, 3),
                'diff_qty_minus' => round($diff_minus, 3),
                'orders_count'   => $orders_count,
                'revenue'        => $revenue,
                'refund_amount'  => $refund_amount,
                'net_revenue'    => $net_revenue,
                'has_activity'   => $has_activity,
                'jsonl_file'     => $jsonl_file,
                'scanned_at'     => $snapshot->scanned_at,
            );

            // Quét lại cùng 1 shop trong 1 phiên thì ghi đè dòng tóm tắt.
            $existing = $wpdb->get_var($wpdb->prepare(
                "SELECT row_id FROM " . TGS_HTSOFT_Snapshot_DB::table_site() . "
                 WHERE snapshot_id = %d AND site_code = %s",
                $snapshot_id,
                $site_code
            ));

            if ($existing) {
                $wpdb->update(TGS_HTSOFT_Snapshot_DB::table_site(), $row_data, array('row_id' => $existing));
            } else {
                $wpdb->insert(TGS_HTSOFT_Snapshot_DB::table_site(), $row_data);
            }

            wp_send_json_success(array(
                'site_code'  => $site_code,
                'diff_items' => $diff_items,
                'jsonl_file' => $jsonl_file,
                'saved'      => $jsonl_file !== '',
            ));
        } catch (Exception $e) {
            wp_send_json_error(array('message' => $e->getMessage()));
        }
    }

    /**
     * Chốt phiên: tổng hợp lại số liệu từ bảng shop.
     */
    public static function ajax_finish() {
        self::guard_write();

        global $wpdb;

        try {
            $snapshot_id = intval($_POST['snapshot_id']);
            $snapshot = self::get_snapshot($snapshot_id);
            if (!$snapshot) {
                throw new Exception('Phiên đối chiếu không tồn tại');
            }

            $t_site = TGS_HTSOFT_Snapshot_DB::table_site();
            $agg = $wpdb->get_row($wpdb->prepare(
                "SELECT COUNT(*) AS total_sites,
                        COALESCE(SUM(total_items), 0) AS total_items,
                        COALESCE(SUM(diff_items), 0) AS total_diff_items,
                        COALESCE(SUM(orders_count), 0) AS total_orders,
                        COALESCE(SUM(net_revenue), 0) AS total_revenue,
                        COALESCE(SUM(CASE WHEN has_activity = 0 THEN 1 ELSE 0 END), 0) AS sites_no_revenue
                 FROM {$t_site} WHERE snapshot_id = %d",
                $snapshot_id
            ));

            $wpdb->update(TGS_HTSOFT_Snapshot_DB::table_snapshot(), array(
                'total_sites'      => intval($agg->total_sites),
                'total_items'      => intval($agg->total_items),
                'total_diff_items' => intval($agg->total_diff_items),
                'total_orders'     => intval($agg->total_orders),
                'total_revenue'    => floatval($agg->total_revenue),
                'sites_no_revenue' => intval($agg->sites_no_revenue),
                'status'           => 'done',
                'updated_at'       => current_time('mysql'),
            ), array('snapshot_id' => $snapshot_id));

            wp_send_json_success(array(
                'snapshot_id'      => $snapshot_id,
                'snapshot_code'    => $snapshot->snapshot_code,
                'total_sites'      => intval($agg->total_sites),
                'total_diff_items' => intval($agg->total_diff_items),
                'sites_no_revenue' => intval($agg->sites_no_revenue),
                'report_url'       => admin_url('admin.php?page=tgs-shop-management&view=' . self::VIEW_REPORT . '&snapshot=' . rawurlencode($snapshot->snapshot_code)),
            ));
        } catch (Exception $e) {
            wp_send_json_error(array('message' => $e->getMessage()));
        }
    }

    public static function ajax_delete() {
        self::guard_write();

        global $wpdb;

        $snapshot_id = intval($_POST['snapshot_id']);
        if ($snapshot_id <= 0) {
            wp_send_json_error(array('message' => 'Thiếu mã phiên'));
        }

        // Chỉ ẩn dòng tóm tắt; file JSONL lưu vết giữ nguyên để còn truy ngược.
        $wpdb->update(
            TGS_HTSOFT_Snapshot_DB::table_snapshot(),
            array('is_deleted' => 1, 'updated_at' => current_time('mysql')),
            array('snapshot_id' => $snapshot_id)
        );

        wp_send_json_success(array('snapshot_id' => $snapshot_id));
    }

    /* ---------------------------------------------------------------------
     * Đọc báo cáo
     * ------------------------------------------------------------------ */

    /**
     * Danh sách lần quét, mới nhất lên đầu.
     *
     * Quét nhiều lần mỗi ngày nên sau vài tháng số bản ghi rất lớn. Vì vậy:
     *  - Không chọn ngày: chỉ trả về N lần quét gần nhất, kèm số lần quét cũ hơn
     *    để giao diện gợi ý người dùng lọc theo ngày.
     *  - Có chọn ngày: trả về trọn vẹn các lần quét của đúng ngày đó.
     * Luôn kèm danh sách ngày CÓ dữ liệu để dropdown ngày không bao giờ dẫn tới
     * một ngày rỗng.
     */
    public static function ajax_snapshots() {
        self::guard_read();

        global $wpdb;

        $limit = isset($_POST['limit']) ? min(200, max(1, intval($_POST['limit']))) : 60;
        $date  = isset($_POST['date']) ? sanitize_text_field(wp_unslash($_POST['date'])) : '';
        $has_date = (bool) preg_match('/^\d{4}-\d{2}-\d{2}$/', $date);

        $t = TGS_HTSOFT_Snapshot_DB::table_snapshot();
        $base_where = "is_deleted = 0 AND status = 'done'";

        // Các ngày có dữ liệu, kèm số lần quét trong ngày.
        $dates = $wpdb->get_results(
            "SELECT scan_date, COUNT(*) AS scan_count, MAX(scanned_at) AS last_scan
             FROM {$t}
             WHERE {$base_where}
             GROUP BY scan_date
             ORDER BY scan_date DESC
             LIMIT 90"
        );

        $date_list = array();
        foreach ((array) $dates as $row) {
            $date_list[] = array(
                'scan_date'  => $row->scan_date,
                'scan_count' => intval($row->scan_count),
                'last_scan'  => $row->last_scan,
            );
        }

        if ($has_date) {
            $rows = $wpdb->get_results($wpdb->prepare(
                "SELECT * FROM {$t} WHERE {$base_where} AND scan_date = %s ORDER BY scanned_at DESC",
                $date
            ));
        } else {
            $rows = $wpdb->get_results($wpdb->prepare(
                "SELECT * FROM {$t} WHERE {$base_where} ORDER BY scanned_at DESC LIMIT %d",
                $limit
            ));
        }

        $snapshots = array();
        foreach ((array) $rows as $row) {
            $snapshots[] = self::format_snapshot($row);
        }

        $total = intval($wpdb->get_var("SELECT COUNT(*) FROM {$t} WHERE {$base_where}"));

        wp_send_json_success(array(
            'snapshots'   => $snapshots,
            'dates'       => $date_list,
            'total'       => $total,
            'older_count' => $has_date ? 0 : max(0, $total - count($snapshots)),
            'filtered'    => $has_date ? $date : '',
        ));
    }

    /**
     * Toàn cảnh 1 phiên: danh sách shop + shop chưa phát sinh doanh thu +
     * shop có trong hệ thống nhưng HTSOFT không xuất ra.
     */
    public static function ajax_overview() {
        self::guard_read();

        global $wpdb;

        try {
            $snapshot = self::resolve_snapshot_from_request();

            $t_site = TGS_HTSOFT_Snapshot_DB::table_site();
            $t_note = TGS_HTSOFT_Snapshot_DB::table_note();

            $rows = $wpdb->get_results($wpdb->prepare(
                "SELECT s.*,
                        (SELECT COUNT(*) FROM {$t_note} n
                          WHERE n.snapshot_id = s.snapshot_id
                            AND n.site_code = s.site_code
                            AND n.note_text <> '') AS note_count
                 FROM {$t_site} s
                 WHERE s.snapshot_id = %d
                 ORDER BY s.diff_items DESC, s.site_code ASC",
                $snapshot->snapshot_id
            ));

            $sites = array();
            $covered = array();
            foreach ((array) $rows as $row) {
                $covered[$row->site_code] = true;
                $sites[] = array(
                    'site_code'      => $row->site_code,
                    'site_name'      => $row->site_name,
                    'blog_id'        => intval($row->blog_id),
                    'total_items'    => intval($row->total_items),
                    'diff_items'     => intval($row->diff_items),
                    'diff_qty_plus'  => floatval($row->diff_qty_plus),
                    'diff_qty_minus' => floatval($row->diff_qty_minus),
                    'orders_count'   => intval($row->orders_count),
                    'revenue'        => floatval($row->revenue),
                    'refund_amount'  => floatval($row->refund_amount),
                    'net_revenue'    => floatval($row->net_revenue),
                    'has_activity'   => intval($row->has_activity),
                    'note_count'     => intval($row->note_count),
                );
            }

            // Shop có mã trong hệ thống nhưng không nằm trong file Excel lần này.
            $missing = array();
            try {
                require_once TGS_HTSOFT_RECON_PLUGIN_DIR . 'includes/class-feedback-sites.php';
                foreach (TGS_HTSOFT_Feedback_Sites::get_all_shops() as $shop) {
                    if (!isset($covered[$shop['site_code']])) {
                        $missing[] = array(
                            'site_code' => $shop['site_code'],
                            'site_name' => $shop['site_name'],
                            'blog_id'   => $shop['blog_id'],
                        );
                    }
                }
            } catch (Exception $e) {
                $missing = array();
            }

            wp_send_json_success(array(
                'snapshot' => self::format_snapshot($snapshot),
                'sites'    => $sites,
                'missing'  => $missing,
            ));
        } catch (Exception $e) {
            wp_send_json_error(array('message' => $e->getMessage()));
        }
    }

    /**
     * Chi tiết 1 shop trong 1 phiên: đọc lại từ JSONL đúng bức ảnh lúc quét.
     */
    public static function ajax_site_detail() {
        self::guard_read();

        global $wpdb;

        try {
            $snapshot = self::resolve_snapshot_from_request();
            $site_code = isset($_POST['site_code']) ? sanitize_text_field(wp_unslash($_POST['site_code'])) : '';

            $site_row = $wpdb->get_row($wpdb->prepare(
                "SELECT * FROM " . TGS_HTSOFT_Snapshot_DB::table_site() . "
                 WHERE snapshot_id = %d AND site_code = %s",
                $snapshot->snapshot_id,
                $site_code
            ));

            if (!$site_row) {
                throw new Exception("Phiên này không có dữ liệu của shop {$site_code}");
            }

            $detail = TGS_HTSOFT_Snapshot_Store::read_snapshot(
                intval($site_row->blog_id),
                $snapshot->scan_date,
                $snapshot->snapshot_code
            );

            if (!$detail) {
                throw new Exception('Không đọc được file lưu vết của shop này (có thể đã bị dọn dẹp)');
            }

            // Ghi chú hiện hành: 1 ghi chú chung + ghi chú theo từng SKU.
            $notes = $wpdb->get_results($wpdb->prepare(
                "SELECT note_scope, sku, note_text, updated_by_name, updated_at
                 FROM " . TGS_HTSOFT_Snapshot_DB::table_note() . "
                 WHERE snapshot_id = %d AND site_code = %s",
                $snapshot->snapshot_id,
                $site_code
            ));

            $site_note = array('text' => '', 'by' => '', 'at' => '');
            $item_notes = array();
            foreach ((array) $notes as $note) {
                $entry = array(
                    'text' => (string) $note->note_text,
                    'by'   => (string) $note->updated_by_name,
                    'at'   => (string) $note->updated_at,
                );
                if ($note->note_scope === 'site') {
                    $site_note = $entry;
                } else {
                    $item_notes[$note->sku] = $entry;
                }
            }

            wp_send_json_success(array(
                'snapshot'   => self::format_snapshot($snapshot),
                'site'       => array(
                    'site_code'    => $site_row->site_code,
                    'site_name'    => $site_row->site_name,
                    'blog_id'      => intval($site_row->blog_id),
                    'has_activity' => intval($site_row->has_activity),
                ),
                'stats'       => isset($detail['stats']) ? $detail['stats'] : array(),
                'items'       => isset($detail['items']) ? $detail['items'] : array(),
                'sales_notes' => isset($detail['sales_notes']) ? $detail['sales_notes'] : array(),
                'site_note'   => $site_note,
                'item_notes'  => $item_notes,
            ));
        } catch (Exception $e) {
            wp_send_json_error(array('message' => $e->getMessage()));
        }
    }

    /**
     * Tự động lưu ghi chú (JS gọi khi người dùng ngừng gõ).
     * Bảng giữ bản mới nhất, JSONL giữ toàn bộ nhật ký thay đổi.
     */
    public static function ajax_save_note() {
        self::guard_read();

        global $wpdb;

        try {
            $snapshot = self::resolve_snapshot_from_request();

            $site_code = isset($_POST['site_code']) ? sanitize_text_field(wp_unslash($_POST['site_code'])) : '';
            $scope = isset($_POST['scope']) && $_POST['scope'] === 'item' ? 'item' : 'site';
            $sku = ($scope === 'item' && isset($_POST['sku'])) ? sanitize_text_field(wp_unslash($_POST['sku'])) : '';
            $text = isset($_POST['note_text']) ? sanitize_textarea_field(wp_unslash($_POST['note_text'])) : '';

            if ($scope === 'item' && $sku === '') {
                throw new Exception('Thiếu mã hàng cho ghi chú dòng');
            }

            $t_site = TGS_HTSOFT_Snapshot_DB::table_site();
            $site_row = $wpdb->get_row($wpdb->prepare(
                "SELECT blog_id, site_name FROM {$t_site} WHERE snapshot_id = %d AND site_code = %s",
                $snapshot->snapshot_id,
                $site_code
            ));

            if (!$site_row) {
                throw new Exception("Shop {$site_code} không có trong phiên này");
            }

            $t_note = TGS_HTSOFT_Snapshot_DB::table_note();
            $now = current_time('mysql');
            $user_name = self::current_user_name();

            $existing = $wpdb->get_row($wpdb->prepare(
                "SELECT note_id, note_text FROM {$t_note}
                 WHERE snapshot_id = %d AND site_code = %s AND note_scope = %s AND sku = %s",
                $snapshot->snapshot_id,
                $site_code,
                $scope,
                $sku
            ));

            $old_text = $existing ? (string) $existing->note_text : '';
            if ($old_text === $text) {
                wp_send_json_success(array('unchanged' => true, 'at' => $now, 'by' => $user_name));
            }

            if ($existing) {
                $wpdb->update($t_note, array(
                    'note_text'       => $text,
                    'updated_by'      => get_current_user_id(),
                    'updated_by_name' => $user_name,
                    'updated_at'      => $now,
                ), array('note_id' => $existing->note_id));
            } else {
                $wpdb->insert($t_note, array(
                    'snapshot_id'     => $snapshot->snapshot_id,
                    'blog_id'         => intval($site_row->blog_id),
                    'site_code'       => $site_code,
                    'note_scope'      => $scope,
                    'sku'             => $sku,
                    'note_text'       => $text,
                    'updated_by'      => get_current_user_id(),
                    'updated_by_name' => $user_name,
                    'created_at'      => $now,
                    'updated_at'      => $now,
                ));
            }

            // Nhật ký append-only: giữ cả nội dung cũ để đối chiếu về sau.
            TGS_HTSOFT_Snapshot_Store::append_note_log(intval($site_row->blog_id), array(
                'at'            => $now,
                'snapshot_code' => $snapshot->snapshot_code,
                'snapshot_id'   => intval($snapshot->snapshot_id),
                'scan_date'     => $snapshot->scan_date,
                'site_code'     => $site_code,
                'site_name'     => $site_row->site_name,
                'scope'         => $scope,
                'sku'           => $sku,
                'action'        => $old_text === '' ? 'create' : ($text === '' ? 'clear' : 'update'),
                'old_text'      => $old_text,
                'new_text'      => $text,
                'user_id'       => get_current_user_id(),
                'user_name'     => $user_name,
                'from_blog_id'  => get_current_blog_id(),
            ));

            wp_send_json_success(array(
                'saved' => true,
                'at'    => $now,
                'by'    => $user_name,
                'scope' => $scope,
                'sku'   => $sku,
            ));
        } catch (Exception $e) {
            wp_send_json_error(array('message' => $e->getMessage()));
        }
    }

    /**
     * Nhật ký thay đổi ghi chú của 1 shop (đọc từ JSONL).
     */
    public static function ajax_note_history() {
        self::guard_read();

        global $wpdb;

        try {
            $snapshot_code = isset($_POST['snapshot_code']) ? sanitize_text_field(wp_unslash($_POST['snapshot_code'])) : '';
            $site_code = isset($_POST['site_code']) ? sanitize_text_field(wp_unslash($_POST['site_code'])) : '';
            $all_snapshots = !empty($_POST['all_snapshots']);
            $sku = isset($_POST['sku']) ? sanitize_text_field(wp_unslash($_POST['sku'])) : '';

            $blog_id = intval($wpdb->get_var($wpdb->prepare(
                "SELECT blog_id FROM " . TGS_HTSOFT_Snapshot_DB::table_site() . "
                 WHERE site_code = %s ORDER BY row_id DESC LIMIT 1",
                $site_code
            )));

            if ($blog_id <= 0) {
                throw new Exception("Không tìm thấy shop {$site_code}");
            }

            $filter = array('months' => 6);
            if (!$all_snapshots) {
                $filter['snapshot_code'] = $snapshot_code;
            }
            if ($sku !== '') {
                $filter['sku'] = $sku;
            }

            $entries = TGS_HTSOFT_Snapshot_Store::read_note_log($blog_id, $filter);

            wp_send_json_success(array(
                'entries' => array_slice($entries, 0, 200),
                'total'   => count($entries),
            ));
        } catch (Exception $e) {
            wp_send_json_error(array('message' => $e->getMessage()));
        }
    }

    /**
     * Tồn THỰC TẾ HIỆN TẠI của shop, tính lại ngay lúc bấm - chỉ để tham khảo.
     *
     * Khác hẳn cột "Tồn hệ thống" trong bảng: cột kia là ảnh chụp đóng băng lúc
     * quét, còn cột này là số sống ở thời điểm mở báo cáo. Chênh lệch giữa hai
     * cột chính là phần shop đã nhập/bán/điều chỉnh sau giờ quét, nên nhiều
     * dòng "lệch" lúc quét đến giờ có thể đã tự khớp.
     *
     * KHÔNG ghi đè dữ liệu lưu vết: chỉ đọc và trả về.
     */
    public static function ajax_live_stock() {
        self::guard_read();

        global $wpdb;

        try {
            $site_code = isset($_POST['site_code']) ? sanitize_text_field(wp_unslash($_POST['site_code'])) : '';
            $skus = isset($_POST['skus']) ? json_decode(wp_unslash($_POST['skus']), true) : null;

            if (!is_array($skus) || empty($skus)) {
                throw new Exception('Chưa có mã hàng nào để tra tồn');
            }

            // Chặn request quá nặng; phía JS đã tự chia lô nhỏ hơn mức này.
            if (count($skus) > 1000) {
                $skus = array_slice($skus, 0, 1000);
            }

            $blog_id = intval($wpdb->get_var($wpdb->prepare(
                "SELECT blog_id FROM " . TGS_HTSOFT_Snapshot_DB::table_site() . "
                 WHERE site_code = %s AND blog_id > 0
                 ORDER BY row_id DESC LIMIT 1",
                $site_code
            )));

            if ($blog_id <= 0) {
                throw new Exception("Không tìm thấy website của shop {$site_code}");
            }

            $items = array();
            foreach ($skus as $sku) {
                $items[] = array('sku' => (string) $sku);
            }

            $calculator = new TGS_HTSOFT_Inventory_Calculator($blog_id);
            $inventory = $calculator->calculate_inventory($items);

            // SKU không có dòng sổ nào thì tồn = 0, phải trả về đủ để JS không
            // hiểu nhầm là "chưa tra được".
            $stock = array();
            foreach ($skus as $sku) {
                $sku = (string) $sku;
                $stock[$sku] = isset($inventory[$sku]) ? floatval($inventory[$sku]['quantity']) : 0;
            }

            wp_send_json_success(array(
                'stock' => $stock,
                'at'    => current_time('mysql'),
                'count' => count($stock),
            ));
        } catch (Exception $e) {
            wp_send_json_error(array('message' => $e->getMessage()));
        }
    }

    /* ---------------------------------------------------------------------
     * Helper
     * ------------------------------------------------------------------ */

    private static function get_snapshot($snapshot_id) {
        global $wpdb;
        return $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM " . TGS_HTSOFT_Snapshot_DB::table_snapshot() . " WHERE snapshot_id = %d",
            intval($snapshot_id)
        ));
    }

    /**
     * Nhận snapshot_code hoặc snapshot_id từ request; không có thì lấy phiên
     * mới nhất đã chốt.
     */
    private static function resolve_snapshot_from_request() {
        global $wpdb;

        $t = TGS_HTSOFT_Snapshot_DB::table_snapshot();

        if (!empty($_POST['snapshot_code'])) {
            $code = sanitize_text_field(wp_unslash($_POST['snapshot_code']));
            $row = $wpdb->get_row($wpdb->prepare(
                "SELECT * FROM {$t} WHERE snapshot_code = %s AND is_deleted = 0",
                $code
            ));
        } elseif (!empty($_POST['snapshot_id'])) {
            $row = $wpdb->get_row($wpdb->prepare(
                "SELECT * FROM {$t} WHERE snapshot_id = %d AND is_deleted = 0",
                intval($_POST['snapshot_id'])
            ));
        } else {
            $row = $wpdb->get_row(
                "SELECT * FROM {$t} WHERE is_deleted = 0 AND status = 'done' ORDER BY scanned_at DESC LIMIT 1"
            );
        }

        if (!$row) {
            throw new Exception('Chưa có phiên đối chiếu nào được lưu');
        }

        return $row;
    }

    private static function format_snapshot($row) {
        return array(
            'snapshot_id'      => intval($row->snapshot_id),
            'snapshot_code'    => $row->snapshot_code,
            'label'            => $row->label,
            'scan_date'        => $row->scan_date,
            'htsoft_export_at' => $row->htsoft_export_at,
            'scanned_at'       => $row->scanned_at,
            'source_file'      => $row->source_file,
            'sheet_name'       => $row->sheet_name,
            'admin_note'       => (string) $row->admin_note,
            'total_sites'      => intval($row->total_sites),
            'total_items'      => intval($row->total_items),
            'total_diff_items' => intval($row->total_diff_items),
            'total_orders'     => intval($row->total_orders),
            'total_revenue'    => floatval($row->total_revenue),
            'sites_no_revenue' => intval($row->sites_no_revenue),
            'created_by_name'  => $row->created_by_name,
            'status'           => $row->status,
        );
    }

    /**
     * Mã phiên: đọc được bằng mắt + không đụng nhau khi quét nhiều lần/ngày.
     */
    private static function generate_code($scan_date) {
        return 'SN' . str_replace('-', '', $scan_date) . '-' . date_i18n('His') . '-' . wp_generate_password(4, false, false);
    }

    /**
     * Nhận datetime-local ("2026-07-30T20:47") hoặc "Y-m-d H:i:s".
     */
    private static function parse_datetime($value) {
        $value = trim((string) $value);
        if ($value === '') {
            return null;
        }

        $ts = strtotime(str_replace('T', ' ', $value));
        if (!$ts) {
            return null;
        }

        return date('Y-m-d H:i:s', $ts);
    }
}
