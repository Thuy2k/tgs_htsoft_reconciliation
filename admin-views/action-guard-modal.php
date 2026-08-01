<?php
/**
 * Modal xác nhận mật khẩu trước khi chạy thao tác nguy hiểm.
 * In ở admin_footer để mọi màn hình trong trang đối chiếu đều dùng chung.
 */

if (!defined('ABSPATH')) {
    exit;
}
?>

<div class="modal fade" id="tgsGuardModal" tabindex="-1" data-bs-backdrop="static">
    <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content">
            <div class="modal-header bg-danger text-white py-2">
                <h6 class="modal-title mb-0">
                    <i class="bx bx-lock-alt me-1"></i>Xác nhận thao tác
                </h6>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <p class="mb-2 small">
                    Bạn sắp thực hiện: <strong id="tgsGuardAction">thao tác</strong>.
                </p>
                <p class="text-muted small mb-3" id="tgsGuardWarn"></p>

                <label class="form-label small fw-bold mb-1" for="tgsGuardPw">Nhập mật khẩu để tiếp tục</label>
                <input type="password" class="form-control" id="tgsGuardPw" autocomplete="off">
                <div class="invalid-feedback d-block small" id="tgsGuardErr"></div>
            </div>
            <div class="modal-footer py-2">
                <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">Hủy</button>
                <button type="button" class="btn btn-sm btn-danger" id="tgsGuardOk">
                    <i class="bx bx-check me-1"></i>Xác nhận
                </button>
            </div>
        </div>
    </div>
</div>
