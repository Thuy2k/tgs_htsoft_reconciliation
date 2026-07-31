/**
 * Cấu hình chặn bán hàng khi shop chưa giải trình chênh lệch.
 *
 * Chỉ đọc/ghi option mạng; việc chặn do plugin tgs_pos thực hiện. Ý nghĩa của
 * danh sách shop đảo chiều theo phạm vi đã chọn, nên nhãn và màu thẻ phải đổi
 * theo — tick nhầm ở đây là chặn oan cả hệ thống hoặc bỏ lọt toàn bộ.
 */
jQuery(document).ready(function ($) {
    'use strict';

    if (typeof tgsHtsoftGateConfig === 'undefined') {
        return;
    }

    var CFG = tgsHtsoftGateConfig;

    var state = {
        shops: [],
        selected: {},
        loaded: false
    };

    function esc(value) {
        return $('<div>').text(value === null || value === undefined ? '' : value).html();
    }

    function alertBox(type, message) {
        $('#gateConfigAlert')
            .removeClass('d-none alert-success alert-danger alert-warning alert-info')
            .addClass('alert-' + type)
            .text(message);
    }

    function post(action, data) {
        return $.ajax({
            url: CFG.ajaxUrl,
            method: 'POST',
            data: $.extend({ action: action, nonce: CFG.nonce }, data || {})
        });
    }

    function currentScope() {
        return $('input[name="gateScope"]:checked').val() === 'selected' ? 'selected' : 'all';
    }

    function renderList() {
        var keyword = ($('#gateSiteSearch').val() || '').toLowerCase().trim();
        var scope = currentScope();

        var rows = state.shops.filter(function (shop) {
            return !keyword ||
                String(shop.site_code).toLowerCase().indexOf(keyword) !== -1 ||
                String(shop.site_name || '').toLowerCase().indexOf(keyword) !== -1;
        });

        // Cùng một dấu tick, hai ý nghĩa trái ngược nhau tuỳ phạm vi.
        var tagText = scope === 'selected' ? 'Bị kiểm tra' : 'Được miễn';
        var tagCls = scope === 'selected' ? 'bg-primary' : 'bg-warning text-dark';

        if (!rows.length) {
            $('#gateSiteList').html('<div class="text-center text-muted py-4">Không tìm thấy shop nào.</div>');
        } else {
            var html = '';
            rows.forEach(function (shop) {
                var checked = !!state.selected[shop.blog_id];
                html +=
                    '<label class="gate-site-row' + (checked ? ' is-checked' : '') + '" data-blog="' + shop.blog_id + '">' +
                        '<input type="checkbox" class="form-check-input mt-0 gate-site-cb"' +
                            ' data-blog="' + shop.blog_id + '"' + (checked ? ' checked' : '') + '>' +
                        '<span class="gate-site-code">' + esc(shop.site_code) + '</span>' +
                        '<span class="gate-site-name">' + esc(shop.site_name) + '</span>' +
                        (checked ? '<span class="badge gate-site-tag ' + tagCls + '">' + tagText + '</span>' : '') +
                    '</label>';
            });
            $('#gateSiteList').html(html);
        }

        var count = Object.keys(state.selected).filter(function (k) { return state.selected[k]; }).length;
        $('#gateSitesCount').text(count + ' shop được tick');
        $('#gateSitesLabel').text(scope === 'selected'
            ? 'Chọn shop CẦN kiểm tra'
            : 'Chọn shop được MIỄN kiểm tra');

        renderSummary(count, scope);
    }

    function renderSummary(count, scope) {
        var total = state.shops.length;
        var text;

        if (!$('#gateEnabled').is(':checked')) {
            text = 'Đang TẮT — toàn bộ ' + total + ' shop bán hàng bình thường.';
        } else if (scope === 'selected') {
            text = 'Đang kiểm tra ' + count + '/' + total + ' shop được chọn.';
        } else {
            text = 'Đang kiểm tra ' + (total - count) + '/' + total + ' shop (' + count + ' shop được miễn).';
        }

        if ($('#gateForceHours').is(':checked')) {
            text += ' Kiểm tra MỌI khung giờ.';
        } else {
            text += ' Chỉ trong ' + CFG.windowStart + '–' + CFG.windowEnd + '.';
        }

        $('#gateSummary').text(text);
    }

    function applyConfig(config) {
        $('#gateEnabled').prop('checked', !!config.enabled);
        $('#gateForceHours').prop('checked', !!config.force_hours);
        $('input[name="gateScope"][value="' + (config.scope === 'selected' ? 'selected' : 'all') + '"]')
            .prop('checked', true);

        state.selected = {};
        (config.sites || []).forEach(function (blogId) {
            state.selected[blogId] = true;
        });

        $('#gateUpdatedInfo').text(config.updated_at
            ? 'Sửa lần cuối: ' + config.updated_at + (config.updated_by ? ' bởi ' + config.updated_by : '')
            : '');
    }

    function load() {
        if (state.loaded) {
            renderList();
            return;
        }

        post('tgs_htsoft_gate_config_get').done(function (res) {
            if (!res.success) {
                alertBox('danger', res.data.message || 'Không tải được cấu hình');
                return;
            }

            state.shops = res.data.shops || [];
            state.loaded = true;
            applyConfig(res.data.config || {});
            renderList();
        }).fail(function () {
            alertBox('danger', 'Lỗi kết nối máy chủ');
        });
    }

    /* --------------------------------------------------------------- */

    $(document).on('click', '.tgs-gate-config-btn', function () {
        $('#gateConfigAlert').addClass('d-none');
        new bootstrap.Modal(document.getElementById('gateConfigModal')).show();
        load();
    });

    $(document).on('change', '.gate-site-cb', function () {
        var blogId = $(this).data('blog');
        if ($(this).is(':checked')) {
            state.selected[blogId] = true;
        } else {
            delete state.selected[blogId];
        }
        renderList();
    });

    $(document).on('input', '#gateSiteSearch', renderList);
    $(document).on('change', 'input[name="gateScope"], #gateEnabled, #gateForceHours', renderList);

    $(document).on('click', '#gateCheckAll', function () {
        // Chỉ tác động lên phần đang hiển thị, tránh tick nhầm shop bị bộ lọc ẩn.
        $('#gateSiteList .gate-site-cb').each(function () {
            state.selected[$(this).data('blog')] = true;
        });
        renderList();
    });

    $(document).on('click', '#gateUncheckAll', function () {
        $('#gateSiteList .gate-site-cb').each(function () {
            delete state.selected[$(this).data('blog')];
        });
        renderList();
    });

    $(document).on('click', '#gateSaveBtn', function () {
        var $btn = $(this).prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>Đang lưu...');

        var sites = Object.keys(state.selected).filter(function (k) {
            return state.selected[k];
        }).map(Number);

        var scope = currentScope();

        // Chặn cấu hình vô nghĩa: bật tính năng mà không chọn shop nào.
        if ($('#gateEnabled').is(':checked') && scope === 'selected' && !sites.length) {
            alertBox('warning', 'Bạn chọn phạm vi "Chỉ shop được chọn" nhưng chưa tick shop nào — sẽ không shop nào bị kiểm tra.');
        }

        post('tgs_htsoft_gate_config_save', {
            enabled: $('#gateEnabled').is(':checked') ? 1 : 0,
            force_hours: $('#gateForceHours').is(':checked') ? 1 : 0,
            scope: scope,
            sites: JSON.stringify(sites)
        }).done(function (res) {
            if (!res.success) {
                alertBox('danger', res.data.message || 'Không lưu được cấu hình');
                return;
            }
            applyConfig(res.data.config);
            renderList();
            alertBox('success', res.data.message);
        }).fail(function () {
            alertBox('danger', 'Lỗi kết nối máy chủ');
        }).always(function () {
            $btn.prop('disabled', false).html('<i class="bx bx-save me-1"></i>Lưu cấu hình');
        });
    });
});
