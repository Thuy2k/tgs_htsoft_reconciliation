<?php
/**
 * Class TGS_HTSOFT_Snapshot_Store
 *
 * Lưu vết dữ liệu đối chiếu ra JSONL trong uploads của TỪNG shop:
 *
 *   wp-content/uploads/sites/{blog_id}/tgs_so_sanh_htsoft/
 *       2026-07-30.jsonl          -> mỗi dòng = 1 phiên quét trong ngày (nhiều khung giờ)
 *       notes/2026-07.jsonl       -> nhật ký mọi lần điền/sửa ghi chú giải thích
 *
 * Mỗi dòng snapshot giữ đủ 2 vế tại đúng thời điểm quét: số của phần mềm cũ
 * (HTSOFT, từ file Excel) và số của phần mềm mới (tính realtime lúc bấm quét).
 * Đọc lại về sau sẽ ra đúng bức ảnh tại khung giờ đó, không bị dữ liệu mới đè.
 */

if (!defined('ABSPATH')) {
    exit;
}

class TGS_HTSOFT_Snapshot_Store {

    const DIR_NAME = 'tgs_so_sanh_htsoft';

    /**
     * Thư mục lưu vết của 1 shop. Phải switch_to_blog để wp_upload_dir() trả về
     * đúng uploads/sites/{blog_id}.
     */
    public static function get_dir($blog_id) {
        $switched = false;
        if (is_multisite() && get_current_blog_id() !== (int) $blog_id) {
            switch_to_blog($blog_id);
            $switched = true;
        }

        $upload_dir = wp_upload_dir();
        $base = $upload_dir['basedir'];

        if ($switched) {
            restore_current_blog();
        }

        return trailingslashit($base) . self::DIR_NAME;
    }

    /**
     * Tạo thư mục + chặn truy cập trực tiếp qua HTTP.
     * .htaccess phải nằm TRONG thư mục này, không phải thư mục cha (uploads).
     */
    public static function ensure_dir($blog_id, $sub = '') {
        $dir = self::get_dir($blog_id);
        $target = $sub === '' ? $dir : trailingslashit($dir) . $sub;

        if (!is_dir($target)) {
            wp_mkdir_p($target);
        }

        $htaccess = trailingslashit($dir) . '.htaccess';
        if (!file_exists($htaccess)) {
            @file_put_contents($htaccess, "Deny from all\n");
        }

        $index = trailingslashit($dir) . 'index.php';
        if (!file_exists($index)) {
            @file_put_contents($index, "<?php\n// Silence is golden.\n");
        }

        return $target;
    }

    /**
     * Ghi 1 dòng snapshot của shop.
     *
     * @return string Tên file JSONL (vd: 2026-07-30.jsonl) hoặc '' nếu ghi lỗi.
     */
    public static function append_snapshot($blog_id, $scan_date, array $payload) {
        $dir = self::ensure_dir($blog_id);
        $file_name = self::sanitize_date($scan_date) . '.jsonl';
        $path = trailingslashit($dir) . $file_name;

        $line = wp_json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
        $ok = @file_put_contents($path, $line, FILE_APPEND | LOCK_EX);

        return $ok === false ? '' : $file_name;
    }

    /**
     * Đọc lại 1 phiên quét của shop từ JSONL.
     * Quét theo snapshot_code thay vì nhớ số dòng để không lệch nếu file được
     * ghi thêm bởi phiên khác.
     *
     * @return array|null
     */
    public static function read_snapshot($blog_id, $scan_date, $snapshot_code) {
        $dir = self::get_dir($blog_id);
        $path = trailingslashit($dir) . self::sanitize_date($scan_date) . '.jsonl';

        if (!file_exists($path)) {
            return null;
        }

        $handle = @fopen($path, 'r');
        if (!$handle) {
            return null;
        }

        $found = null;
        while (($line = fgets($handle)) !== false) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }
            // Lọc thô trước khi json_decode: file 1 ngày có thể vài MB.
            if (strpos($line, $snapshot_code) === false) {
                continue;
            }
            $row = json_decode($line, true);
            if (is_array($row) && isset($row['snapshot_code']) && $row['snapshot_code'] === $snapshot_code) {
                $found = $row;
                break;
            }
        }
        fclose($handle);

        return $found;
    }

    /**
     * Ghi nhật ký thay đổi ghi chú (append-only, không bao giờ sửa dòng cũ).
     * Nhờ vậy truy được ai giải thích gì, lúc nào, nội dung trước đó ra sao.
     */
    public static function append_note_log($blog_id, array $entry) {
        $dir = self::ensure_dir($blog_id, 'notes');
        $file_name = date_i18n('Y-m') . '.jsonl';
        $path = trailingslashit($dir) . $file_name;

        $line = wp_json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
        return @file_put_contents($path, $line, FILE_APPEND | LOCK_EX) !== false;
    }

    /**
     * Đọc nhật ký ghi chú của 1 shop.
     *
     * @param int    $blog_id
     * @param array  $filter  ['snapshot_code' => ..., 'sku' => ..., 'months' => 3]
     * @return array Mới nhất lên đầu.
     */
    public static function read_note_log($blog_id, $filter = array()) {
        $dir = trailingslashit(self::get_dir($blog_id)) . 'notes';
        if (!is_dir($dir)) {
            return array();
        }

        $months = isset($filter['months']) ? max(1, intval($filter['months'])) : 6;
        $entries = array();

        // Lùi tháng phải tính từ ngày mồng 1: "-1 month" từ ngày 31/7 ra 1/7,
        // tức vẫn tháng 7 -> đọc trùng file và nhân đôi số dòng nhật ký.
        $base = strtotime(date_i18n('Y-m-01'));

        for ($i = 0; $i < $months; $i++) {
            $path = trailingslashit($dir) . date('Y-m', strtotime("-{$i} month", $base)) . '.jsonl';
            if (!file_exists($path)) {
                continue;
            }

            $lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            if (!$lines) {
                continue;
            }

            foreach ($lines as $line) {
                $row = json_decode($line, true);
                if (!is_array($row)) {
                    continue;
                }
                if (!empty($filter['snapshot_code']) && (!isset($row['snapshot_code']) || $row['snapshot_code'] !== $filter['snapshot_code'])) {
                    continue;
                }
                if (isset($filter['sku']) && $filter['sku'] !== '' && (!isset($row['sku']) || $row['sku'] !== $filter['sku'])) {
                    continue;
                }
                $entries[] = $row;
            }
        }

        usort($entries, function ($a, $b) {
            $ta = isset($a['at']) ? $a['at'] : '';
            $tb = isset($b['at']) ? $b['at'] : '';
            return strcmp($tb, $ta);
        });

        return $entries;
    }

    /**
     * Xoá file lưu vết cũ hơn $days ngày của 1 shop (dọn dẹp thủ công/cron).
     */
    public static function cleanup($blog_id, $days = 180) {
        $dir = self::get_dir($blog_id);
        if (!is_dir($dir)) {
            return 0;
        }

        $cutoff = time() - ($days * DAY_IN_SECONDS);
        $deleted = 0;

        foreach ((array) glob(trailingslashit($dir) . '*.jsonl') as $file) {
            if (filemtime($file) < $cutoff) {
                @unlink($file);
                $deleted++;
            }
        }

        return $deleted;
    }

    /**
     * Chặn path traversal: chỉ chấp nhận YYYY-MM-DD.
     */
    private static function sanitize_date($date) {
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $date)) {
            return $date;
        }
        return date_i18n('Y-m-d');
    }
}
