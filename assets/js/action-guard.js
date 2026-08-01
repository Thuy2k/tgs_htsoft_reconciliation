/**
 * Hỏi mật khẩu trước khi chạy thao tác không hoàn tác được.
 *
 * Dùng:
 *   tgsHtsoftGuard('Tự cân hàng tất cả', 'Sẽ tạo phiếu cho 65 shop.', function () {
 *       // chỉ chạy khi nhập đúng mật khẩu
 *   });
 *
 * Mật khẩu được đối chiếu ở server; phía trình duyệt không giữ chuỗi nào cả.
 */
(function ($) {
    'use strict';

    if (typeof tgsHtsoftGuardCfg === 'undefined') {
        return;
    }

    var CFG = tgsHtsoftGuardCfg;
    var pending = null;

    function el(id) {
        return document.getElementById(id);
    }

    function close() {
        var node = el('tgsGuardModal');
        var modal = node ? bootstrap.Modal.getInstance(node) : null;
        if (modal) {
            modal.hide();
        }
    }

    function submit() {
        var pw = $('#tgsGuardPw').val() || '';
        if (pw === '') {
            $('#tgsGuardErr').text('Chưa nhập mật khẩu');
            return;
        }

        var $btn = $('#tgsGuardOk').prop('disabled', true)
            .html('<span class="spinner-border spinner-border-sm me-1"></span>Đang kiểm tra...');
        $('#tgsGuardErr').text('');

        $.ajax({
            url: CFG.ajaxUrl,
            method: 'POST',
            data: { action: 'tgs_htsoft_guard_verify', nonce: CFG.nonce, password: pw }
        }).done(function (res) {
            if (!res.success) {
                $('#tgsGuardErr').text(res.data.message || 'Mật khẩu không đúng');
                $('#tgsGuardPw').val('').trigger('focus');
                return;
            }

            var run = pending;
            pending = null;
            close();

            // Chờ modal đóng hẳn rồi mới chạy, tránh đè lên modal khác mà
            // thao tác sắp mở (vd modal xác nhận tạo phiếu điều chỉnh).
            setTimeout(function () {
                if (typeof run === 'function') {
                    run();
                }
            }, 250);
        }).fail(function () {
            $('#tgsGuardErr').text('Lỗi kết nối máy chủ');
        }).always(function () {
            $btn.prop('disabled', false).html('<i class="bx bx-check me-1"></i>Xác nhận');
        });
    }

    /**
     * @param {string}   action   Tên thao tác, hiện trong modal.
     * @param {string}   warning  Câu mô tả hậu quả, để người bấm biết mình đang làm gì.
     * @param {Function} onOk     Chạy khi nhập đúng mật khẩu.
     */
    window.tgsHtsoftGuard = function (action, warning, onOk) {
        var node = el('tgsGuardModal');
        if (!node) {
            // Không dựng được modal thì thà chặn còn hơn cho chạy tự do.
            console.error('[tgs-guard] Thiếu modal xác nhận, đã chặn thao tác:', action);
            return;
        }

        pending = onOk;
        $('#tgsGuardAction').text(action);
        $('#tgsGuardWarn').text(warning || '');
        $('#tgsGuardPw').val('');
        $('#tgsGuardErr').text('');

        new bootstrap.Modal(node).show();
        setTimeout(function () { $('#tgsGuardPw').trigger('focus'); }, 350);
    };

    $(document).on('click', '#tgsGuardOk', submit);
    $(document).on('keydown', '#tgsGuardPw', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            submit();
        }
    });

    // Đóng modal giữa chừng thì bỏ luôn thao tác đang chờ.
    $(document).on('hidden.bs.modal', '#tgsGuardModal', function () {
        pending = null;
    });
})(jQuery);
