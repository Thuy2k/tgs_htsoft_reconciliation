<?php

/**
 * Class TGS_HTSOFT_Task_Export
 *
 * XUẤT EXCEL DANH SÁCH TASK — lọc từ feedback khảo sát BTsoft.
 *
 * Khác hẳn module Feedback bên cạnh, đừng nhầm hai cái:
 *
 *   TGS_HTSOFT_Feedback_Module  xuất PHIẾU KHẢO SÁT TRỐNG gửi cho shop điền
 *   TGS_HTSOFT_Task_Export      xuất DANH SÁCH VIỆC đã lọc từ feedback nhận về
 *
 * Tức một cái đi ra, một cái đi vào rồi thành việc.
 *
 * File xuất ra để trưởng nhóm chia việc và theo dõi tiến độ, nên có tô màu
 * theo trạng thái và theo độ khó — nhìn một cái thấy ngay việc nào chưa ai làm.
 *
 * @package tgs_htsoft_reconciliation
 */

if (!defined('ABSPATH')) {
    exit;
}

class TGS_HTSOFT_Task_Export
{
    const NONCE_ACTION = 'tgs_htsoft_task_nonce';
    const PAGE_HOOK    = 'toplevel_page_tgs-shop-management';
    const PAGE_VIEW    = 'htsoft-reconciliation';

    public static function init()
    {
        add_action('admin_enqueue_scripts', [__CLASS__, 'enqueue_assets'], 21);
        add_action('wp_ajax_tgs_htsoft_task_list', [__CLASS__, 'ajax_task_list']);
    }

    /** Chỉ nạp đúng trang Đối chiếu HTSOFT, không làm nặng trang khác */
    private static function is_target_screen($hook = '')
    {
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

    public static function enqueue_assets($hook)
    {
        if (!self::is_target_screen($hook)) {
            return;
        }

        $js = TGS_HTSOFT_RECON_PLUGIN_DIR . 'assets/js/task-export.js';

        /*
         * Phụ thuộc 'tgs-htsoft-feedback' để nút mới xuất hiện SAU nút khảo sát
         * trong cùng hàng — hai nút cùng chỗ nên thứ tự nạp quyết định thứ tự
         * hiển thị.
         */
        wp_enqueue_script(
            'tgs-htsoft-task-export',
            TGS_HTSOFT_RECON_PLUGIN_URL . 'assets/js/task-export.js',
            ['jquery', 'tgs-htsoft-feedback'],
            file_exists($js) ? filemtime($js) : TGS_HTSOFT_RECON_VERSION,
            true
        );

        wp_localize_script('tgs-htsoft-task-export', 'tgsHtsoftTask', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce'   => wp_create_nonce(self::NONCE_ACTION),
        ]);
    }

    /**
     * AJAX: trả về danh sách task đã lọc.
     *
     * Gửi kèm nhãn hiển thị để JS khỏi phải giữ bản sao thứ hai của bảng nhãn —
     * lệch nhãn giữa hai nơi là kiểu lỗi rất khó nhìn ra.
     */
    public static function ajax_task_list()
    {
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

        if (!is_user_logged_in()) {
            wp_send_json_error(['message' => 'Bạn không có quyền thực hiện thao tác này']);
        }

        require_once TGS_HTSOFT_RECON_PLUGIN_DIR . 'includes/data/feedback-tasks.php';

        $tasks = tgs_htsoft_feedback_tasks();

        if (empty($tasks)) {
            wp_send_json_error(['message' => 'Chưa có task nào trong danh sách']);
        }

        $dem = ['xong' => 0, 'dang_lam' => 0, 'chua_lam' => 0];
        foreach ($tasks as $t) {
            $key = $t['trang_thai'];
            if (isset($dem[$key])) {
                $dem[$key]++;
            }
        }

        wp_send_json_success([
            'tasks'  => $tasks,
            'tong'   => count($tasks),
            'dem'    => $dem,
            'nhan'   => [
                'xong'     => 'Đã xong',
                'dang_lam' => 'Đang làm',
                'chua_lam' => 'Chưa làm',
            ],
            'nguon'  => 'Khảo sát BTsoft — 52 feedback tiếp nhận 05/08/2026',
            'ngay_xuat' => date_i18n('d/m/Y H:i'),
        ]);
    }
}
