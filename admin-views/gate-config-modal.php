<?php
/**
 * Modal: Cấu hình chặn bán hàng khi shop chưa giải trình chênh lệch.
 * In ở admin_footer để không đụng vào bố cục trang đối chiếu.
 */

if (!defined('ABSPATH')) {
    exit;
}
?>

<div class="modal fade" id="gateConfigModal" tabindex="-1" data-bs-backdrop="static">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">
                    <i class="bx bx-shield-quarter me-2"></i>Cấu hình chặn bán hàng
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>

            <div class="modal-body">
                <p class="text-muted small mb-3">
                    Khi bật, shop mở trang bán hàng mà tồn kho còn lệch so với phần mềm cũ sẽ bị chặn
                    cho tới khi giải trình và tạo phiếu cân hàng. Shop nào cần ưu tiên bán hàng thì
                    tắt riêng shop đó ở danh sách bên dưới, quản trị tự cân giúp sau.
                </p>

                <div id="gateConfigAlert" class="alert d-none py-2 px-3 small"></div>

                <!-- Công tắc tổng -->
                <div class="gate-block">
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" id="gateEnabled">
                        <label class="form-check-label fw-bold" for="gateEnabled">
                            Bật tính năng chặn bán hàng
                        </label>
                    </div>
                    <div class="form-text ms-4">Tắt công tắc này là toàn bộ shop bán hàng bình thường, không kiểm tra gì.</div>
                </div>

                <!-- Khung giờ -->
                <div class="gate-block">
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" id="gateForceHours">
                        <label class="form-check-label fw-bold" for="gateForceHours">
                            Kiểm tra mọi khung giờ (dùng để test)
                        </label>
                    </div>
                    <div class="form-text ms-4">
                        Bình thường chỉ kiểm tra trong <strong>06:30 – 20:00</strong>, vì sau 20h là lúc
                        quản trị kéo dữ liệu phần mềm cũ. Bật mục này để test ngoài giờ —
                        <strong class="text-danger">nhớ tắt khi dùng thật</strong>.
                    </div>
                </div>

                <!-- Phạm vi -->
                <div class="gate-block">
                    <label class="fw-bold d-block mb-2">Áp dụng cho</label>
                    <div class="form-check">
                        <input class="form-check-input" type="radio" name="gateScope" id="gateScopeAll" value="all">
                        <label class="form-check-label" for="gateScopeAll">
                            <strong>Tất cả shop</strong> — các shop tick bên dưới được <em>miễn</em> kiểm tra
                        </label>
                    </div>
                    <div class="form-check">
                        <input class="form-check-input" type="radio" name="gateScope" id="gateScopeSelected" value="selected">
                        <label class="form-check-label" for="gateScopeSelected">
                            <strong>Chỉ shop được chọn</strong> — chỉ các shop tick bên dưới <em>bị</em> kiểm tra
                        </label>
                    </div>
                </div>

                <!-- Danh sách shop -->
                <div class="gate-block">
                    <div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
                        <label class="fw-bold mb-0" id="gateSitesLabel">Danh sách shop</label>
                        <span class="badge bg-secondary" id="gateSitesCount">0 shop</span>
                        <div class="ms-auto d-flex gap-2">
                            <input type="text" class="form-control form-control-sm" id="gateSiteSearch"
                                   placeholder="Tìm mã / tên shop..." style="width: 200px;">
                            <button type="button" class="btn btn-sm btn-outline-secondary" id="gateCheckAll">Chọn hết</button>
                            <button type="button" class="btn btn-sm btn-outline-secondary" id="gateUncheckAll">Bỏ hết</button>
                        </div>
                    </div>
                    <div class="gate-site-list" id="gateSiteList">
                        <div class="text-center text-muted py-4">
                            <span class="spinner-border spinner-border-sm me-2"></span>Đang tải danh sách shop...
                        </div>
                    </div>
                </div>

                <div class="text-muted small" id="gateUpdatedInfo"></div>
            </div>

            <div class="modal-footer">
                <span class="text-muted small me-auto" id="gateSummary"></span>
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Đóng</button>
                <button type="button" class="btn btn-primary" id="gateSaveBtn">
                    <i class="bx bx-save me-1"></i>Lưu cấu hình
                </button>
            </div>
        </div>
    </div>
</div>

<style>
.gate-block {
    border: 1px solid #e3e6ef;
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 12px;
    background: #fff;
}

.gate-site-list {
    max-height: 300px;
    overflow-y: auto;
    border: 1px solid #e3e6ef;
    border-radius: 6px;
}

.gate-site-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 12px;
    border-bottom: 1px solid #f1f3f5;
    cursor: pointer;
}

.gate-site-row:last-child { border-bottom: 0; }
.gate-site-row:hover { background: #f8f9fb; }
.gate-site-row.is-checked { background: #fff8e6; }

.gate-site-code {
    font-family: Consolas, Monaco, monospace;
    font-weight: 700;
    color: #0d6efd;
    min-width: 56px;
}

.gate-site-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: .88rem;
}

.gate-site-tag { font-size: .7rem; font-weight: 600; }
</style>
