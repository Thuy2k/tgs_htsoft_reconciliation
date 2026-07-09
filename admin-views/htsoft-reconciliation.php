<?php
/**
 * View: Đối chiếu tồn kho HTSOFT
 * Layout: 2 cột - Sidebar trái (tabs website) + Content phải (bảng so sánh)
 */

if (!defined('ABSPATH')) {
    exit;
}
?>

<div class="tgs-page-header">
    <h1 class="page-title">
        <i class="bx bx-git-compare me-2"></i>
        Đối chiếu tồn kho HTSOFT
    </h1>
    <p class="text-muted">Upload file Excel từ HTSOFT để đối chiếu và tạo phiếu điều chỉnh tự động theo từng website</p>
</div>

<!-- Alert area -->
<div id="htsoftAlert" class="alert d-none" role="alert">
    <i class="bx bx-info-circle me-2"></i>
    <span id="htsoftAlertText"></span>
</div>

<!-- Upload Card -->
<div class="card mb-4" id="uploadCard">
    <div class="card-header bg-light">
        <h5 class="mb-0"><i class="bx bx-upload me-2"></i>Bước 1: Upload file Excel từ HTSOFT</h5>
    </div>
    <div class="card-body">
        <div class="mb-3">
            <label for="htsoftExcelFile" class="form-label">Chọn file Excel (.xlsx, .xls)</label>
            <input type="file" class="form-control" id="htsoftExcelFile" accept=".xlsx, .xls">
            <div class="form-text">File Excel phải có các cột: <strong>Kho</strong>, <strong>Mã hàng</strong>, <strong>Tên hàng</strong>, <strong>Số lượng</strong></div>
        </div>

        <div class="mb-3">
            <label for="htsoftSheetSelect" class="form-label">Chọn Sheet</label>
            <select class="form-select" id="htsoftSheetSelect" disabled>
                <option value="">-- Chọn sheet --</option>
            </select>
        </div>

        <button type="button" class="btn btn-primary" id="htsoftAnalyzeBtn" disabled>
            <i class="bx bx-analyse me-1"></i>Phân tích nhanh
        </button>
    </div>
</div>

<!-- Analysis Result: 2-column layout -->
<div class="card d-none" id="analysisCard">
    <div class="card-header bg-light d-flex justify-content-between align-items-center">
        <h5 class="mb-0">
            <i class="bx bx-check-circle text-success me-2"></i>
            Kết quả phân tích
            <span class="badge bg-primary ms-2" id="totalSitesBadge">0 website</span>
        </h5>
        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="location.reload()">
            <i class="bx bx-refresh me-1"></i>Upload file mới
        </button>
    </div>
    <div class="card-body p-0">
        <div class="row g-0">
            <!-- Left sidebar: Website tabs (vertical) -->
            <div class="col-md-3 border-end htsoft-sidebar">
                <div class="p-3 bg-light border-bottom">
                    <h6 class="mb-0 text-muted fw-bold">DANH SÁCH WEBSITE</h6>
                </div>
                <div class="list-group list-group-flush htsoft-site-list" id="siteList">
                    <!-- Tabs sẽ được render vào đây dưới dạng list-group-item -->
                </div>
            </div>

            <!-- Right content: Comparison table -->
            <div class="col-md-9 htsoft-content">
                <div id="siteTabsContent" class="p-4">
                    <!-- Nội dung tab được render ở đây -->
                    <div class="text-center text-muted py-5">
                        <i class="bx bx-info-circle" style="font-size: 48px;"></i>
                        <p class="mt-3">Chọn website bên trái để xem chi tiết</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Modal: Xác nhận tạo phiếu điều chỉnh -->
<div class="modal fade" id="adjustmentModal" tabindex="-1" aria-labelledby="adjustmentModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-xl">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="adjustmentModalLabel">
                    <i class="bx bx-file-blank me-2"></i>Xác nhận tạo phiếu điều chỉnh
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <div class="alert alert-info">
                    <i class="bx bx-info-circle me-2"></i>
                    Bạn đang tạo phiếu điều chỉnh cho <strong><span id="adjustmentItemCount">0</span> sản phẩm</strong>
                </div>

                <div class="mb-3">
                    <label for="adjustmentNote" class="form-label">Ghi chú phiếu (tùy chọn)</label>
                    <textarea class="form-control" id="adjustmentNote" rows="3" placeholder="Nhập ghi chú cho phiếu điều chỉnh..."></textarea>
                </div>

                <div class="table-responsive" style="max-height: 400px;">
                    <table class="table table-sm table-hover">
                        <thead class="table-light sticky-top">
                            <tr>
                                <th>SKU</th>
                                <th>Tên sản phẩm</th>
                                <th class="text-end">Tồn hệ thống</th>
                                <th class="text-end">Tồn Excel</th>
                                <th class="text-end">Chênh lệch</th>
                            </tr>
                        </thead>
                        <tbody id="adjustmentItemsPreview">
                            <!-- Preview items -->
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                    <i class="bx bx-x me-1"></i>Hủy
                </button>
                <button type="button" class="btn btn-success" id="confirmAdjustmentBtn">
                    <i class="bx bx-check me-1"></i>Tạo phiếu điều chỉnh
                </button>
            </div>
        </div>
    </div>
</div>
