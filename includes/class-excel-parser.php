<?php
/**
 * Class TGS_HTSOFT_Excel_Parser
 *
 * Parse Excel data từ HTSOFT và nhóm theo website
 */

if (!defined('ABSPATH')) {
    exit;
}

class TGS_HTSOFT_Excel_Parser {

    /**
     * Parse và nhóm dữ liệu Excel theo website
     *
     * @param array $excel_data Dữ liệu từ SheetJS
     * @param string $selected_sheet Tên sheet được chọn
     * @return array
     */
    public function parse_and_group($excel_data, $selected_sheet) {
        if (!isset($excel_data[$selected_sheet])) {
            throw new Exception("Sheet '{$selected_sheet}' không tồn tại trong file Excel");
        }

        $rows = $excel_data[$selected_sheet];

        if (empty($rows)) {
            throw new Exception("Sheet không có dữ liệu");
        }

        // Tìm header row
        $header_row = $this->find_header_row($rows);
        if (!$header_row) {
            throw new Exception("Không tìm thấy header trong Excel. Cần các cột: Kho, Mã hàng, Số lượng");
        }

        // Parse data
        $grouped_data = array();
        for ($i = $header_row['index'] + 1; $i < count($rows); $i++) {
            $row = $rows[$i];

            // Lấy giá trị từ các cột
            $site_code = $this->get_cell_value($row, $header_row['kho_col']);
            $sku = $this->get_cell_value($row, $header_row['sku_col']);
            $product_name = $this->get_cell_value($row, $header_row['name_col']);
            $quantity = $this->get_cell_value($row, $header_row['qty_col']);

            // Bỏ qua dòng trống
            if (empty($site_code) || empty($sku)) {
                continue;
            }

            // Chuẩn hóa site_code (xử lý trường hợp 08004 -> 8004)
            $site_code = ltrim($site_code, '0');
            if (empty($site_code)) {
                $site_code = '0';
            }

            // Chuẩn hóa quantity
            $quantity = $this->parse_quantity($quantity);

            // Nhóm theo site_code
            if (!isset($grouped_data[$site_code])) {
                $grouped_data[$site_code] = array(
                    'site_code' => $site_code,
                    'items' => array(),
                );
            }

            $grouped_data[$site_code]['items'][] = array(
                'sku' => trim($sku),
                'product_name' => trim($product_name),
                'quantity' => $quantity,
            );
        }

        // Chuyển sang array indexed và thêm thống kê
        $result = array();
        foreach ($grouped_data as $site_code => $data) {
            $result[] = array(
                'site_code' => $site_code,
                'items' => $data['items'],
                'total_items' => count($data['items']),
            );
        }

        // Sắp xếp theo site_code
        usort($result, function($a, $b) {
            return strcmp($a['site_code'], $b['site_code']);
        });

        return array(
            'tabs' => $result,
            'total_sites' => count($result),
        );
    }

    /**
     * Tìm header row và xác định vị trí các cột
     */
    private function find_header_row($rows) {
        foreach ($rows as $index => $row) {
            $kho_col = null;
            $sku_col = null;
            $name_col = null;
            $qty_col = null;

            foreach ($row as $col_index => $cell) {
                $cell_lower = mb_strtolower(trim($cell));

                // Loại bỏ dấu cách thừa và normalize
                $cell_normalized = preg_replace('/\s+/', ' ', $cell_lower);

                if (in_array($cell_normalized, array('kho', 'mã kho', 'ma kho', 'cửa hàng', 'cua hang', 'chi nhánh', 'chi nhanh'))) {
                    $kho_col = $col_index;
                } elseif (in_array($cell_normalized, array('mã hàng', 'ma hang', 'sku', 'mã sản phẩm', 'ma san pham'))) {
                    $sku_col = $col_index;
                } elseif (in_array($cell_normalized, array('tên hàng', 'ten hang', 'tên sản phẩm', 'ten san pham', 'sản phẩm', 'san pham'))) {
                    $name_col = $col_index;
                } elseif (in_array($cell_normalized, array('số lượng', 'so luong', 'tồn', 'ton', 'tồn kho', 'ton kho', 'sl', 'quantity'))) {
                    $qty_col = $col_index;
                }
            }

            // Cần ít nhất: kho, sku, quantity
            if ($kho_col !== null && $sku_col !== null && $qty_col !== null) {
                return array(
                    'index' => $index,
                    'kho_col' => $kho_col,
                    'sku_col' => $sku_col,
                    'name_col' => $name_col, // có thể null
                    'qty_col' => $qty_col,
                );
            }
        }

        return null;
    }

    /**
     * Lấy giá trị cell
     */
    private function get_cell_value($row, $col_index) {
        if ($col_index === null || !isset($row[$col_index])) {
            return '';
        }
        return trim($row[$col_index]);
    }

    /**
     * Parse quantity từ string sang float
     */
    private function parse_quantity($value) {
        if (empty($value)) {
            return 0;
        }

        // Xóa dấu phẩy ngăn cách hàng nghìn
        $value = str_replace(',', '', $value);

        // Convert sang float
        return floatval($value);
    }
}
