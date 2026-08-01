<?php
/**
 * View: Báo cáo so sánh HTSOFT (phần mềm cũ) với hệ thống mới.
 *
 * Trang này chỉ ĐỌC dữ liệu đã được quản trị lưu vết ở trang "Đối chiếu HTSOFT".
 *
 * Bố cục phục vụ NGƯỜI CỦA SHOP là chính: mở link ra phải thấy ngay khối chênh
 * lệch của shop mình, không phải khối thống kê toàn hệ thống. Danh sách 68 shop
 * và thống kê toàn hệ thống đều thu gọn được, nhường hết chiều ngang cho bảng
 * chi tiết — trước đây bảng bị tràn ngang làm mất hẳn cột cuối.
 */

if (!defined('ABSPATH')) {
    exit;
}

$preselect_snapshot = isset($_GET['snapshot']) ? sanitize_text_field(wp_unslash($_GET['snapshot'])) : '';
$preselect_site     = isset($_GET['shop']) ? sanitize_text_field(wp_unslash($_GET['shop'])) : '';
?>

<div class="hcr-page">

    <div class="hcr-page-head">
        <div>
            <h1 class="hcr-page-title">
                <i class="bx bx-git-compare"></i>
                Đối chiếu tồn kho: phần mềm cũ &harr; phần mềm mới
            </h1>
            <p class="hcr-page-desc">
                Chọn khung giờ quét, tìm mã shop của bạn, rồi giải thích những mặt hàng bị lệch.
            </p>
        </div>
        <div class="d-flex gap-2 flex-wrap">
            <button type="button" class="btn btn-success btn-sm" id="hcrExportAllBtn"
                    title="Xuất file Excel gồm 1 sheet tổng quan và mỗi shop 1 sheet riêng">
                <i class="bx bx-download me-1"></i>Xuất Excel tất cả shop
            </button>
            <button type="button" class="btn btn-outline-secondary btn-sm" id="hcrCopyLinkBtn">
                <i class="bx bx-link me-1"></i>Copy link
            </button>
        </div>
    </div>

    <div id="hcrAlert" class="alert d-none" role="alert">
        <span id="hcrAlertText"></span>
    </div>

    <input type="hidden" id="hcrPreselectSnapshot" value="<?php echo esc_attr($preselect_snapshot); ?>">
    <input type="hidden" id="hcrPreselectSite" value="<?php echo esc_attr($preselect_site); ?>">

    <!-- Chọn phiên quét -->
    <div class="hcr-toolbar">
        <div class="hcr-field">
            <label class="hcr-field-label">Ngày quét</label>
            <!-- Danh sách ngày CÓ dữ liệu, không dùng lịch để khỏi chọn nhằm
                 ngày trống rồi tưởng mất báo cáo. -->
            <select class="form-select form-select-sm" id="hcrDateFilter">
                <option value="">Mới nhất</option>
            </select>
        </div>
        <div class="hcr-field hcr-field--grow">
            <label class="hcr-field-label">Lần quét (khung giờ)</label>
            <select class="form-select form-select-sm" id="hcrSnapshotSelect">
                <option value="">Đang tải...</option>
            </select>
        </div>
        <div class="hcr-field hcr-field--grow">
            <label class="hcr-field-label">Tìm shop</label>
            <div class="input-group input-group-sm">
                <span class="input-group-text"><i class="bx bx-search"></i></span>
                <input type="text" class="form-control" id="hcrSiteSearch" placeholder="Mã shop (vd 8016) hoặc tên shop...">
                <button class="btn btn-primary" type="button" id="hcrMySiteBtn">
                    <i class="bx bx-target-lock me-1"></i>Shop của tôi
                </button>
            </div>
        </div>
    </div>

    <!-- Chuyển nhanh giữa các giờ quét trong cùng một ngày -->
    <div class="hcr-scanbar d-none" id="hcrScanBar"></div>

    <!-- Hai mốc thời gian: chốt HTSOFT và quét hệ thống mới -->
    <div id="hcrSnapshotMeta" class="hcr-meta d-none"></div>

    <!-- Thống kê toàn hệ thống: thu gọn mặc định khi shop mở link của mình -->
    <div class="hcr-global" id="hcrGlobal">
        <button type="button" class="hcr-global-toggle" id="hcrGlobalToggle">
            <i class="bx bx-chevron-right hcr-global-caret"></i>
            <span>Tình hình chung toàn hệ thống</span>
            <span class="hcr-global-peek" id="hcrGlobalPeek"></span>
        </button>
        <div class="hcr-global-body" id="hcrSummary"></div>
    </div>

    <!-- Nội dung chính -->
    <div class="hcr-layout" id="hcrLayout">
        <aside class="hcr-sidebar" id="hcrSidebar">
            <div class="hcr-sidebar-head">
                <div class="hcr-filter-tabs" id="hcrFilterTabs">
                    <button type="button" class="hcr-tab is-active" data-filter="all">
                        Tất cả shop <span class="hcr-tab-count" data-count="all">0</span>
                    </button>
                    <button type="button" class="hcr-tab" data-filter="diff">
                        Đang lệch <span class="hcr-tab-count" data-count="diff">0</span>
                    </button>
                    <button type="button" class="hcr-tab" data-filter="norev"
                            title="Shop không phát sinh đơn hàng nào trên phần mềm mới trong ngày quét">
                        Chưa bán trên PM mới <span class="hcr-tab-count" data-count="norev">0</span>
                    </button>
                    <button type="button" class="hcr-tab" data-filter="missing"
                            title="Website đã có mã trong hệ thống nhưng chưa đưa vào vận hành">
                        Chưa triển khai <span class="hcr-tab-count" data-count="missing">0</span>
                    </button>
                </div>
            </div>
            <div class="hcr-site-list" id="hcrSiteList">
                <div class="hcr-placeholder"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải...</div>
            </div>
        </aside>

        <section class="hcr-content" id="hcrDetail">
            <div class="hcr-placeholder">
                <i class="bx bx-store"></i>
                <p>Chọn shop ở danh sách bên trái, hoặc bấm <strong>Shop của tôi</strong>.</p>
            </div>
        </section>
    </div>
</div>

<!-- Nhật ký thay đổi ghi chú -->
<div class="modal fade" id="hcrHistoryModal" tabindex="-1">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title"><i class="bx bx-history me-2"></i>Nhật ký ghi chú</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body" id="hcrHistoryBody">
                <div class="hcr-placeholder"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải...</div>
            </div>
        </div>
    </div>
</div>
