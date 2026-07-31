<?php
/**
 * Class TGS_HTSOFT_Snapshot_DB
 *
 * Bảng GLOBAL (dùng $wpdb->base_prefix, không theo prefix từng site) phục vụ
 * luồng "Báo cáo so sánh HTSOFT": mỗi lần quản trị kéo file Excel từ HTSOFT rồi
 * đối chiếu với hệ thống mới là 1 PHIÊN QUÉT (snapshot). Một ngày có nhiều phiên
 * ở nhiều khung giờ khác nhau.
 *
 * Bảng chỉ giữ phần "tóm tắt để lọc/thống kê nhanh"; toàn bộ chi tiết từng dòng
 * SKU nằm trong file JSONL của từng shop (xem TGS_HTSOFT_Snapshot_Store).
 */

if (!defined('ABSPATH')) {
    exit;
}

class TGS_HTSOFT_Snapshot_DB {

    const DB_VERSION = '1.0.0';
    const OPTION_DB_VERSION = 'tgs_htsoft_recon_snapshot_db_version';

    /** Bảng phiên quét: 1 dòng = 1 lần đối chiếu toàn hệ thống */
    public static function table_snapshot() {
        global $wpdb;
        return $wpdb->base_prefix . 'global_htsoft_recon_snapshot';
    }

    /** Bảng shop trong phiên: 1 dòng = 1 shop trong 1 phiên quét */
    public static function table_site() {
        global $wpdb;
        return $wpdb->base_prefix . 'global_htsoft_recon_site';
    }

    /** Bảng ghi chú hiện hành (bản mới nhất). Lịch sử thay đổi nằm ở JSONL. */
    public static function table_note() {
        global $wpdb;
        return $wpdb->base_prefix . 'global_htsoft_recon_note';
    }

    /**
     * Tạo bảng nếu chưa có / khi đổi DB_VERSION.
     * Gọi ở admin_init nên phải rẻ: chỉ đọc 1 site option.
     */
    public static function maybe_install() {
        if (get_site_option(self::OPTION_DB_VERSION) === self::DB_VERSION) {
            return;
        }
        self::install();
    }

    public static function install() {
        global $wpdb;

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        $charset_collate = $wpdb->get_charset_collate();
        $t_snapshot = self::table_snapshot();
        $t_site     = self::table_site();
        $t_note     = self::table_note();

        dbDelta("CREATE TABLE {$t_snapshot} (
            snapshot_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            snapshot_code VARCHAR(60) NOT NULL COMMENT 'Mã phiên, duy nhất toàn hệ thống',
            label VARCHAR(190) NOT NULL DEFAULT '' COMMENT 'Tên phiên do quản trị đặt, vd: Quét 20h50',
            scan_date DATE NOT NULL COMMENT 'Ngày quét, dùng để nhóm nhiều phiên trong ngày',
            htsoft_export_at DATETIME NULL COMMENT 'Thời điểm xuất dữ liệu từ phần mềm cũ HTSOFT (Excel)',
            scanned_at DATETIME NOT NULL COMMENT 'Thời điểm quét hệ thống mới (realtime)',
            source_file VARCHAR(255) NOT NULL DEFAULT '',
            sheet_name VARCHAR(190) NOT NULL DEFAULT '',
            admin_note TEXT NULL COMMENT 'Ghi chú chung của quản trị cho cả phiên',
            total_sites INT UNSIGNED NOT NULL DEFAULT 0,
            total_items INT UNSIGNED NOT NULL DEFAULT 0,
            total_diff_items INT UNSIGNED NOT NULL DEFAULT 0,
            total_orders INT UNSIGNED NOT NULL DEFAULT 0,
            total_revenue DECIMAL(18,2) NOT NULL DEFAULT 0,
            sites_no_revenue INT UNSIGNED NOT NULL DEFAULT 0,
            status VARCHAR(20) NOT NULL DEFAULT 'running' COMMENT 'running|done',
            created_by BIGINT UNSIGNED NULL,
            created_by_name VARCHAR(190) NOT NULL DEFAULT '',
            created_at DATETIME NULL,
            updated_at DATETIME NULL,
            is_deleted TINYINT NOT NULL DEFAULT 0,
            PRIMARY KEY (snapshot_id),
            UNIQUE KEY uk_snapshot_code (snapshot_code),
            KEY idx_scan_date (scan_date),
            KEY idx_status (status)
        ) {$charset_collate};");

        dbDelta("CREATE TABLE {$t_site} (
            row_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            snapshot_id BIGINT UNSIGNED NOT NULL,
            blog_id BIGINT UNSIGNED NOT NULL,
            site_code VARCHAR(50) NOT NULL,
            site_name VARCHAR(255) NOT NULL DEFAULT '',
            total_items INT UNSIGNED NOT NULL DEFAULT 0,
            diff_items INT UNSIGNED NOT NULL DEFAULT 0,
            diff_qty_plus DECIMAL(15,3) NOT NULL DEFAULT 0 COMMENT 'Tổng lượng hệ thống mới THỪA so với HTSOFT',
            diff_qty_minus DECIMAL(15,3) NOT NULL DEFAULT 0 COMMENT 'Tổng lượng hệ thống mới THIẾU so với HTSOFT',
            orders_count INT UNSIGNED NOT NULL DEFAULT 0,
            revenue DECIMAL(18,2) NOT NULL DEFAULT 0,
            refund_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
            net_revenue DECIMAL(18,2) NOT NULL DEFAULT 0,
            has_activity TINYINT NOT NULL DEFAULT 0 COMMENT '0 = không phát sinh doanh thu trên phần mềm mới',
            jsonl_file VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'Tên file JSONL trong uploads của shop',
            scanned_at DATETIME NULL,
            PRIMARY KEY (row_id),
            UNIQUE KEY uk_snapshot_site (snapshot_id, site_code),
            KEY idx_snapshot (snapshot_id),
            KEY idx_site_code (site_code),
            KEY idx_blog (blog_id),
            KEY idx_activity (has_activity)
        ) {$charset_collate};");

        dbDelta("CREATE TABLE {$t_note} (
            note_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            snapshot_id BIGINT UNSIGNED NOT NULL,
            blog_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
            site_code VARCHAR(50) NOT NULL,
            note_scope VARCHAR(10) NOT NULL DEFAULT 'site' COMMENT 'site = ghi chú chung của shop, item = ghi chú 1 dòng SKU',
            sku VARCHAR(100) NOT NULL DEFAULT '',
            note_text TEXT NULL,
            updated_by BIGINT UNSIGNED NULL,
            updated_by_name VARCHAR(190) NOT NULL DEFAULT '',
            created_at DATETIME NULL,
            updated_at DATETIME NULL,
            PRIMARY KEY (note_id),
            UNIQUE KEY uk_note_target (snapshot_id, site_code, note_scope, sku),
            KEY idx_snapshot_site (snapshot_id, site_code)
        ) {$charset_collate};");

        update_site_option(self::OPTION_DB_VERSION, self::DB_VERSION);
    }
}
