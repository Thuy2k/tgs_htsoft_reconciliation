<?php
/**
 * Class TGS_HTSOFT_Feedback_Sites
 *
 * LUỒNG RIÊNG - Khảo sát feedback shop.
 * Không liên quan tới luồng đối chiếu tồn kho: chỉ trả về danh sách toàn bộ
 * shop (website) đang hoạt động trong multisite kèm mã shop và tên shop, để
 * JS dựng file Excel khảo sát nhiều tab (mỗi tab = 1 shop).
 */

if (!defined('ABSPATH')) {
    exit;
}

class TGS_HTSOFT_Feedback_Sites {

    const COLUMN_SITE_CODE = 'tgs_site_code';

    /**
     * Lấy toàn bộ shop có mã (tgs_site_code) và đang hoạt động.
     *
     * @return array Danh sách shop: blog_id, site_code, site_name, url
     */
    public static function get_all_shops() {
        global $wpdb;

        if (!self::site_code_column_exists()) {
            throw new Exception('Chưa có cột mã website (tgs_site_code) trong hệ thống. Vui lòng kiểm tra plugin TGS Site Code Manager.');
        }

        $column = self::COLUMN_SITE_CODE;

        $rows = $wpdb->get_results(
            "SELECT blog_id, domain, path, `{$column}` AS site_code
             FROM {$wpdb->blogs}
             WHERE `{$column}` IS NOT NULL
               AND `{$column}` <> ''
               AND deleted = 0
               AND archived = 0
               AND spam = 0"
        );

        if (empty($rows)) {
            return array();
        }

        $shops = array();
        foreach ($rows as $row) {
            $site_name = get_blog_option($row->blog_id, 'blogname', '');

            $shops[] = array(
                'blog_id'   => intval($row->blog_id),
                'site_code' => (string) $row->site_code,
                'site_name' => $site_name !== '' ? $site_name : ('Shop ' . $row->site_code),
                'url'       => 'https://' . untrailingslashit($row->domain) . $row->path,
            );
        }

        // Sắp xếp tự nhiên theo mã shop (2001, 2002, ... 8001) để các sếp dễ dò.
        usort($shops, function ($a, $b) {
            return strnatcasecmp($a['site_code'], $b['site_code']);
        });

        return $shops;
    }

    /**
     * Cột tgs_site_code có tồn tại trên bảng blogs hay không.
     */
    private static function site_code_column_exists() {
        global $wpdb;

        static $exists = null;
        if ($exists !== null) {
            return $exists;
        }

        $found = $wpdb->get_var(
            $wpdb->prepare("SHOW COLUMNS FROM `{$wpdb->blogs}` LIKE %s", self::COLUMN_SITE_CODE)
        );

        $exists = !empty($found);
        return $exists;
    }
}
