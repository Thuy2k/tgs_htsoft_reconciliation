/**
 * Lưu phiên đối chiếu (chỉ dùng ở trang "Đối chiếu HTSOFT", dành cho quản trị).
 *
 * Sau khi phân tích file Excel, bấm nút này để chụp lại toàn bộ shop có trong
 * file tại đúng khung giờ hiện tại: số tồn phần mềm cũ (HTSOFT) + số tồn và
 * doanh thu realtime của phần mềm mới. Kết quả ghi vào bảng global và file
 * JSONL của từng shop, sau đó ai cũng mở được ở trang "Báo cáo so sánh HTSOFT".
 *
 * Đẩy lên từng shop một để file Excel vài chục nghìn dòng không đụng giới hạn
 * kích thước POST của PHP.
 */
jQuery(document).ready(function ($) {
    'use strict';

    if (typeof tgsHtsoftSnapshot === 'undefined' || typeof tgsHtsoftRecon === 'undefined') {
        return;
    }

    var CFG = tgsHtsoftSnapshot;
    var RECON = tgsHtsoftRecon;

    function esc(value) {
        return $('<div>').text(value === null || value === undefined ? '' : value).html();
    }

    function pad(n) {
        return n < 10 ? '0' + n : String(n);
    }

    function nowLocalInput() {
        var d = new Date();
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
               'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    function defaultLabel() {
        var d = new Date();
        return 'Quét ' + pad(d.getHours()) + 'h' + pad(d.getMinutes()) + ' ngày ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1);
    }

    function ensureModal() {
        if ($('#hcrSaveModal').length) {
            return;
        }

        $('body').append(
            '<div class="modal fade" id="hcrSaveModal" tabindex="-1" data-bs-backdrop="static">' +
              '<div class="modal-dialog modal-lg">' +
                '<div class="modal-content">' +
                  '<div class="modal-header">' +
                    '<h5 class="modal-title"><i class="bx bx-save me-2"></i>Lưu phiên đối chiếu</h5>' +
                    '<button type="button" class="btn-close" data-bs-dismiss="modal"></button>' +
                  '</div>' +
                  '<div class="modal-body">' +
                    '<div class="alert alert-info py-2 px-3 small mb-3">' +
                      '<i class="bx bx-info-circle me-1"></i>' +
                      'Hệ thống sẽ quét lại tồn realtime của <strong><span id="hcrSaveSiteCount">0</span> shop</strong> ' +
                      'trong file Excel và lưu kèm mốc giờ của cả hai phần mềm. ' +
                      'Một ngày có thể lưu nhiều phiên ở nhiều khung giờ khác nhau.' +
                    '</div>' +
                    '<div class="row g-3">' +
                      '<div class="col-md-6">' +
                        '<label class="form-label fw-bold">Tên phiên</label>' +
                        '<input type="text" class="form-control" id="hcrSaveLabel">' +
                        '<div class="form-text">Shop sẽ thấy tên này trong dropdown chọn khung giờ.</div>' +
                      '</div>' +
                      '<div class="col-md-6">' +
                        '<label class="form-label fw-bold">Thời điểm xuất dữ liệu từ HTSOFT</label>' +
                        '<input type="datetime-local" class="form-control" id="hcrSaveExportAt">' +
                        '<div class="form-text">Giờ trên file Excel phần mềm cũ, không phải giờ bấm nút.</div>' +
                      '</div>' +
                      '<div class="col-12">' +
                        '<label class="form-label fw-bold">Ghi chú chung cho cả phiên (tùy chọn)</label>' +
                        '<textarea class="form-control" id="hcrSaveNote" rows="2" placeholder="Vd: file HTSOFT chốt trước khi các shop chốt ca chiều"></textarea>' +
                      '</div>' +
                    '</div>' +
                    '<div class="mt-3 d-none" id="hcrSaveProgressWrap">' +
                      '<div class="progress mb-2" style="height: 18px;">' +
                        '<div class="progress-bar progress-bar-striped progress-bar-animated" id="hcrSaveBar" style="width:0%">0%</div>' +
                      '</div>' +
                      '<div class="hcr-save-progress" id="hcrSaveLog"></div>' +
                    '</div>' +
                  '</div>' +
                  '<div class="modal-footer">' +
                    '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal" id="hcrSaveCancel">Hủy</button>' +
                    '<button type="button" class="btn btn-primary" id="hcrSaveConfirm"><i class="bx bx-check me-1"></i>Bắt đầu lưu</button>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>'
        );
    }

    function logLine(html) {
        var $log = $('#hcrSaveLog');
        $log.append('<div>' + html + '</div>');
        $log.scrollTop($log[0].scrollHeight);
    }

    /** Nạp dữ liệu realtime của 1 shop nếu tab đó chưa được mở lần nào. */
    function fetchSiteData(siteCode) {
        var cache = window.tgsHtsoftSiteData || {};
        if (cache[siteCode]) {
            return $.Deferred().resolve(cache[siteCode]).promise();
        }

        return $.ajax({
            url: RECON.ajaxUrl,
            method: 'POST',
            data: {
                action: 'tgs_htsoft_get_tab_data',
                nonce: RECON.nonce,
                site_code: siteCode,
                excel_items: JSON.stringify(window.tabItemsCache[siteCode] || [])
            }
        }).then(function (res) {
            if (!res.success) {
                return $.Deferred().reject(res.data.message || 'Không đọc được dữ liệu shop');
            }
            cache[siteCode] = res.data;
            return res.data;
        });
    }

    $(document).on('click', '#hcrSaveSnapshotBtn', function () {
        var siteCodes = Object.keys(window.tabItemsCache || {});
        if (!siteCodes.length) {
            alert('Chưa có dữ liệu. Hãy chọn file Excel và bấm "Phân tích nhanh" trước.');
            return;
        }

        ensureModal();
        $('#hcrSaveSiteCount').text(siteCodes.length);
        $('#hcrSaveLabel').val(defaultLabel());
        $('#hcrSaveExportAt').val(nowLocalInput());
        $('#hcrSaveNote').val('');
        $('#hcrSaveProgressWrap').addClass('d-none');
        $('#hcrSaveLog').empty();
        $('#hcrSaveBar').css('width', '0%').text('0%');
        $('#hcrSaveConfirm').prop('disabled', false).html('<i class="bx bx-check me-1"></i>Bắt đầu lưu');

        new bootstrap.Modal(document.getElementById('hcrSaveModal')).show();
    });

    $(document).on('click', '#hcrSaveConfirm', async function () {
        var siteCodes = Object.keys(window.tabItemsCache || {});
        var $btn = $(this).prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>Đang lưu...');
        $('#hcrSaveCancel').prop('disabled', true);
        $('#hcrSaveProgressWrap').removeClass('d-none');

        var fileInput = document.getElementById('htsoftExcelFile');
        var sourceFile = fileInput && fileInput.files.length ? fileInput.files[0].name : '';

        var start;
        try {
            start = await $.ajax({
                url: CFG.ajaxUrl,
                method: 'POST',
                data: {
                    action: 'tgs_htsoft_snapshot_start',
                    nonce: CFG.nonce,
                    label: $('#hcrSaveLabel').val(),
                    htsoft_export_at: $('#hcrSaveExportAt').val(),
                    admin_note: $('#hcrSaveNote').val(),
                    source_file: sourceFile,
                    sheet_name: $('#htsoftSheetSelect').val() || ''
                }
            });
        } catch (e) {
            logLine('<span class="text-danger">Lỗi kết nối khi mở phiên</span>');
            $btn.prop('disabled', false).html('Thử lại');
            $('#hcrSaveCancel').prop('disabled', false);
            return;
        }

        if (!start.success) {
            logLine('<span class="text-danger">' + esc(start.data.message) + '</span>');
            $btn.prop('disabled', false).html('Thử lại');
            $('#hcrSaveCancel').prop('disabled', false);
            return;
        }

        var snapshotId = start.data.snapshot_id;
        logLine('<span class="text-primary">Đã mở phiên ' + esc(start.data.snapshot_code) + '</span>');

        var done = 0;
        var failed = 0;

        for (var i = 0; i < siteCodes.length; i++) {
            var siteCode = siteCodes[i];

            try {
                var data = await fetchSiteData(siteCode);

                var res = await $.ajax({
                    url: CFG.ajaxUrl,
                    method: 'POST',
                    data: {
                        action: 'tgs_htsoft_snapshot_add_site',
                        nonce: CFG.nonce,
                        snapshot_id: snapshotId,
                        site_code: siteCode,
                        site_name: data.site_name || '',
                        blog_id: data.blog_id || 0,
                        comparison: JSON.stringify(data.comparison || []),
                        sales_notes: JSON.stringify(data.sales_notes || []),
                        orders_count: data.orders_count || 0,
                        revenue: data.revenue || 0,
                        refund_amount: data.refund_amount || 0,
                        net_revenue: data.net_revenue || 0
                    }
                });

                if (res.success) {
                    done++;
                    logLine('<span class="text-success">✓</span> ' + esc(siteCode) + ' — ' + res.data.diff_items + ' SP lệch');
                } else {
                    failed++;
                    logLine('<span class="text-danger">✕ ' + esc(siteCode) + ' — ' + esc(res.data.message) + '</span>');
                }
            } catch (e) {
                failed++;
                logLine('<span class="text-danger">✕ ' + esc(siteCode) + ' — ' + esc(typeof e === 'string' ? e : 'lỗi kết nối') + '</span>');
            }

            var percent = Math.round(((i + 1) / siteCodes.length) * 100);
            $('#hcrSaveBar').css('width', percent + '%').text(percent + '%');
        }

        var finish = await $.ajax({
            url: CFG.ajaxUrl,
            method: 'POST',
            data: {
                action: 'tgs_htsoft_snapshot_finish',
                nonce: CFG.nonce,
                snapshot_id: snapshotId
            }
        });

        $('#hcrSaveBar').removeClass('progress-bar-animated');
        $('#hcrSaveCancel').prop('disabled', false).text('Đóng');

        if (!finish.success) {
            logLine('<span class="text-danger">Không chốt được phiên: ' + esc(finish.data.message) + '</span>');
            $btn.prop('disabled', false).html('Thử chốt lại');
            return;
        }

        logLine('<strong class="text-success">Hoàn tất: ' + done + ' shop đã lưu' + (failed ? ', ' + failed + ' shop lỗi' : '') + '.</strong>');
        logLine('Shop chưa có doanh thu trên phần mềm mới: <strong>' + finish.data.sites_no_revenue + '</strong>');

        $btn.replaceWith(
            '<a href="' + finish.data.report_url + '" class="btn btn-success">' +
            '<i class="bx bx-link-external me-1"></i>Mở báo cáo &amp; lấy link gửi shop</a>'
        );
    });
});
