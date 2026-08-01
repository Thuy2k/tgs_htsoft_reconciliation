<?php
/**
 * Class TGS_HTSOFT_Action_Guard
 *
 * Chặn nhầm tay ở những nút gây hậu quả thật, không hoàn tác được:
 *  - Cấu hình chặn bán hàng (sai một tick là khoá/mở nhầm cả hệ thống)
 *  - Tự cân hàng tất cả (tạo phiếu điều chỉnh cho hàng loạt shop)
 *  - Tạo phiếu điều chỉnh của từng shop
 *
 * Mật khẩu KHÔNG nằm trong JS: trình duyệt chỉ gửi chuỗi người dùng gõ lên và
 * nhận về đúng/sai, nên xem mã nguồn trang cũng không đọc được.
 *
 * Đây là lớp chống nhầm tay, không thay cho phân quyền: mọi AJAX nguy hiểm vẫn
 * phải tự kiểm tra quyền của người dùng.
 */

if (!defined('ABSPATH')) {
    exit;
}

class TGS_HTSOFT_Action_Guard {

    const NONCE      = 'tgs_htsoft_action_guard';
    const OPTION     = 'tgs_htsoft_action_password';
    const DEFAULT_PW = 'Thuy!@#';
    const PAGE_HOOK  = 'toplevel_page_tgs-shop-management';
    const PAGE_VIEW  = 'htsoft-reconciliation';

    public static function init() {
        add_action('admin_enqueue_scripts', array(__CLASS__, 'enqueue_assets'), 19);
        add_action('admin_footer', array(__CLASS__, 'render_modal'));
        add_action('wp_ajax_tgs_htsoft_guard_verify', array(__CLASS__, 'ajax_verify'));
    }

    /**
     * Mật khẩu đang dùng. Đổi được mà không sửa code:
     *   1. wp-config.php:  define('TGS_HTSOFT_ACTION_PASSWORD', '...');
     *   2. Site option 'tgs_htsoft_action_password'
     */
    private static function get_password() {
        if (defined('TGS_HTSOFT_ACTION_PASSWORD') && TGS_HTSOFT_ACTION_PASSWORD !== '') {
            return (string) TGS_HTSOFT_ACTION_PASSWORD;
        }

        $saved = get_site_option(self::OPTION, '');
        if (is_string($saved) && $saved !== '') {
            return $saved;
        }

        return self::DEFAULT_PW;
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
        if (!self::is_target_screen($hook)) {
            return;
        }

        $js = TGS_HTSOFT_RECON_PLUGIN_DIR . 'assets/js/action-guard.js';

        wp_enqueue_script(
            'tgs-htsoft-action-guard',
            TGS_HTSOFT_RECON_PLUGIN_URL . 'assets/js/action-guard.js',
            array('jquery'),
            file_exists($js) ? filemtime($js) : TGS_HTSOFT_RECON_VERSION,
            true
        );

        wp_localize_script('tgs-htsoft-action-guard', 'tgsHtsoftGuardCfg', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce'   => wp_create_nonce(self::NONCE),
        ));
    }

    public static function render_modal() {
        if (!self::is_target_screen()) {
            return;
        }
        require_once TGS_HTSOFT_RECON_PLUGIN_DIR . 'admin-views/action-guard-modal.php';
    }

    public static function ajax_verify() {
        check_ajax_referer(self::NONCE, 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error(array('message' => 'Bạn không có quyền thực hiện thao tác này'));
        }

        $input = isset($_POST['password']) ? (string) wp_unslash($_POST['password']) : '';

        // hash_equals: so sánh thời gian cố định, không để lộ độ dài đúng/sai
        // qua thời gian phản hồi.
        if (!hash_equals(self::get_password(), $input)) {
            wp_send_json_error(array('message' => 'Mật khẩu không đúng'));
        }

        wp_send_json_success(array('ok' => 1));
    }
}
