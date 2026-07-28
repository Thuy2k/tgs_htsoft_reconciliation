<?php
/**
 * Modal cấu hình đợt khảo sát feedback shop (LUỒNG RIÊNG).
 * Được in ở admin_footer bởi TGS_HTSOFT_Feedback_Module.
 */

if (!defined('ABSPATH')) {
    exit;
}
?>
<div class="modal fade tgs-fb-modal" id="tgsFeedbackModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
            <div class="modal-header tgs-fb-modal-header">
                <h5 class="modal-title">
                    <i class="bx bx-message-square-detail me-2"></i>Tạo file Excel khảo sát feedback shop
                </h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>

            <div class="modal-body">
                <div class="alert alert-info d-flex align-items-start mb-3">
                    <i class="bx bx-info-circle me-2 mt-1"></i>
                    <div class="small">
                        File xuất ra là <strong>1 file Excel nhiều tab</strong>: mỗi shop một tab riêng
                        (<strong>tên tab = mã shop</strong>, bên trong hiện rõ tên shop). Kèm sẵn
                        <strong>tab HƯỚNG DẪN</strong> và <strong>tab TỔNG HỢP</strong> tự động chấm điểm
                        khi các shop điền. File này <em>không liên quan tới dữ liệu chênh lệch tồn kho</em>.
                    </div>
                </div>

                <div class="row g-3">
                    <div class="col-md-6">
                        <label class="form-label fw-bold" for="tgsFbRound">Tên đợt khảo sát</label>
                        <input type="text" class="form-control" id="tgsFbRound" placeholder="VD: Tháng 08/2026">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label fw-bold" for="tgsFbDeadline">Hạn gửi lại</label>
                        <input type="text" class="form-control" id="tgsFbDeadline" placeholder="VD: 10/08/2026">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label fw-bold" for="tgsFbOwner">Người phụ trách tổng hợp</label>
                        <input type="text" class="form-control" id="tgsFbOwner" placeholder="VD: Team Phần mềm BTsoft">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label fw-bold" for="tgsFbContact">Liên hệ hỗ trợ (Zalo/SĐT)</label>
                        <input type="text" class="form-control" id="tgsFbContact" placeholder="VD: Zalo nhóm hỗ trợ BTsoft">
                    </div>
                </div>

                <hr class="my-4">

                <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                    <div>
                        <h6 class="mb-0 fw-bold">
                            <i class="bx bx-store-alt me-1"></i>Chọn shop cần tạo tab
                        </h6>
                        <small class="text-muted">Mặc định chọn tất cả shop đang hoạt động</small>
                    </div>
                    <div class="d-flex gap-2 align-items-center">
                        <span class="badge bg-primary" id="tgsFbSelectedCount">0 shop</span>
                        <button type="button" class="btn btn-sm btn-outline-primary" id="tgsFbSelectAll">Chọn tất cả</button>
                        <button type="button" class="btn btn-sm btn-outline-secondary" id="tgsFbClearAll">Bỏ chọn</button>
                    </div>
                </div>

                <input type="text" class="form-control form-control-sm mb-2" id="tgsFbSearch" placeholder="Tìm nhanh theo mã shop hoặc tên shop...">

                <div class="tgs-fb-shop-list" id="tgsFbShopList">
                    <div class="text-center text-muted py-4">
                        <span class="spinner-border spinner-border-sm me-2"></span>Đang tải danh sách shop...
                    </div>
                </div>
            </div>

            <div class="modal-footer">
                <span class="text-muted small me-auto" id="tgsFbStatus"></span>
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                    <i class="bx bx-x me-1"></i>Đóng
                </button>
                <button type="button" class="btn btn-primary" id="tgsFbExportBtn">
                    <i class="bx bx-download me-1"></i>Tạo file Excel khảo sát
                </button>
            </div>
        </div>
    </div>
</div>
