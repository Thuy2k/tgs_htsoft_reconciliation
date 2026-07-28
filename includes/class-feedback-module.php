<?php
/**
 * Class TGS_HTSOFT_Feedback_Module
 *
 * LUỒNG RIÊNG - Khảo sát feedback shop (BTsoft).
 *
 * Module này tách hoàn toàn khỏi luồng đối chiếu tồn kho:
 *  - Tự đăng ký asset riêng (feedback-export.js / feedback-export.css)
 *  - Tự đăng ký AJAX riêng (tgs_htsoft_feedback_sites)
 *  - Tự in modal cấu hình đợt khảo sát vào admin_footer
 *
 * Nút bấm nằm cạnh nút "Xuất Excel tất cả" nhưng KHÔNG dùng chung dữ liệu:
 * file khảo sát không quan tâm chênh lệch tồn kho, chỉ cần danh sách shop.
 */

if (!defined('ABSPATH')) {
    exit;
}

class TGS_HTSOFT_Feedback_Module {

    const NONCE_ACTION = 'tgs_htsoft_feedback_nonce';
    const PAGE_HOOK    = 'toplevel_page_tgs-shop-management';
    const PAGE_VIEW    = 'htsoft-reconciliation';

    public static function init() {
        add_action('admin_enqueue_scripts', array(__CLASS__, 'enqueue_assets'), 20);
        add_action('admin_footer', array(__CLASS__, 'render_modal'));
        add_action('wp_ajax_tgs_htsoft_feedback_sites', array(__CLASS__, 'ajax_get_shops'));
    }

    /**
     * Chỉ nạp asset đúng trang Đối chiếu HTSOFT.
     */
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

        $current_view = isset($_GET['view']) ? sanitize_text_field(wp_unslash($_GET['view'])) : '';
        return $current_view === self::PAGE_VIEW;
    }

    public static function enqueue_assets($hook) {
        if (!self::is_target_screen($hook)) {
            return;
        }

        $js_path  = TGS_HTSOFT_RECON_PLUGIN_DIR . 'assets/js/feedback-export.js';
        $css_path = TGS_HTSOFT_RECON_PLUGIN_DIR . 'assets/css/feedback-export.css';

        wp_enqueue_script(
            'tgs-htsoft-feedback',
            TGS_HTSOFT_RECON_PLUGIN_URL . 'assets/js/feedback-export.js',
            array('jquery', 'sheetjs'),
            file_exists($js_path) ? filemtime($js_path) : TGS_HTSOFT_RECON_VERSION,
            true
        );

        wp_enqueue_style(
            'tgs-htsoft-feedback',
            TGS_HTSOFT_RECON_PLUGIN_URL . 'assets/css/feedback-export.css',
            array(),
            file_exists($css_path) ? filemtime($css_path) : TGS_HTSOFT_RECON_VERSION
        );

        wp_localize_script('tgs-htsoft-feedback', 'tgsHtsoftFeedback', array(
            'ajaxUrl'    => admin_url('admin-ajax.php'),
            'nonce'      => wp_create_nonce(self::NONCE_ACTION),
            'defaultRound' => sprintf('Tháng %s/%s', date_i18n('m'), date_i18n('Y')),
            'defaultDeadline' => date_i18n('d/m/Y', strtotime('+7 days')),
        ));
    }

    /**
     * Modal cấu hình đợt khảo sát - in ở footer để không đụng vào view đối chiếu.
     */
    public static function render_modal() {
        if (!self::is_target_screen()) {
            return;
        }
        require_once TGS_HTSOFT_RECON_PLUGIN_DIR . 'admin-views/feedback-export-modal.php';
    }

    /**
     * AJAX: trả về danh sách toàn bộ shop để dựng tab Excel.
     */
    public static function ajax_get_shops() {
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

        if (!is_user_logged_in()) {
            wp_send_json_error(array('message' => 'Bạn không có quyền thực hiện thao tác này'));
        }

        try {
            require_once TGS_HTSOFT_RECON_PLUGIN_DIR . 'includes/class-feedback-sites.php';

            $shops = TGS_HTSOFT_Feedback_Sites::get_all_shops();

            if (empty($shops)) {
                throw new Exception('Không tìm thấy shop nào có mã website trong hệ thống');
            }

            wp_send_json_success(array(
                'shops' => $shops,
                'total' => count($shops),
            ));
        } catch (Exception $e) {
            wp_send_json_error(array('message' => $e->getMessage()));
        }
    }
}
