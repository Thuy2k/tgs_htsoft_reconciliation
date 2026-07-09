<?php
/**
 * Giao diện đối chiếu HTSOFT
 */

if (!defined('ABSPATH')) {
    exit;
}

$ajax_url = admin_url('admin-ajax.php');
$nonce = wp_create_nonce('tgs_htsoft_recon_nonce');
?>

<div class="tgs-htsoft-recon-page">
    <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
        <div class="d-flex flex-column justify-content-center">
            <h4 class="mb-1">Đối chiếu tồn kho HTSOFT</h4>
            <p class="text-muted mb-0">
                <a href="<?php echo esc_url(admin_url('admin.php?page=tgs-shop-management')); ?>">Dashboard</a>
                <span class="mx-1">/</span>
                <span>Đối chiếu HTSOFT</span>
            </p>
        </div>
    </div>

    <!-- Alert -->
    <div id="htsoftAlert" class="alert alert-dismissible d-none" role="alert">
        <span id="htsoftAlertText"></span>
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>

    <!-- Card Upload Excel -->
    <div class="card mb-4" id="uploadCard">
        <div class="card-header">
            <h5 class="card-title mb-0"><i class="bx bx-upload me-2"></i>Tải lên file Excel HTSOFT</h5>
        </div>
        <div class="card-body">
            <div class="row g-3">
                <div class="col-md-6">
                    <label class="form-label fw-bold">Chọn file Excel</label>
                    <input type="file" class="form-control" id="htsoftExcelFile" accept=".xlsx,.xls,.csv">
                    <div class="form-text">
                        File Excel xuất từ HTSOFT với các cột: Kho, Mã hàng, Tên hàng, Số lượng
                    </div>
                </div>
                <div class="col-md-3">
                    <label class="form-label fw-bold">Chọn Sheet</label>
                    <select class="form-select" id="htsoftSheetSelect" disabled>
                        <option value="">-- Chọn file trước --</option>
                    </select>
                </div>
                <div class="col-md-3">
                    <label class="form-label fw-bold">&nbsp;</label>
                    <button type="button" class="btn btn-primary w-100" id="htsoftAnalyzeBtn" disabled>
                        <i class="bx bx-analyse me-1"></i>Phân tích nhanh
                    </button>
                </div>
            </div>

            <!-- Format Guide -->
            <div class="mt-3">
                <button class="btn btn-sm btn-outline-info" type="button" data-bs-toggle="collapse" data-bs-target="#formatGuide">
                    <i class="bx bx-info-circle me-1"></i>Hướng dẫn định dạng Excel
                </button>
                <div class="collapse mt-2" id="formatGuide">
                    <div class="card card-body bg-light">
                        <p class="mb-2 fw-bold">Định dạng file Excel HTSOFT:</p>
                        <ul class="mb-0 small">
                            <li><strong>Cột Kho:</strong> Mã tgs_site_code (ví dụ: 8004, có thể có số 0 ở đầu như 08004)</li>
                            <li><strong>Cột Mã hàng:</strong> SKU sản phẩm (bắt buộc)</li>
                            <li><strong>Cột Tên hàng:</strong> Tên sản phẩm (tùy chọn)</li>
                            <li><strong>Cột Số lượng:</strong> Tồn kho thực tế từ HTSOFT (bắt buộc)</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Analysis Result -->
    <div class="card d-none" id="analysisCard">
        <div class="card-header d-flex justify-content-between align-items-center">
            <h5 class="card-title mb-0"><i class="bx bx-pie-chart me-2"></i>Kết quả phân tích</h5>
            <span class="badge bg-success" id="totalSitesBadge">0 website</span>
        </div>
        <div class="card-body">
            <p class="text-muted mb-3">File Excel đã được phân tích và nhóm theo website. Nhấn vào tab để xem chi tiết.</p>

            <!-- Tabs Navigation -->
            <ul class="nav nav-tabs" id="siteTabs" role="tablist">
                <!-- Tabs sẽ được render bởi JS -->
            </ul>

            <!-- Tab Content -->
            <div class="tab-content mt-3" id="siteTabsContent">
                <!-- Content sẽ được render bởi JS -->
            </div>
        </div>
    </div>
</div>

<!-- Modal tạo phiếu điều chỉnh -->
<div class="modal fade" id="adjustmentModal" tabindex="-1" data-bs-backdrop="static">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title"><i class="bx bx-edit me-2"></i>Xác nhận tạo phiếu điều chỉnh</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <div class="alert alert-info">
                    <i class="bx bx-info-circle me-1"></i>
                    Phiếu điều chỉnh sẽ được tạo và duyệt tự động. Tồn kho sẽ được cập nhật ngay.
                </div>

                <div class="mb-3">
                    <label class="form-label fw-bold">Ghi chú phiếu</label>
                    <input type="text" class="form-control" id="adjustmentNote" placeholder="Ví dụ: Điều chỉnh theo đối chiếu HTSOFT ngày 09/07/2026">
                </div>

                <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                    <table class="table table-sm table-bordered">
                        <thead class="table-light sticky-top">
                            <tr>
                                <th style="width: 30%">SKU</th>
                                <th style="width: 25%">Tên sản phẩm</th>
                                <th style="width: 15%" class="text-end">Tồn hiện tại</th>
                                <th style="width: 15%" class="text-end">Tồn mới (Excel)</th>
                                <th style="width: 15%" class="text-end">Chênh lệch</th>
                            </tr>
                        </thead>
                        <tbody id="adjustmentItemsPreview">
                            <!-- Rows will be rendered by JS -->
                        </tbody>
                    </table>
                </div>

                <div class="mt-3">
                    <strong>Tổng số sản phẩm điều chỉnh:</strong> <span id="adjustmentItemCount">0</span>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Hủy</button>
                <button type="button" class="btn btn-primary" id="confirmAdjustmentBtn">
                    <i class="bx bx-check me-1"></i>Tạo phiếu điều chỉnh
                </button>
            </div>
        </div>
    </div>
</div>

<style>
.tgs-htsoft-recon-page {
    padding: 20px;
}

.htsoft-tab-loading {
    text-align: center;
    padding: 40px;
    color: #6c757d;
}

.htsoft-comparison-table {
    font-size: 0.9rem;
}

.htsoft-comparison-table .diff-positive {
    color: #28a745;
    font-weight: 600;
}

.htsoft-comparison-table .diff-negative {
    color: #dc3545;
    font-weight: 600;
}

.htsoft-comparison-table .diff-zero {
    color: #6c757d;
}

.htsoft-stats {
    display: flex;
    gap: 20px;
    margin-bottom: 20px;
    flex-wrap: wrap;
}

.htsoft-stat-box {
    flex: 1;
    min-width: 150px;
    padding: 15px;
    border-radius: 8px;
    background: #f8f9fa;
    border: 1px solid #dee2e6;
}

.htsoft-stat-box h6 {
    margin: 0 0 8px 0;
    font-size: 0.85rem;
    color: #6c757d;
    font-weight: 600;
}

.htsoft-stat-box .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: #212529;
}

.sticky-top {
    position: sticky;
    top: 0;
    z-index: 10;
}
</style>
