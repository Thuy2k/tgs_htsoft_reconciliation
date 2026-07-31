/**
 * Báo cáo so sánh HTSOFT <-> hệ thống mới (chỉ đọc dữ liệu đã lưu vết).
 *
 * Trang phục vụ người của shop là chính: mở link ra là tự chọn phiên gần nhất,
 * tự mở shop của mình, thu gọn danh sách shop và thống kê toàn hệ thống để khối
 * chênh lệch chiếm trọn màn hình. Quản trị mở không kèm mã shop thì danh sách
 * shop vẫn bung sẵn để duyệt lần lượt.
 */
jQuery(document).ready(function ($) {
    'use strict';

    if (typeof tgsHtsoftReport === 'undefined') {
        return;
    }

    var CFG = tgsHtsoftReport;
    var AUTOSAVE_DELAY = 800;

    var state = {
        snapshots: [],
        dates: [],
        olderCount: 0,
        snapshot: null,
        sites: [],
        missing: [],
        filter: 'all',
        keyword: '',
        activeSite: null,
        detail: null,
        onlyDiff: true,
        sidebarCollapsed: false,
        // Tồn realtime tra thêm khi xem báo cáo, cache theo mã shop để đổi bộ
        // lọc hay bật/tắt "chỉ hiện dòng lệch" không phải tra lại.
        liveStock: {},
        liveStockAt: {}
    };

    /* ------------------------------------------------------------------
     * Tiện ích
     * --------------------------------------------------------------- */

    function esc(value) {
        return $('<div>').text(value === null || value === undefined ? '' : value).html();
    }

    function num(value) {
        var n = parseFloat(value) || 0;
        var rounded = Math.abs(n % 1) < 0.005 ? n.toFixed(0) : n.toFixed(2);
        return Number(rounded).toLocaleString('vi-VN');
    }

    function money(value) {
        return (Math.round(parseFloat(value) || 0)).toLocaleString('vi-VN') + ' đ';
    }

    function shortTime(datetime) {
        if (!datetime) {
            return '--';
        }
        var parts = String(datetime).replace('T', ' ').split(' ');
        var date = (parts[0] || '').split('-');
        var time = (parts[1] || '').slice(0, 5);
        if (date.length !== 3) {
            return datetime;
        }
        return time + ' ' + date[2] + '/' + date[1] + '/' + date[0];
    }

    function alertBox(type, message) {
        var $box = $('#hcrAlert');
        $box.removeClass('d-none alert-success alert-danger alert-warning alert-info')
            .addClass('alert-' + type);
        $('#hcrAlertText').text(message);
        if (type === 'success' || type === 'info') {
            setTimeout(function () { $box.addClass('d-none'); }, 4000);
        }
    }

    function post(action, data) {
        return $.ajax({
            url: CFG.ajaxUrl,
            method: 'POST',
            data: $.extend({ action: action, nonce: CFG.nonce }, data || {})
        });
    }

    function setSidebar(collapsed) {
        state.sidebarCollapsed = collapsed;
        $('#hcrLayout').toggleClass('is-collapsed', collapsed);
        $('#hcrSidebarToggle').html(collapsed
            ? '<i class="bx bx-list-ul me-1"></i>Xem shop khác'
            : '<i class="bx bx-chevrons-left me-1"></i>Ẩn danh sách shop');
    }

    /* ------------------------------------------------------------------
     * Bước 1: danh sách phiên quét
     * --------------------------------------------------------------- */

    /** "2026-07-31" -> "31/07/2026", kèm nhãn Hôm nay / Hôm qua cho dễ nhận. */
    function dateLabel(scanDate) {
        var parts = String(scanDate).split('-');
        if (parts.length !== 3) {
            return scanDate;
        }

        var pretty = parts[2] + '/' + parts[1] + '/' + parts[0];
        var today = new Date();
        var pad = function (n) { return n < 10 ? '0' + n : String(n); };
        var todayStr = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());

        var yesterday = new Date(today.getTime() - 86400000);
        var yStr = yesterday.getFullYear() + '-' + pad(yesterday.getMonth() + 1) + '-' + pad(yesterday.getDate());

        if (scanDate === todayStr) {
            return 'Hôm nay ' + pretty;
        }
        if (scanDate === yStr) {
            return 'Hôm qua ' + pretty;
        }
        return pretty;
    }

    /** Giờ quét dạng "21h53" để nhãn ngắn, đọc lướt được. */
    function scanHour(snap) {
        var time = String(snap.scanned_at || '').replace('T', ' ').split(' ')[1] || '';
        return time ? time.slice(0, 2) + 'h' + time.slice(3, 5) : snap.label;
    }

    function loadSnapshots(preferredCode) {
        var date = $('#hcrDateFilter').val() || '';

        return post('tgs_htsoft_report_snapshots', { date: date, limit: 60 }).done(function (res) {
            if (!res.success) {
                alertBox('danger', res.data.message || 'Không tải được danh sách lần quét');
                return;
            }

            state.snapshots = res.data.snapshots || [];
            state.dates = res.data.dates || [];
            state.olderCount = res.data.older_count || 0;

            renderDateFilter(date);

            var $select = $('#hcrSnapshotSelect').empty();

            if (!state.snapshots.length) {
                $select.append('<option value="">-- Chưa có lần quét nào --</option>');
                $('#hcrSiteList').html('<div class="hcr-placeholder"><i class="bx bx-folder-open"></i><p>Chưa có dữ liệu.<br>Quản trị cần vào trang <strong>Đối chiếu HTSOFT</strong>, phân tích file Excel rồi bấm <strong>Lưu phiên đối chiếu</strong>.</p></div>');
                $('#hcrGlobal').hide();
                $('#hcrSnapshotMeta').addClass('d-none');
                $('#hcrScanBar').addClass('d-none');
                return;
            }

            $('#hcrGlobal').show();

            // Gom theo ngày: quét nhiều lần mỗi ngày nên danh sách phẳng sẽ dài
            // vô tận và không biết đâu là ranh giới ngày.
            var groups = {};
            var order = [];
            state.snapshots.forEach(function (snap) {
                if (!groups[snap.scan_date]) {
                    groups[snap.scan_date] = [];
                    order.push(snap.scan_date);
                }
                groups[snap.scan_date].push(snap);
            });

            order.forEach(function (scanDate) {
                var list = groups[scanDate];
                var $group = $('<optgroup>').attr('label',
                    dateLabel(scanDate) + ' — ' + list.length + ' lần quét');

                list.forEach(function (snap) {
                    $group.append(
                        $('<option>').val(snap.snapshot_code).text(
                            scanHour(snap) + ' — ' +
                            num(snap.total_diff_items) + ' mặt hàng lệch · ' +
                            snap.total_sites + ' shop'
                        )
                    );
                });

                $select.append($group);
            });

            if (state.olderCount > 0) {
                $select.append(
                    $('<option>').val('').prop('disabled', true).text(
                        '── còn ' + num(state.olderCount) + ' lần quét cũ hơn, chọn ngày ở ô bên trái ──'
                    )
                );
            }

            // Chỉ dùng lần quét trên URL đúng 1 lần, sau đó để người dùng tự đổi.
            var fromUrl = $('#hcrPreselectSnapshot').val();
            $('#hcrPreselectSnapshot').val('');

            var target = preferredCode || fromUrl || state.snapshots[0].snapshot_code;
            if (!state.snapshots.some(function (s) { return s.snapshot_code === target; })) {
                target = state.snapshots[0].snapshot_code;
            }

            $select.val(target);
            loadOverview(target);
        });
    }

    function renderDateFilter(keepValue) {
        var $date = $('#hcrDateFilter').empty();
        $date.append($('<option>').val('').text('Mới nhất'));

        (state.dates || []).forEach(function (row) {
            $date.append(
                $('<option>').val(row.scan_date).text(
                    dateLabel(row.scan_date) + ' (' + row.scan_count + ' lần)'
                )
            );
        });

        if (keepValue && $date.find('option[value="' + keepValue + '"]').length) {
            $date.val(keepValue);
        }
    }

    /**
     * Thanh chuyển nhanh giữa các lần quét CÙNG NGÀY với lần đang xem, kèm nút
     * lùi/tiến. Đây là thao tác hay dùng nhất: so số lúc 9h với số lúc 21h để
     * biết chênh lệch do lệch giờ chốt hay do sai thật.
     */
    function renderScanBar() {
        var snap = state.snapshot;
        var $bar = $('#hcrScanBar');

        if (!snap) {
            $bar.addClass('d-none');
            return;
        }

        var sameDay = state.snapshots.filter(function (s) {
            return s.scan_date === snap.scan_date;
        });

        // Mảng snapshots xếp mới nhất trước; đảo lại cho chip chạy theo thời gian.
        var chronological = sameDay.slice().reverse();
        var allIndex = state.snapshots.findIndex(function (s) {
            return s.snapshot_code === snap.snapshot_code;
        });

        var chips = '';
        chronological.forEach(function (s) {
            var active = s.snapshot_code === snap.snapshot_code ? ' is-active' : '';
            chips +=
                '<button type="button" class="hcr-chip' + active + '" data-scan="' + esc(s.snapshot_code) + '"' +
                    ' title="' + esc(s.label) + ' — ' + num(s.total_diff_items) + ' mặt hàng lệch">' +
                    scanHour(s) +
                    '<span class="hcr-chip-diff">' + num(s.total_diff_items) + '</span>' +
                '</button>';
        });

        // "Trước" = cũ hơn = index lớn hơn trong mảng đã sắp giảm dần.
        var hasOlder = allIndex >= 0 && allIndex < state.snapshots.length - 1;
        var hasNewer = allIndex > 0;

        $bar.removeClass('d-none').html(
            '<span class="hcr-scanbar-label">' +
                '<i class="bx bx-time-five"></i>Các lần quét ' + esc(dateLabel(snap.scan_date)).toLowerCase() +
            '</span>' +
            '<div class="hcr-chips">' + chips + '</div>' +
            '<div class="hcr-scanbar-nav">' +
                '<button type="button" class="hcr-navbtn" id="hcrPrevScan"' + (hasOlder ? '' : ' disabled') + '>' +
                    '<i class="bx bx-chevron-left"></i>Lần quét trước' +
                '</button>' +
                '<button type="button" class="hcr-navbtn" id="hcrNextScan"' + (hasNewer ? '' : ' disabled') + '>' +
                    'Lần quét sau<i class="bx bx-chevron-right"></i>' +
                '</button>' +
            '</div>'
        );
    }

    function stepSnapshot(offset) {
        var index = state.snapshots.findIndex(function (s) {
            return s.snapshot_code === state.snapshot.snapshot_code;
        });

        var next = state.snapshots[index + offset];
        if (!next) {
            return;
        }

        switchSnapshot(next.snapshot_code);
    }

    /** Đổi lần quét nhưng giữ nguyên shop đang xem. */
    function switchSnapshot(code) {
        $('#hcrSnapshotSelect').val(code);
        loadOverview(code, state.activeSite);
    }

    /* ------------------------------------------------------------------
     * Bước 2: toàn cảnh 1 phiên
     * --------------------------------------------------------------- */

    /**
     * @param {string} snapshotCode
     * @param {string} [keepSite] Giữ nguyên shop đang mở khi đổi sang lần quét
     *                            khác — thao tác so 9h với 21h của cùng 1 shop.
     */
    function loadOverview(snapshotCode, keepSite) {
        $('#hcrSiteList').html('<div class="hcr-placeholder"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải danh sách shop...</div>');

        post('tgs_htsoft_report_overview', { snapshot_code: snapshotCode }).done(function (res) {
            if (!res.success) {
                alertBox('danger', res.data.message || 'Không tải được dữ liệu lần quét');
                return;
            }

            state.snapshot = res.data.snapshot;
            state.sites = res.data.sites || [];
            state.missing = res.data.missing || [];
            state.activeSite = null;

            renderSnapshotMeta();
            renderScanBar();
            renderSummary();
            renderSiteList();

            // Ưu tiên shop đang xem dở, rồi tới shop trên URL, cuối cùng là shop
            // của chính site đang đăng nhập.
            var preselect = $('#hcrPreselectSite').val() || '';
            $('#hcrPreselectSite').val('');
            var auto = keepSite || preselect || CFG.mySiteCode;
            var isShopMode = auto && state.sites.some(function (s) { return s.site_code === auto; });

            if (keepSite && !isShopMode) {
                alertBox('warning', 'Lần quét này không có dữ liệu của shop ' + keepSite);
            }

            // Người của shop chỉ quan tâm shop mình -> giấu danh sách 68 shop đi,
            // dành trọn chiều ngang cho bảng chênh lệch.
            setSidebar(!!isShopMode);
            $('#hcrGlobal').toggleClass('is-open', !isShopMode);

            if (isShopMode) {
                openSite(auto);
            } else {
                $('#hcrDetail').html('<div class="hcr-placeholder"><i class="bx bx-store"></i><p>Chọn shop ở danh sách bên trái, hoặc bấm <strong>Shop của tôi</strong>.</p></div>');
            }
        }).fail(function () {
            alertBox('danger', 'Lỗi kết nối máy chủ');
        });
    }

    /**
     * Hai mốc thời gian là thứ quan trọng nhất: số HTSOFT chốt lúc nào, và hệ
     * thống mới được đọc lúc nào. Lệch giờ giữa hai mốc giải thích phần lớn
     * chênh lệch nên luôn hiển thị nổi bật.
     */
    function renderSnapshotMeta() {
        var snap = state.snapshot;
        if (!snap) {
            return;
        }

        var gap = '';
        if (snap.htsoft_export_at && snap.scanned_at) {
            var diffMin = Math.round(
                (new Date(String(snap.scanned_at).replace(/-/g, '/')) -
                 new Date(String(snap.htsoft_export_at).replace(/-/g, '/'))) / 60000
            );
            if (!isNaN(diffMin)) {
                gap = '<span class="hcr-meta-gap"><i class="bx bx-time-five"></i> cách nhau ' + Math.abs(diffMin) + ' phút</span>';
            }
        }

        var html =
            '<div class="hcr-meta-item hcr-meta-old">' +
                '<span class="hcr-meta-label">Phần mềm cũ (HTSOFT) chốt số lúc</span>' +
                '<span class="hcr-meta-value">' + esc(snap.htsoft_export_at ? shortTime(snap.htsoft_export_at) : 'chưa nhập') + '</span>' +
                (snap.source_file ? '<span class="hcr-meta-sub">' + esc(snap.source_file) + (snap.sheet_name ? ' · ' + esc(snap.sheet_name) : '') + '</span>' : '') +
            '</div>' +
            '<div class="hcr-meta-arrow"><i class="bx bx-right-arrow-alt"></i>' + gap + '</div>' +
            '<div class="hcr-meta-item hcr-meta-new">' +
                '<span class="hcr-meta-label">Phần mềm mới đọc số lúc</span>' +
                '<span class="hcr-meta-value">' + esc(shortTime(snap.scanned_at)) + '</span>' +
                '<span class="hcr-meta-sub">Người quét: ' + esc(snap.created_by_name || '--') + '</span>' +
            '</div>' +
            (snap.admin_note ? '<div class="hcr-meta-note"><i class="bx bx-note me-1"></i>' + esc(snap.admin_note) + '</div>' : '');

        $('#hcrSnapshotMeta').removeClass('d-none').html(html);
    }

    function renderSummary() {
        var snap = state.snapshot;
        var cards = [
            { label: 'Shop được đối chiếu', value: num(snap.total_sites), cls: 'primary', icon: 'bx-store' },
            { label: 'Mặt hàng đang lệch', value: num(snap.total_diff_items), cls: 'danger', icon: 'bx-error-circle' },
            { label: 'Đơn bán trên PM mới', value: num(snap.total_orders), cls: 'info', icon: 'bx-receipt' },
            { label: 'Doanh thu PM mới', value: money(snap.total_revenue), cls: 'success', icon: 'bx-money' },
            { label: 'Shop chưa bán trên PM mới', value: num(snap.sites_no_revenue), cls: 'warning', icon: 'bx-power-off' },
            { label: 'Shop HTSOFT bỏ sót', value: num(state.missing.length), cls: 'secondary', icon: 'bx-minus-circle' }
        ];

        var html = '';
        cards.forEach(function (card) {
            html +=
                '<div class="hcr-stat hcr-stat-' + card.cls + '">' +
                    '<i class="bx ' + card.icon + '"></i>' +
                    '<div><span class="hcr-stat-label">' + card.label + '</span>' +
                    '<span class="hcr-stat-value">' + card.value + '</span></div>' +
                '</div>';
        });

        $('#hcrSummary').html(html);
        $('#hcrGlobalPeek').text(
            num(snap.total_sites) + ' shop · ' +
            num(snap.total_diff_items) + ' mặt hàng lệch · ' +
            num(snap.sites_no_revenue) + ' shop chưa bán trên PM mới'
        );
    }

    /* ------------------------------------------------------------------
     * Danh sách shop (lọc + tìm kiếm)
     * --------------------------------------------------------------- */

    function filteredSites() {
        var keyword = state.keyword.toLowerCase().trim();

        function matches(site) {
            return !keyword ||
                site.site_code.toLowerCase().indexOf(keyword) !== -1 ||
                (site.site_name || '').toLowerCase().indexOf(keyword) !== -1;
        }

        if (state.filter === 'missing') {
            return state.missing.filter(matches);
        }

        return state.sites.filter(function (site) {
            if (state.filter === 'diff' && site.diff_items === 0) {
                return false;
            }
            if (state.filter === 'norev' && site.has_activity === 1) {
                return false;
            }
            return matches(site);
        });
    }

    function renderSiteList() {
        $('[data-count="all"]').text(state.sites.length);
        $('[data-count="diff"]').text(state.sites.filter(function (s) { return s.diff_items > 0; }).length);
        $('[data-count="norev"]').text(state.sites.filter(function (s) { return s.has_activity === 0; }).length);
        $('[data-count="missing"]').text(state.missing.length);

        var rows = filteredSites();
        var $list = $('#hcrSiteList');

        if (!rows.length) {
            $list.html('<div class="hcr-placeholder"><i class="bx bx-search-alt"></i><p>Không có shop nào khớp bộ lọc.</p></div>');
            return;
        }

        // Nhánh "HTSOFT bỏ sót" là shop chưa có trong file Excel nên không có số.
        if (state.filter === 'missing') {
            var missingHtml = '<div class="hcr-missing-hint"><i class="bx bx-info-circle me-1"></i>Shop có mã trong hệ thống nhưng <strong>không xuất hiện trong file HTSOFT</strong> của lần quét này.</div>';
            rows.forEach(function (site) {
                missingHtml +=
                    '<div class="hcr-site-row hcr-site-missing">' +
                        '<div class="hcr-site-code">' + esc(site.site_code) + '</div>' +
                        '<div class="hcr-site-name">' + esc(site.site_name) + '</div>' +
                        '<div class="hcr-site-badges"><span class="badge bg-secondary">Không có trong file Excel</span></div>' +
                    '</div>';
            });
            $list.html(missingHtml);
            return;
        }

        var html = '';
        rows.forEach(function (site) {
            var isActive = state.activeSite === site.site_code ? ' active' : '';
            var badges = site.diff_items > 0
                ? '<span class="badge bg-danger">' + num(site.diff_items) + ' mặt hàng lệch</span>'
                : '<span class="badge bg-success">Khớp hết</span>';

            if (site.has_activity === 0) {
                badges += '<span class="badge bg-warning text-dark">Chưa bán trên PM mới</span>';
            }
            if (site.note_count > 0) {
                badges += '<span class="badge bg-info"><i class="bx bx-comment-detail"></i> ' + site.note_count + '</span>';
            }

            html +=
                '<div class="hcr-site-row' + isActive + '" data-site="' + esc(site.site_code) + '">' +
                    '<div class="hcr-site-code">' + esc(site.site_code) + '</div>' +
                    '<div class="hcr-site-name">' + esc(site.site_name || '(chưa đặt tên)') + '</div>' +
                    '<div class="hcr-site-badges">' + badges + '</div>' +
                    '<div class="hcr-site-rev">' + money(site.net_revenue) + ' · ' + num(site.orders_count) + ' đơn</div>' +
                '</div>';
        });

        $list.html(html);
    }

    /* ------------------------------------------------------------------
     * Chi tiết 1 shop
     * --------------------------------------------------------------- */

    function openSite(siteCode) {
        state.activeSite = siteCode;
        renderSiteList();

        $('#hcrDetail').html('<div class="hcr-placeholder"><span class="spinner-border spinner-border-sm me-2"></span>Đang mở dữ liệu shop ' + esc(siteCode) + '...</div>');

        post('tgs_htsoft_report_site', {
            snapshot_code: state.snapshot.snapshot_code,
            site_code: siteCode
        }).done(function (res) {
            if (!res.success) {
                $('#hcrDetail').html('<div class="alert alert-danger m-3">' + esc(res.data.message) + '</div>');
                return;
            }
            state.detail = res.data;
            renderDetail();
        }).fail(function () {
            $('#hcrDetail').html('<div class="alert alert-danger m-3">Lỗi kết nối máy chủ</div>');
        });
    }

    function renderDetail() {
        var d = state.detail;
        var stats = d.stats || {};
        var items = (d.items || []).slice();

        // Lệch nhiều nhất lên đầu để người đọc thấy ngay việc cần giải thích.
        items.sort(function (a, b) {
            return Math.abs(b.diff) - Math.abs(a.diff);
        });

        var visible = state.onlyDiff
            ? items.filter(function (item) { return Math.abs(item.diff) > 0.01; })
            : items;

        var header =
            '<div class="hcr-detail-head">' +
                '<div>' +
                    '<h2 class="hcr-shop-name">' +
                        '<span class="hcr-shop-code">' + esc(d.site.site_code) + '</span>' +
                        esc(d.site.site_name || 'Shop') +
                    '</h2>' +
                    '<div class="hcr-detail-sub">' +
                        'Số liệu chốt lúc <strong>' + esc(shortTime(d.snapshot.htsoft_export_at)) + '</strong> (HTSOFT)' +
                        ' và <strong>' + esc(shortTime(d.snapshot.scanned_at)) + '</strong> (phần mềm mới)' +
                    '</div>' +
                '</div>' +
                '<div class="d-flex gap-2 align-items-center">' +
                    '<button class="hcr-sidebar-toggle" id="hcrSidebarToggle"></button>' +
                    '<button class="btn btn-sm btn-outline-secondary" id="hcrHistoryBtn"><i class="bx bx-history me-1"></i>Nhật ký ghi chú</button>' +
                '</div>' +
            '</div>';

        var diffCount = parseFloat(stats.diff_items) || 0;
        var hero;
        if (diffCount > 0) {
            hero =
                '<div class="hcr-hero hcr-hero--diff">' +
                    '<i class="bx bx-error-circle hcr-hero-icon"></i>' +
                    '<div class="hcr-hero-main">' +
                        '<div class="hcr-hero-title">' + num(diffCount) + ' mặt hàng đang lệch, cần bạn giải thích</div>' +
                        '<div class="hcr-hero-sub">' +
                            'So với HTSOFT, phần mềm mới đang <b class="text-success">thừa +' + num(stats.diff_qty_plus) + '</b>' +
                            ' và <b class="text-danger">thiếu ' + num(stats.diff_qty_minus) + '</b> đơn vị.' +
                        '</div>' +
                    '</div>' +
                    '<div class="hcr-hero-cta">' +
                        '<i class="bx bx-down-arrow-alt"></i> Xem bảng bên dưới, gõ lý do vào ô ' +
                        '<strong>Ghi chú giải thích</strong>. Gõ xong là tự lưu, không cần bấm nút nào.' +
                    '</div>' +
                '</div>';
        } else {
            hero =
                '<div class="hcr-hero hcr-hero--ok">' +
                    '<i class="bx bx-check-circle hcr-hero-icon"></i>' +
                    '<div class="hcr-hero-main">' +
                        '<div class="hcr-hero-title">Khớp hoàn toàn với HTSOFT</div>' +
                        '<div class="hcr-hero-sub">Cả ' + num(stats.total_items) + ' mặt hàng đều trùng số. Không cần giải trình gì thêm.</div>' +
                    '</div>' +
                '</div>';
        }

        var warn = d.site.has_activity === 0
            ? '<div class="hcr-warnbox"><i class="bx bx-error"></i><div>' +
              '<strong>Shop chưa bán đơn nào trên phần mềm mới trong ngày quét.</strong><br>' +
              'Theo chỉ thị, shop phải chạy song song cả hai phần mềm thì mới đối chiếu được số liệu.' +
              '</div></div>'
            : '';

        var salesline =
            '<div class="hcr-salesline">' +
                '<span><i class="bx bx-receipt"></i>Bán được <b>' + num(stats.orders_count) + '</b> đơn</span>' +
                '<span><i class="bx bx-money"></i>Doanh thu <b>' + money(stats.revenue) + '</b></span>' +
                '<span><i class="bx bx-undo"></i>Hoàn khách <b>' + money(stats.refund_amount) + '</b></span>' +
                '<span><i class="bx bx-wallet"></i>Thực thu <b>' + money(stats.net_revenue) + '</b></span>' +
                '<span class="hcr-sales-spacer">Đối chiếu ' + num(stats.total_items) + ' mặt hàng</span>' +
            '</div>';

        var siteNote =
            '<div class="hcr-note-block">' +
                '<label><i class="bx bx-message-square-edit me-1"></i>Ghi chú chung của shop ' + esc(d.site.site_code) + '</label>' +
                '<textarea class="form-control hcr-note-input" rows="2" data-scope="site" data-sku=""' +
                    ' placeholder="Lý do chung cho cả shop, vd: hàng về sau giờ HTSOFT chốt số, phiếu nhập chưa duyệt kịp...">' + esc(d.site_note.text) + '</textarea>' +
                '<div class="hcr-note-status" data-status-for="site">' + noteStatusText(d.site_note) + '</div>' +
            '</div>';

        var liveAt = state.liveStockAt[state.activeSite];
        var tableToolbar =
            '<div class="hcr-table-toolbar">' +
                '<div class="form-check form-switch mb-0">' +
                    '<input class="form-check-input" type="checkbox" id="hcrOnlyDiff" ' + (state.onlyDiff ? 'checked' : '') + '>' +
                    '<label class="form-check-label small" for="hcrOnlyDiff">Chỉ hiện mặt hàng bị lệch</label>' +
                '</div>' +
                '<div class="input-group input-group-sm hcr-item-search">' +
                    '<span class="input-group-text"><i class="bx bx-search"></i></span>' +
                    '<input type="text" class="form-control" id="hcrItemSearch" placeholder="Lọc mã hàng / tên sản phẩm...">' +
                '</div>' +
                '<button class="btn btn-sm btn-outline-primary" id="hcrLiveStockBtn">' +
                    '<i class="bx bx-refresh me-1"></i>' + (liveAt ? 'Tra lại tồn hiện tại' : 'Tra tồn hiện tại') +
                '</button>' +
                '<span class="small text-muted" id="hcrLiveStockAt">' +
                    (liveAt ? 'đã tra lúc ' + esc(shortTime(liveAt)) : '') +
                '</span>' +
                '<span class="hcr-rowcount">' + num(visible.length) + ' dòng</span>' +
            '</div>';

        var rows = '';
        if (!visible.length) {
            rows = '<tr><td colspan="7"><div class="hcr-placeholder"><i class="bx bx-check-circle"></i><p>Không có mặt hàng nào lệch.</p></div></td></tr>';
        } else {
            visible.forEach(function (item) {
                var note = d.item_notes[item.sku] || { text: '', by: '', at: '' };
                var abs = Math.abs(item.diff);
                var diffCls = item.diff > 0 ? 'text-success' : (item.diff < 0 ? 'text-danger' : 'text-muted');
                var diffTxt = item.diff > 0 ? '+' + num(item.diff) : num(item.diff);

                rows +=
                    '<tr data-search="' + esc((item.sku + ' ' + item.name).toLowerCase()) + '">' +
                        '<td class="hcr-cell-sku"><code>' + esc(item.sku) + '</code></td>' +
                        '<td class="hcr-cell-name" title="' + esc(item.name) + '">' + esc(item.name) + '</td>' +
                        '<td class="hcr-cell-cmp hcr-cell-cmp-first hcr-cell-num text-end">' + num(item.htsoft_qty) + '</td>' +
                        '<td class="hcr-cell-cmp hcr-cell-num text-end">' + num(item.system_qty) + '</td>' +
                        '<td class="hcr-cell-diff text-end ' + diffCls + (abs > 10 ? ' is-big' : '') + '">' + diffTxt + '</td>' +
                        '<td class="hcr-cell-note">' +
                            '<textarea class="form-control form-control-sm hcr-note-input" rows="1" data-scope="item"' +
                                ' data-sku="' + esc(item.sku) + '" placeholder="Vì sao lệch?">' + esc(note.text) + '</textarea>' +
                            '<div class="hcr-note-status" data-status-for="' + esc(item.sku) + '">' + noteStatusText(note) + '</div>' +
                        '</td>' +
                        '<td class="hcr-cell-live text-end" data-live-sku="' + esc(item.sku) + '">' + liveCellHtml(item) + '</td>' +
                    '</tr>';
            });
        }

        var table =
            '<div class="hcr-table-wrap">' +
                '<table class="table table-sm table-hover hcr-table mb-0">' +
                    '<thead><tr>' +
                        '<th style="width:10%">Mã hàng</th>' +
                        '<th style="width:24%">Tên sản phẩm</th>' +
                        '<th style="width:9%" class="text-end hcr-th-cmp hcr-th-cmp-first">Phần mềm cũ<span class="hcr-th-sub">HTSOFT</span></th>' +
                        '<th style="width:9%" class="text-end hcr-th-cmp">Phần mềm mới<span class="hcr-th-sub">lúc quét</span></th>' +
                        '<th style="width:8%" class="text-end hcr-th-diff">Lệch<span class="hcr-th-sub">mới − cũ</span></th>' +
                        '<th style="width:25%">Ghi chú giải thích<span class="hcr-th-sub">gõ xong tự lưu</span></th>' +
                        '<th style="width:15%" class="text-end hcr-th-live">Tồn hiện tại<span class="hcr-th-sub">tham khảo</span></th>' +
                    '</tr></thead>' +
                    '<tbody>' + rows + '</tbody>' +
                '</table>' +
            '</div>';

        var salesNotes = '';
        if (d.sales_notes && d.sales_notes.length) {
            salesNotes = '<div class="hcr-sales-notes"><h6><i class="bx bx-note me-1"></i>Ghi chú nhân viên đã ghi trên phiếu bán hàng hôm đó (' + d.sales_notes.length + ')</h6><ul>';
            d.sales_notes.forEach(function (note) {
                salesNotes += '<li><span class="text-muted">' + esc(shortTime(note.created_at)) + '</span> — ' + esc(note.note) + '</li>';
            });
            salesNotes += '</ul></div>';
        }

        $('#hcrDetail').html(
            header +
            '<div class="hcr-detail-body">' +
                hero + warn + salesline + siteNote + tableToolbar + table + salesNotes +
            '</div>'
        );

        setSidebar(state.sidebarCollapsed);
    }

    function noteStatusText(note) {
        if (!note || !note.at || !note.text) {
            return '';
        }
        return '<i class="bx bx-check-circle text-success"></i> ' + esc(note.by) + ' · ' + esc(shortTime(note.at));
    }

    /**
     * Ô "Tồn hiện tại" — chỉ để tham khảo, không thay thế số đã lưu vết.
     *
     * Ngoài con số, hiển thị thêm hai thông tin quyết định cách đọc dòng đó:
     *  - so với HTSOFT: giờ đã khớp hay vẫn còn lệch
     *  - so với lúc quét: hệ thống có phát sinh thêm sau giờ quét không, tức
     *    dòng "lệch" trên báo cáo có thể đã tự hết do nhập/bán muộn.
     */
    function liveCellHtml(item) {
        var map = state.liveStock[state.activeSite];
        if (!map || !(item.sku in map)) {
            return '<span class="hcr-live-empty">–</span>';
        }

        var current = map[item.sku];
        var vsHtsoft = current - item.htsoft_qty;
        var moved = current - item.system_qty;

        var matched = Math.abs(vsHtsoft) <= 0.01;
        var sub = matched
            ? '<span class="hcr-live-match"><i class="bx bx-check"></i> giờ đã khớp HTSOFT</span>'
            : '<span class="hcr-live-off">' + (vsHtsoft > 0 ? '+' : '−') + num(Math.abs(vsHtsoft)) + ' vs HTSOFT</span>';

        if (Math.abs(moved) > 0.01) {
            sub += '<span class="hcr-live-moved">' +
                   (moved > 0 ? '↑ +' : '↓ −') + num(Math.abs(moved)) + ' từ lúc quét</span>';
        }

        return '<div class="hcr-live-qty' + (matched ? ' hcr-live-ok' : '') + '">' + num(current) + '</div>' +
               '<div class="hcr-live-sub">' + sub + '</div>';
    }

    /** Tra tồn realtime theo lô để shop vài nghìn mã không làm nghẽn request. */
    function loadLiveStock() {
        if (!state.detail || !state.activeSite) {
            return;
        }

        var siteCode = state.activeSite;
        var skus = [];
        $('.hcr-table tbody tr[data-search]:visible').each(function () {
            var sku = $(this).find('[data-live-sku]').data('live-sku');
            if (sku !== undefined && sku !== null) {
                skus.push(String(sku));
            }
        });

        if (!skus.length) {
            alertBox('info', 'Không có dòng nào đang hiển thị để tra tồn');
            return;
        }

        var $btn = $('#hcrLiveStockBtn').prop('disabled', true);
        var chunkSize = 400;
        var chunks = [];
        for (var i = 0; i < skus.length; i += chunkSize) {
            chunks.push(skus.slice(i, i + chunkSize));
        }

        state.liveStock[siteCode] = state.liveStock[siteCode] || {};

        var done = 0;
        var failed = false;

        function runChunk(index) {
            if (index >= chunks.length) {
                $btn.prop('disabled', false).html('<i class="bx bx-refresh me-1"></i>Tra lại tồn hiện tại');
                if (!failed) {
                    $('#hcrLiveStockAt').text('đã tra lúc ' + shortTime(state.liveStockAt[siteCode]));
                }
                return;
            }

            $btn.html('<span class="spinner-border spinner-border-sm me-1"></span>Đang tra ' + done + '/' + skus.length);

            post('tgs_htsoft_report_live_stock', {
                snapshot_code: state.snapshot.snapshot_code,
                site_code: siteCode,
                skus: JSON.stringify(chunks[index])
            }).done(function (res) {
                if (!res.success) {
                    failed = true;
                    alertBox('danger', res.data.message || 'Không tra được tồn hiện tại');
                    $btn.prop('disabled', false).html('<i class="bx bx-refresh me-1"></i>Tra tồn hiện tại');
                    return;
                }

                state.liveStockAt[siteCode] = res.data.at;
                $.extend(state.liveStock[siteCode], res.data.stock);
                done += chunks[index].length;

                // Vẽ lại từng ô thay vì render lại cả bảng, tránh mất chữ đang
                // gõ dở trong ô ghi chú.
                if (state.activeSite === siteCode) {
                    (state.detail.items || []).forEach(function (item) {
                        if (item.sku in res.data.stock) {
                            $('[data-live-sku="' + String(item.sku).replace(/"/g, '\\"') + '"]').html(liveCellHtml(item));
                        }
                    });
                }

                runChunk(index + 1);
            }).fail(function () {
                failed = true;
                alertBox('danger', 'Lỗi kết nối khi tra tồn hiện tại');
                $btn.prop('disabled', false).html('<i class="bx bx-refresh me-1"></i>Tra tồn hiện tại');
            });
        }

        runChunk(0);
    }

    /* ------------------------------------------------------------------
     * Ghi chú: tự lưu sau khi ngừng gõ
     * --------------------------------------------------------------- */

    var saveTimers = {};

    function scheduleSave($input) {
        var scope = $input.data('scope');
        var sku = String($input.data('sku') || '');
        var key = scope + '|' + sku;

        clearTimeout(saveTimers[key]);
        setStatus(scope, sku, '<i class="bx bx-edit"></i> đang gõ...', 'saving');

        saveTimers[key] = setTimeout(function () {
            saveNote(scope, sku, $input.val());
        }, AUTOSAVE_DELAY);
    }

    function saveNote(scope, sku, text) {
        setStatus(scope, sku, '<span class="spinner-border spinner-border-sm"></span> đang lưu...', 'saving');

        post('tgs_htsoft_report_save_note', {
            snapshot_code: state.snapshot.snapshot_code,
            site_code: state.activeSite,
            scope: scope,
            sku: sku,
            note_text: text
        }).done(function (res) {
            if (!res.success) {
                setStatus(scope, sku, '<i class="bx bx-x-circle"></i> ' + esc(res.data.message), 'error');
                return;
            }

            setStatus(scope, sku,
                '<i class="bx bx-check-circle"></i> đã lưu · ' + esc(res.data.by) + ' · ' + esc(shortTime(res.data.at)),
                'saved');

            if (state.detail) {
                var entry = { text: text, by: res.data.by, at: res.data.at };
                if (scope === 'site') {
                    state.detail.site_note = entry;
                } else {
                    state.detail.item_notes[sku] = entry;
                }
            }
            refreshNoteCount();
        }).fail(function () {
            setStatus(scope, sku, '<i class="bx bx-x-circle"></i> lỗi kết nối, thử gõ lại', 'error');
        });
    }

    function setStatus(scope, sku, html, cls) {
        var selector = scope === 'site' ? '[data-status-for="site"]' : '[data-status-for="' + sku.replace(/"/g, '\\"') + '"]';
        $(selector).removeClass('saving saved error').addClass(cls).html(html);
    }

    /** Giữ badge số ghi chú ở danh sách trái khớp với thực tế vừa lưu. */
    function refreshNoteCount() {
        var site = state.sites.filter(function (s) { return s.site_code === state.activeSite; })[0];
        if (!site || !state.detail) {
            return;
        }

        var count = 0;
        if (state.detail.site_note && state.detail.site_note.text) {
            count++;
        }
        Object.keys(state.detail.item_notes || {}).forEach(function (key) {
            if (state.detail.item_notes[key].text) {
                count++;
            }
        });

        site.note_count = count;
        renderSiteList();
    }

    /* ------------------------------------------------------------------
     * Sự kiện
     * --------------------------------------------------------------- */

    $('#hcrDateFilter').on('change', function () {
        loadSnapshots();
    });

    $('#hcrSnapshotSelect').on('change', function () {
        var code = $(this).val();
        if (code) {
            loadOverview(code, state.activeSite);
        }
    });

    $(document).on('click', '.hcr-chip[data-scan]', function () {
        var code = $(this).data('scan');
        if (code !== state.snapshot.snapshot_code) {
            switchSnapshot(String(code));
        }
    });

    $(document).on('click', '#hcrPrevScan', function () {
        stepSnapshot(1);   // index lớn hơn = quét cũ hơn
    });

    $(document).on('click', '#hcrNextScan', function () {
        stepSnapshot(-1);
    });

    $('#hcrSiteSearch').on('input', function () {
        state.keyword = $(this).val();
        if (state.sidebarCollapsed && state.keyword) {
            setSidebar(false);
        }
        renderSiteList();
    });

    $('#hcrGlobalToggle').on('click', function () {
        $('#hcrGlobal').toggleClass('is-open');
    });

    $(document).on('click', '#hcrSidebarToggle', function () {
        setSidebar(!state.sidebarCollapsed);
    });

    $('#hcrMySiteBtn').on('click', function () {
        if (!CFG.mySiteCode) {
            alertBox('info', 'Website hiện tại chưa được gán mã shop');
            return;
        }

        if (state.sites.some(function (s) { return s.site_code === CFG.mySiteCode; })) {
            $('#hcrSiteSearch').val('');
            state.keyword = '';
            state.filter = 'all';
            $('#hcrFilterTabs .hcr-tab').removeClass('is-active').filter('[data-filter="all"]').addClass('is-active');
            state.sidebarCollapsed = true;
            openSite(CFG.mySiteCode);
        } else {
            alertBox('warning', 'Shop ' + CFG.mySiteCode + ' không có trong lần quét này — HTSOFT chưa xuất dữ liệu shop này.');
        }
    });

    $(document).on('click', '#hcrFilterTabs .hcr-tab', function () {
        $('#hcrFilterTabs .hcr-tab').removeClass('is-active');
        $(this).addClass('is-active');
        state.filter = $(this).data('filter');
        renderSiteList();
    });

    $(document).on('click', '.hcr-site-row[data-site]', function () {
        openSite($(this).data('site').toString());
    });

    $(document).on('input', '.hcr-note-input', function () {
        scheduleSave($(this));
    });

    // Rời ô là lưu ngay, không đợi hết debounce.
    $(document).on('blur', '.hcr-note-input', function () {
        var $input = $(this);
        var scope = $input.data('scope');
        var sku = String($input.data('sku') || '');
        var key = scope + '|' + sku;

        if (saveTimers[key]) {
            clearTimeout(saveTimers[key]);
            delete saveTimers[key];
            saveNote(scope, sku, $input.val());
        }
    });

    $(document).on('click', '#hcrLiveStockBtn', function () {
        loadLiveStock();
    });

    $(document).on('change', '#hcrOnlyDiff', function () {
        state.onlyDiff = $(this).is(':checked');
        renderDetail();
    });

    $(document).on('input', '#hcrItemSearch', function () {
        var keyword = $(this).val().toLowerCase().trim();
        var shown = 0;
        $('.hcr-table tbody tr[data-search]').each(function () {
            var haystack = String($(this).data('search') || '');
            var match = keyword === '' || haystack.indexOf(keyword) !== -1;
            $(this).toggle(match);
            if (match) {
                shown++;
            }
        });
        $('.hcr-rowcount').text(num(shown) + ' dòng');
    });

    $(document).on('click', '#hcrHistoryBtn', function () {
        var $body = $('#hcrHistoryBody').html('<div class="hcr-placeholder"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải...</div>');
        new bootstrap.Modal(document.getElementById('hcrHistoryModal')).show();

        post('tgs_htsoft_report_note_history', {
            snapshot_code: state.snapshot.snapshot_code,
            site_code: state.activeSite,
            all_snapshots: 1
        }).done(function (res) {
            if (!res.success) {
                $body.html('<div class="alert alert-danger">' + esc(res.data.message) + '</div>');
                return;
            }

            if (!res.data.entries.length) {
                $body.html('<div class="hcr-placeholder"><i class="bx bx-history"></i><p>Chưa có thay đổi ghi chú nào được ghi nhận.</p></div>');
                return;
            }

            var html = '';
            res.data.entries.forEach(function (entry) {
                var actionLabel = entry.action === 'create' ? 'Thêm mới' : (entry.action === 'clear' ? 'Xoá' : 'Sửa');
                html +=
                    '<div class="hcr-history-item">' +
                        '<div class="hcr-history-head">' +
                            '<span class="badge bg-' + (entry.action === 'clear' ? 'secondary' : 'primary') + '">' + actionLabel + '</span> ' +
                            '<strong>' + esc(entry.user_name) + '</strong> · ' + esc(shortTime(entry.at)) +
                            (entry.scope === 'item' ? ' · <code>' + esc(entry.sku) + '</code>' : ' · ghi chú chung') +
                        '</div>' +
                        (entry.old_text ? '<div class="hcr-history-old">− ' + esc(entry.old_text) + '</div>' : '') +
                        (entry.new_text ? '<div class="hcr-history-new">+ ' + esc(entry.new_text) + '</div>' : '') +
                    '</div>';
            });
            $body.html(html);
        });
    });

    $('#hcrCopyLinkBtn').on('click', function () {
        if (!state.snapshot) {
            return;
        }
        var url = CFG.reportUrl + '&snapshot=' + encodeURIComponent(state.snapshot.snapshot_code);
        if (state.activeSite) {
            url += '&shop=' + encodeURIComponent(state.activeSite);
        }

        var $tmp = $('<input>').val(url).appendTo('body').select();
        document.execCommand('copy');
        $tmp.remove();

        alertBox('success', 'Đã copy link báo cáo');
    });

    loadSnapshots();
});
