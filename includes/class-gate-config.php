<?php
/**
 * Class TGS_HTSOFT_Gate_Config
 *
 * Màn hình cấu hình "chặn bán hàng khi chưa giải trình chênh lệch".
 *
 * Việc CHẶN do plugin tgs_pos thực hiện; ở đây chỉ đọc/ghi cấu hình. Hai plugin
 * gặp nhau đúng một chỗ: tên option mạng `tgs_pos_recon_gate_config`. Không bên
 * nào gọi class của bên kia, nên tắt plugin này thì tgs_pos vẫn chạy bằng cấu
 * hình đã lưu.
 *
 * Tình huống dùng nhiều nhất: một shop bị chặn nhưng cần ưu tiên bán hàng —
 * quản trị tắt riêng shop đó, tự tìm nguyên nhân và cân giúp họ sau.
 */

if (!defined('ABSPATH')) {
    exit;
}

class TGS_HTSOFT_Gate_Config {

    const OPTION      = 'tgs_pos_recon_gate_config';
    const NONCE       = 'tgs_htsoft_gate_config';
    const PAGE_HOOK   = 'toplevel_page_tgs-shop-management';
    const PAGE_VIEW   = 'htsoft-reconciliation';

    public static function init() {
        add_action('admin_enqueue_scripts', array(__CLASS__, 'enqueue_assets'), 21);
        add_action('admin_footer', array(__CLASS__, 'render_modal'));
        add_action('wp_ajax_tgs_htsoft_gate_config_get', array(__CLASS__, 'ajax_get'));
        add_action('wp_ajax_tgs_htsoft_gate_config_save', array(__CLASS__, 'ajax_save'));
    }

    private static function is_target_screen($hook = '') {
        if ($hook !== '' && $hook !== self::PAGE_HOOK) {
            return false;
        }

        if ($hook === '') {
            $screen = function_exists('get_current_screen') ? get_current_screen() : null;
            if (!$screen || $screen->id !== self::PAGE_HOOK) {
                return false;
            }
        }

        $view = isset($_GET['view']) ? sanitize_text_field(wp_unslash($_GET['view'])) : '';
        return $view === self::PAGE_VIEW;
    }

    public static function enqueue_assets($hook) {
        if (!self::is_target_screen($hook) || !current_user_can('manage_options')) {
            return;
        }

        $js = TGS_HTSOFT_RECON_PLUGIN_DIR . 'assets/js/gate-config.js';

        wp_enqueue_script(
            'tgs-htsoft-gate-config',
            TGS_HTSOFT_RECON_PLUGIN_URL . 'assets/js/gate-config.js',
            array('jquery'),
            file_exists($js) ? filemtime($js) : TGS_HTSOFT_RECON_VERSION,
            true
        );

        wp_localize_script('tgs-htsoft-gate-config', 'tgsHtsoftGateConfig', array(
            'ajaxUrl'     => admin_url('admin-ajax.php'),
            'nonce'       => wp_create_nonce(self::NONCE),
            'windowStart' => '06:30',
            'windowEnd'   => '20:00',
        ));
    }

    public static function render_modal() {
        if (!self::is_target_screen() || !current_user_can('manage_options')) {
            return;
        }
        require_once TGS_HTSOFT_RECON_PLUGIN_DIR . 'admin-views/gate-config-modal.php';
    }

    /**
     * Cấu hình hiện tại + danh sách shop để dựng bảng chọn.
     * Giữ nguyên bộ mặc định giống hệt phía tgs_pos để hai bên không lệch nhau.
     */
    public static function get_config() {
        $saved = get_site_option(self::OPTION, array());
        if (!is_array($saved)) {
            $saved = array();
        }

        $config = array_merge(array(
            'enabled'     => 1,
            'scope'       => 'all',
            'sites'       => array(),
            'force_hours' => 0,
            'updated_at'  => '',
            'updated_by'  => '',
        ), $saved);

        $config['enabled']     = (int) $config['enabled'];
        $config['force_hours'] = (int) $config['force_hours'];
        $config['scope']       = $config['scope'] === 'selected' ? 'selected' : 'all';
        $config['sites']       = array_map('intval', (array) $config['sites']);

        return $config;
    }

    public static function ajax_get() {
        check_ajax_referer(self::NONCE, 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error(array('message' => 'Bạn không có quyền xem cấu hình này'));
        }

        try {
            require_once TGS_HTSOFT_RECON_PLUGIN_DIR . 'includes/class-feedback-sites.php';
            $shops = TGS_HTSOFT_Feedback_Sites::get_all_shops();
        } catch (Exception $e) {
            $shops = array();
        }

        wp_send_json_success(array(
            'config' => self::get_config(),
            'shops'  => $shops,
        ));
    }

    public static function ajax_save() {
        check_ajax_referer(self::NONCE, 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error(array('message' => 'Bạn không có quyền sửa cấu hình này'));
        }

        $sites = isset($_POST['sites']) ? json_decode(wp_unslash($_POST['sites']), true) : array();
        if (!is_array($sites)) {
            $sites = array();
        }

        $sites = array_values(array_unique(array_filter(array_map('intval', $sites), function ($id) {
            return $id > 0;
        })));

        $user = wp_get_current_user();

        $config = array(
            'enabled'     => !empty($_POST['enabled']) && $_POST['enabled'] !== '0' ? 1 : 0,
            'scope'       => (isset($_POST['scope']) && $_POST['scope'] === 'selected') ? 'selected' : 'all',
            'sites'       => $sites,
            'force_hours' => !empty($_POST['force_hours']) && $_POST['force_hours'] !== '0' ? 1 : 0,
            'updated_at'  => current_time('mysql'),
            'updated_by'  => $user && $user->exists() ? $user->display_name : '',
        );

        update_site_option(self::OPTION, $config);

        wp_send_json_success(array(
            'config'  => $config,
            'message' => 'Đã lưu cấu hình. Các shop sẽ áp dụng ngay ở lần mở trang tiếp theo.',
        ));
    }
}
