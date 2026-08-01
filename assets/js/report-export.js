/**
 * Xuất Excel báo cáo đối chiếu HTSOFT.
 *
 * Hai chế độ: một shop (1 sheet) hoặc tất cả shop (1 sheet TỔNG QUAN + mỗi shop
 * 1 sheet). Toàn bộ dữ liệu lấy trong MỘT request để không đứt giữa chừng khi
 * có tới vài chục shop.
 *
 * Người đọc file là cấp trên, không phải người làm kho: nên sheet tổng quan
 * phải trả lời ngay ba câu — shop nào chưa bán trên phần mềm mới, shop nào còn
 * lệch chưa giải trình, và lệch đã được giải thích ra sao.
 */
jQuery(document).ready(function ($) {
    'use strict';

    if (typeof tgsHtsoftReport === 'undefined') {
        return;
    }

    var CFG = tgsHtsoftReport;

    /* ------------------------------------------------------------------
     * Bảng màu dùng chung
     * --------------------------------------------------------------- */

    var C = {
        navy:      '1F4E79',
        blue:      '2E75B6',
        blueSoft:  'D6E4F0',
        blueZebra: 'F5F9FD',
        teal:      '0F766E',
        green:     '207245',
        greenSoft: 'E6F4EA',
        red:       'C00000',
        redSoft:   'FDE9E9',
        amber:     'B45309',
        amberSoft: 'FEF3C7',
        purple:    '7B2D8B',
        purpleSoft:'F5EEF8',
        grey:      '6B7280',
        greySoft:  'F3F4F6',
        white:     'FFFFFF'
    };

    var BORDER = {
        top:    { style: 'thin', color: { rgb: 'B4B4B4' } },
        bottom: { style: 'thin', color: { rgb: 'B4B4B4' } },
        left:   { style: 'thin', color: { rgb: 'B4B4B4' } },
        right:  { style: 'thin', color: { rgb: 'B4B4B4' } }
    };

    /* ------------------------------------------------------------------
     * Tiện ích dựng ô
     * --------------------------------------------------------------- */

    /** Ghi 1 ô kèm style vào worksheet đang dựng thủ công. */
    function put(ws, r, c, value, style, type) {
        var ref = XLSX.utils.encode_cell({ r: r, c: c });
        ws[ref] = { v: value === null || value === undefined ? '' : value, t: type || (typeof value === 'number' ? 'n' : 's') };
        if (style) {
            ws[ref].s = style;
        }
        return ref;
    }

    function merge(ws, r1, c1, r2, c2) {
        ws['!merges'] = ws['!merges'] || [];
        ws['!merges'].push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
    }

    /** Tô nền cho cả dải ô, kể cả ô trống, để vùng merge không bị hở màu. */
    function fillRange(ws, r, cFrom, cTo, style) {
        for (var c = cFrom; c <= cTo; c++) {
            var ref = XLSX.utils.encode_cell({ r: r, c: c });
            if (!ws[ref]) {
                ws[ref] = { v: '', t: 's' };
            }
            ws[ref].s = $.extend(true, {}, ws[ref].s || {}, style);
        }
    }

    function titleStyle(bg) {
        return {
            font: { bold: true, sz: 14, color: { rgb: C.white } },
            fill: { fgColor: { rgb: bg || C.navy } },
            alignment: { horizontal: 'center', vertical: 'center' }
        };
    }

    function headStyle(bg) {
        return {
            font: { bold: true, sz: 10.5, color: { rgb: C.white } },
            fill: { fgColor: { rgb: bg || C.blue } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: BORDER
        };
    }

    function labelStyle() {
        return {
            font: { bold: true, sz: 10, color: { rgb: C.navy } },
            fill: { fgColor: { rgb: C.blueSoft } },
            alignment: { vertical: 'center' },
            border: BORDER
        };
    }

    function valueStyle(opt) {
        return $.extend({
            font: { sz: 10, color: { rgb: '212529' } },
            fill: { fgColor: { rgb: C.white } },
            alignment: { vertical: 'center' },
            border: BORDER
        }, opt || {});
    }

    function cellStyle(bg, opt) {
        return $.extend(true, {
            fill: { fgColor: { rgb: bg } },
            alignment: { vertical: 'center' },
            border: BORDER,
            font: { sz: 10 }
        }, opt || {});
    }

    function fmtDateTime(value) {
        if (!value) {
            return '--';
        }
        var parts = String(value).replace('T', ' ').split(' ');
        var d = (parts[0] || '').split('-');
        var t = (parts[1] || '').slice(0, 5);
        return d.length === 3 ? (t + ' ' + d[2] + '/' + d[1] + '/' + d[0]) : String(value);
    }

    /** Thời điểm bấm xuất file, theo giờ máy người xuất. */
    function exportedAt() {
        var d = new Date();
        var p = function (n) { return n < 10 ? '0' + n : String(n); };
        return p(d.getHours()) + ':' + p(d.getMinutes()) + ' ngày ' +
               p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
    }

    var MONEY_FMT = '#,##0" đ"';
    var NUM_FMT = '#,##0';

    /* ------------------------------------------------------------------
     * Sheet TỔNG QUAN
     * --------------------------------------------------------------- */

    /** Mỗi shop đã được gắn sẵn site.__sheet để đặt link nhảy nội bộ. */
    function buildOverviewSheet(data) {
        var snap = data.snapshot;
        var sites = data.sites;
        var missing = data.missing || [];
        var ws = {};
        var LAST = 13;
        var r = 0;

        // --- Tiêu đề ---
        put(ws, r, 0, 'BÁO CÁO ĐỐI CHIẾU TỒN KHO: PHẦN MỀM CŨ (HTSOFT) ↔ PHẦN MỀM MỚI', titleStyle(C.navy));
        fillRange(ws, r, 0, LAST, { fill: { fgColor: { rgb: C.navy } } });
        merge(ws, r, 0, r, LAST);
        r++;

        // Chỉ cần biết file xuất lúc nào; mốc chốt số của hai phần mềm là chi
        // tiết vận hành, cấp trên không dùng tới.
        put(ws, r, 0, 'Xuất lúc ' + exportedAt(), {
            font: { italic: true, sz: 10.5, color: { rgb: C.white } },
            fill: { fgColor: { rgb: C.blue } },
            alignment: { horizontal: 'center', vertical: 'center' }
        });
        fillRange(ws, r, 0, LAST, { fill: { fgColor: { rgb: C.blue } } });
        merge(ws, r, 0, r, LAST);
        r += 2;

        // --- Các con số tổng ---
        var settledCount = sites.filter(function (s) { return s.clearance; }).length;
        var noRevenue = sites.filter(function (s) { return s.has_activity === 0; });
        var stillDiff = sites.filter(function (s) { return s.diff_items > 0 && !s.clearance; });

        var totals = [
            ['Shop được đối chiếu', sites.length, C.blue],
            ['Mặt hàng đang lệch', sites.reduce(function (a, s) { return a + s.diff_items; }, 0), C.red],
            ['Shop đã giải trình & cân hàng', settledCount, C.green],
            ['Shop CÒN LỆCH chưa giải trình', stillDiff.length, C.red],
            ['Shop chưa bán trên phần mềm mới', noRevenue.length, C.amber]
        ];

        put(ws, r, 0, 'TÌNH HÌNH CHUNG', headStyle(C.teal));
        fillRange(ws, r, 0, LAST, { fill: { fgColor: { rgb: C.teal } } });
        merge(ws, r, 0, r, LAST);
        r++;

        totals.forEach(function (t) {
            put(ws, r, 0, t[0], labelStyle());
            put(ws, r, 2, t[1], valueStyle({
                font: { bold: true, sz: 12, color: { rgb: t[2] } },
                alignment: { horizontal: 'left', vertical: 'center' },
                numFmt: NUM_FMT
            }), 'n');
            fillRange(ws, r, 0, 1, { fill: { fgColor: { rgb: C.blueSoft } }, border: BORDER });
            fillRange(ws, r, 2, 3, { border: BORDER });
            merge(ws, r, 0, r, 1);
            merge(ws, r, 2, r, 3);
            r++;
        });

        // Doanh thu tổng
        var revTotal = sites.reduce(function (a, s) { return a + s.net_revenue; }, 0);
        var orderTotal = sites.reduce(function (a, s) { return a + s.orders_count; }, 0);
        put(ws, r, 0, 'Tổng đơn / thực thu toàn hệ thống', labelStyle());
        put(ws, r, 2, orderTotal + ' đơn · ' + revTotal.toLocaleString('vi-VN') + ' đ',
            valueStyle({ font: { bold: true, sz: 11, color: { rgb: C.green } } }));
        fillRange(ws, r, 0, 1, { fill: { fgColor: { rgb: C.blueSoft } }, border: BORDER });
        fillRange(ws, r, 2, 5, { border: BORDER });
        merge(ws, r, 0, r, 1);
        merge(ws, r, 2, r, 5);
        r += 2;

        // --- Bảng danh sách shop ---
        put(ws, r, 0, 'CHI TIẾT TỪNG SHOP', titleStyle(C.blue));
        fillRange(ws, r, 0, LAST, { fill: { fgColor: { rgb: C.blue } } });
        merge(ws, r, 0, r, LAST);
        r++;

        var headers = ['STT', 'Mã shop', 'Tên shop', 'SP lệch', 'Thừa', 'Thiếu',
                       'Số đơn', 'Doanh thu', 'Hoàn khách', 'Thực thu',
                       'Trạng thái', 'Phiếu cân hàng', 'Người xử lý', 'Giải trình chung của shop'];
        headers.forEach(function (h, i) {
            put(ws, r, i, h, headStyle(C.blue));
        });
        var headerRow = r;
        r++;

        sites.forEach(function (s, idx) {
            var zebra = idx % 2 === 0 ? C.white : C.blueZebra;
            var cl = s.clearance;

            var status, statusColor, statusBg;
            if (s.diff_items === 0) {
                status = 'Khớp hoàn toàn';   statusColor = C.green; statusBg = C.greenSoft;
            } else if (cl) {
                status = 'Đã giải trình & cân'; statusColor = C.green; statusBg = C.greenSoft;
            } else {
                status = 'CÒN LỆCH — chưa xử lý'; statusColor = C.red; statusBg = C.redSoft;
            }

            var generalNote = cl && cl.general_note ? cl.general_note : (s.report_site_note || '');

            put(ws, r, 0, idx + 1, cellStyle(zebra, { alignment: { horizontal: 'center', vertical: 'center' } }), 'n');
            // Mã shop là link nhảy thẳng sang sheet của shop đó — sếp bấm một
            // phát là tới, khỏi dò trong 65 tab ở đáy cửa sổ Excel.
            var codeRef = put(ws, r, 1, s.site_code, cellStyle(zebra, {
                font: { bold: true, sz: 10, underline: true, color: { rgb: '0563C1' } },
                alignment: { horizontal: 'center', vertical: 'center' }
            }));
            if (s.__sheet) {
                ws[codeRef].l = {
                    Target: "#'" + s.__sheet.replace(/'/g, "''") + "'!A1",
                    Tooltip: 'Mở sheet của shop ' + s.site_code
                };
            }
            put(ws, r, 2, s.site_name || '', cellStyle(zebra));
            put(ws, r, 3, s.diff_items, cellStyle(s.diff_items > 0 ? C.redSoft : zebra, {
                font: { bold: true, sz: 10, color: { rgb: s.diff_items > 0 ? C.red : C.grey } },
                alignment: { horizontal: 'center', vertical: 'center' }, numFmt: NUM_FMT
            }), 'n');
            put(ws, r, 4, s.diff_qty_plus, cellStyle(zebra, { font: { color: { rgb: C.green }, sz: 10 }, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: NUM_FMT }), 'n');
            put(ws, r, 5, s.diff_qty_minus, cellStyle(zebra, { font: { color: { rgb: C.red }, sz: 10 }, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: NUM_FMT }), 'n');
            put(ws, r, 6, s.orders_count, cellStyle(zebra, { alignment: { horizontal: 'right', vertical: 'center' }, numFmt: NUM_FMT }), 'n');
            put(ws, r, 7, s.revenue, cellStyle(zebra, { alignment: { horizontal: 'right', vertical: 'center' }, numFmt: MONEY_FMT }), 'n');
            put(ws, r, 8, s.refund_amount, cellStyle(zebra, { font: { color: { rgb: C.amber }, sz: 10 }, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: MONEY_FMT }), 'n');
            put(ws, r, 9, s.net_revenue, cellStyle(zebra, { font: { bold: true, sz: 10, color: { rgb: C.green } }, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: MONEY_FMT }), 'n');
            put(ws, r, 10, status, cellStyle(statusBg, { font: { bold: true, sz: 9.5, color: { rgb: statusColor } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } }));
            put(ws, r, 11, cl && cl.ledger_code ? cl.ledger_code : '', cellStyle(zebra, { alignment: { horizontal: 'center', vertical: 'center' } }));
            put(ws, r, 12, cl && cl.cleared_by_name ? cl.cleared_by_name : '', cellStyle(zebra, { font: { sz: 9.5 } }));
            put(ws, r, 13, generalNote, cellStyle(generalNote ? C.amberSoft : zebra, { alignment: { wrapText: true, vertical: 'center' }, font: { sz: 9.5 } }));

            // Shop chưa bán trên PM mới: tô cả dòng để nhìn phát ra ngay.
            if (s.has_activity === 0) {
                fillRange(ws, r, 0, LAST, { fill: { fgColor: { rgb: C.amberSoft } } });
            }
            r++;
        });
        r++;

        // --- Khối: shop chưa bán trên phần mềm mới ---
        r = appendListBlock(ws, r, LAST, C.amber, C.amberSoft,
            'SHOP CHƯA BÁN ĐƠN NÀO TRÊN PHẦN MỀM MỚI (' + noRevenue.length + ')',
            'Theo chỉ thị, shop phải chạy song song cả hai phần mềm thì mới đối chiếu được số liệu.',
            noRevenue.map(function (s) { return [s.site_code, s.site_name || '', s.diff_items + ' mặt hàng lệch']; }));

        // --- Khối: shop còn lệch chưa xử lý ---
        r = appendListBlock(ws, r, LAST, C.red, C.redSoft,
            'SHOP CÒN LỆCH NHƯNG CHƯA GIẢI TRÌNH (' + stillDiff.length + ')',
            'Những shop này chưa đăng nhập phần mềm mới để giải trình và cân hàng.',
            stillDiff.map(function (s) { return [s.site_code, s.site_name || '', s.diff_items + ' mặt hàng lệch']; }));

        // --- Khối: website chưa triển khai ---
        r = appendListBlock(ws, r, LAST, C.grey, C.greySoft,
            'CÁC WEBSITE CHƯA TRIỂN KHAI (' + missing.length + ')',
            'Website đã có mã trong hệ thống nhưng chưa đưa vào vận hành, nên phần mềm cũ không xuất dữ liệu.',
            missing.map(function (s) { return [s.site_code, s.site_name || '', '']; }));

        ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r + 2, c: LAST } });
        ws['!cols'] = [
            { wch: 5 }, { wch: 10 }, { wch: 24 }, { wch: 9 }, { wch: 9 }, { wch: 9 },
            { wch: 8 }, { wch: 16 }, { wch: 14 }, { wch: 16 },
            { wch: 22 }, { wch: 18 }, { wch: 16 }, { wch: 46 }
        ];
        ws['!rows'] = ws['!rows'] || [];
        ws['!rows'][0] = { hpt: 26 };
        ws['!freeze'] = { xSplit: 0, ySplit: headerRow + 1 };
        ws['!autofilter'] = {
            ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: headerRow + sites.length, c: LAST } })
        };

        return ws;
    }

    /** Khối danh sách phụ ở cuối sheet tổng quan (shop chưa bán, bỏ sót...). */
    function appendListBlock(ws, r, lastCol, color, softColor, title, hint, rows) {
        put(ws, r, 0, title, headStyle(color));
        fillRange(ws, r, 0, lastCol, { fill: { fgColor: { rgb: color } } });
        merge(ws, r, 0, r, lastCol);
        r++;

        put(ws, r, 0, hint, {
            font: { italic: true, sz: 9.5, color: { rgb: C.grey } },
            fill: { fgColor: { rgb: softColor } },
            alignment: { vertical: 'center' }
        });
        fillRange(ws, r, 0, lastCol, { fill: { fgColor: { rgb: softColor } } });
        merge(ws, r, 0, r, lastCol);
        r++;

        if (!rows.length) {
            put(ws, r, 0, 'Không có shop nào — tốt.', {
                font: { italic: true, sz: 10, color: { rgb: C.green } },
                alignment: { vertical: 'center' }
            });
            merge(ws, r, 0, r, lastCol);
            return r + 2;
        }

        rows.forEach(function (row, i) {
            var zebra = i % 2 === 0 ? C.white : softColor;
            put(ws, r, 0, i + 1, cellStyle(zebra, { alignment: { horizontal: 'center', vertical: 'center' } }), 'n');
            put(ws, r, 1, row[0], cellStyle(zebra, { font: { bold: true, sz: 10, color: { rgb: C.navy } }, alignment: { horizontal: 'center', vertical: 'center' } }));
            put(ws, r, 2, row[1], cellStyle(zebra));
            put(ws, r, 3, row[2], cellStyle(zebra, { font: { sz: 9.5, color: { rgb: C.grey } } }));
            fillRange(ws, r, 4, lastCol, { fill: { fgColor: { rgb: zebra } } });
            merge(ws, r, 3, r, 5);
            r++;
        });

        return r + 1;
    }

    /* ------------------------------------------------------------------
     * Sheet của từng shop
     * --------------------------------------------------------------- */

    /**
     * @param {Object}  site
     * @param {boolean} hasOverview Có sheet TỔNG QUAN để đặt link quay lại không.
     */
    function buildShopSheet(site, hasOverview) {
        var ws = {};
        var LAST = 7;
        var r = 0;
        var cl = site.clearance;

        // --- Tiêu đề ---
        put(ws, r, 0, 'SHOP ' + site.site_code + ' — ' + (site.site_name || ''), titleStyle(C.navy));
        fillRange(ws, r, 0, LAST, { fill: { fgColor: { rgb: C.navy } } });
        merge(ws, r, 0, r, LAST);
        r++;

        put(ws, r, 0, 'Xuất lúc ' + exportedAt(), {
            font: { italic: true, sz: 10, color: { rgb: C.white } },
            fill: { fgColor: { rgb: C.blue } },
            alignment: { horizontal: 'center', vertical: 'center' }
        });
        fillRange(ws, r, 0, LAST, { fill: { fgColor: { rgb: C.blue } } });
        merge(ws, r, 0, r, LAST - 1);

        // Đường về: file có tới vài chục tab, không có link này thì phải cuộn
        // thanh tab ở đáy cửa sổ để quay lại bảng tổng.
        if (hasOverview) {
            var backRef = put(ws, r, LAST, '↩ Tổng quan', {
                font: { bold: true, sz: 9.5, underline: true, color: { rgb: C.white } },
                fill: { fgColor: { rgb: C.blue } },
                alignment: { horizontal: 'center', vertical: 'center' }
            });
            ws[backRef].l = { Target: "#'TỔNG QUAN'!A1", Tooltip: 'Quay lại bảng tổng quan' };
        }
        r += 2;

        // --- Số liệu bán hàng ---
        var stats = [
            ['Số đơn bán', site.orders_count, NUM_FMT, C.navy],
            ['Doanh thu', site.revenue, MONEY_FMT, C.navy],
            ['Hoàn khách', site.refund_amount, MONEY_FMT, C.amber],
            ['THỰC THU', site.net_revenue, MONEY_FMT, C.green]
        ];
        stats.forEach(function (s, i) {
            put(ws, r, i * 2, s[0], labelStyle());
            put(ws, r, i * 2 + 1, s[1], valueStyle({
                font: { bold: true, sz: 11, color: { rgb: s[3] } },
                alignment: { horizontal: 'right', vertical: 'center' },
                numFmt: s[2]
            }), 'n');
        });
        r++;

        var stats2 = [
            ['Mặt hàng đối chiếu', site.total_items, NUM_FMT, C.navy],
            ['Mặt hàng lệch', site.diff_items, NUM_FMT, C.red],
            ['Hệ thống thừa', site.diff_qty_plus, NUM_FMT, C.green],
            ['Hệ thống thiếu', site.diff_qty_minus, NUM_FMT, C.red]
        ];
        stats2.forEach(function (s, i) {
            put(ws, r, i * 2, s[0], labelStyle());
            put(ws, r, i * 2 + 1, s[1], valueStyle({
                font: { bold: true, sz: 11, color: { rgb: s[3] } },
                alignment: { horizontal: 'right', vertical: 'center' },
                numFmt: s[2]
            }), 'n');
        });
        r += 2;

        // --- Cảnh báo shop chưa bán ---
        if (site.has_activity === 0) {
            put(ws, r, 0, '⚠ SHOP CHƯA BÁN ĐƠN NÀO TRÊN PHẦN MỀM MỚI TRONG NGÀY QUÉT', {
                font: { bold: true, sz: 11, color: { rgb: C.amber } },
                fill: { fgColor: { rgb: C.amberSoft } },
                alignment: { horizontal: 'center', vertical: 'center' },
                border: BORDER
            });
            fillRange(ws, r, 0, LAST, { fill: { fgColor: { rgb: C.amberSoft } }, border: BORDER });
            merge(ws, r, 0, r, LAST);
            r += 2;
        }

        // --- Trạng thái giải trình ---
        put(ws, r, 0, 'TÌNH TRẠNG GIẢI TRÌNH', headStyle(C.teal));
        fillRange(ws, r, 0, LAST, { fill: { fgColor: { rgb: C.teal } } });
        merge(ws, r, 0, r, LAST);
        r++;

        var statusText, statusBg, statusFg;
        if (cl && cl.method === 'manual') {
            statusText = 'Shop đã tự cân hàng lúc ' + fmtDateTime(cl.cleared_at) +
                         ' bởi ' + (cl.cleared_by_name || 'không rõ') +
                         (cl.ledger_code ? ' · phiếu ' + cl.ledger_code : '');
            statusBg = C.greenSoft; statusFg = C.green;
        } else if (cl) {
            statusText = 'Tồn shop vốn đã khớp, không cần tạo phiếu cân hàng.';
            statusBg = C.greySoft; statusFg = C.grey;
        } else if (site.diff_items > 0) {
            statusText = 'CHƯA GIẢI TRÌNH — shop chưa đăng nhập phần mềm mới để xử lý ' + site.diff_items + ' mặt hàng lệch.';
            statusBg = C.redSoft; statusFg = C.red;
        } else {
            statusText = 'Khớp hoàn toàn với phần mềm cũ.';
            statusBg = C.greenSoft; statusFg = C.green;
        }

        put(ws, r, 0, statusText, {
            font: { bold: true, sz: 10, color: { rgb: statusFg } },
            fill: { fgColor: { rgb: statusBg } },
            alignment: { vertical: 'center', wrapText: true },
            border: BORDER
        });
        fillRange(ws, r, 0, LAST, { fill: { fgColor: { rgb: statusBg } }, border: BORDER });
        merge(ws, r, 0, r, LAST);
        r++;

        // Giải trình chung: của shop (POS) và của quản trị (báo cáo)
        [
            ['Giải trình chung của shop', cl && cl.general_note ? cl.general_note : '', C.amberSoft],
            ['Ghi chú của quản trị', site.report_site_note || '', C.blueSoft]
        ].forEach(function (row) {
            if (!row[1]) {
                return;
            }
            put(ws, r, 0, row[0], labelStyle());
            merge(ws, r, 0, r, 1);
            put(ws, r, 2, row[1], {
                font: { sz: 10, color: { rgb: '212529' } },
                fill: { fgColor: { rgb: row[2] } },
                alignment: { vertical: 'center', wrapText: true },
                border: BORDER
            });
            fillRange(ws, r, 2, LAST, { fill: { fgColor: { rgb: row[2] } }, border: BORDER });
            merge(ws, r, 2, r, LAST);
            r++;
        });
        r++;

        // --- Bảng mặt hàng lệch ---
        put(ws, r, 0, 'DANH SÁCH MẶT HÀNG CHÊNH LỆCH', titleStyle(C.blue));
        fillRange(ws, r, 0, LAST, { fill: { fgColor: { rgb: C.blue } } });
        merge(ws, r, 0, r, LAST);
        r++;

        var cols = ['STT', 'Mã hàng', 'Tên sản phẩm', 'Phần mềm cũ', 'Phần mềm mới', 'Lệch',
                    'Giải trình của shop', 'Ghi chú của quản trị'];
        cols.forEach(function (h, i) {
            put(ws, r, i, h, headStyle(C.blue));
        });
        var headerRow = r;
        r++;

        if (!site.items.length) {
            put(ws, r, 0, site.has_detail ? 'Không có mặt hàng nào lệch.' : 'Không đọc được dữ liệu chi tiết của shop này.', {
                font: { italic: true, sz: 10, color: { rgb: site.has_detail ? C.green : C.grey } },
                alignment: { horizontal: 'center', vertical: 'center' },
                border: BORDER
            });
            fillRange(ws, r, 0, LAST, { border: BORDER });
            merge(ws, r, 0, r, LAST);
            r++;
        } else {
            site.items.forEach(function (item, i) {
                var zebra = i % 2 === 0 ? C.white : C.blueZebra;
                var isPlus = item.diff > 0;

                put(ws, r, 0, i + 1, cellStyle(zebra, { alignment: { horizontal: 'center', vertical: 'center' } }), 'n');
                put(ws, r, 1, item.sku, cellStyle(zebra, { font: { sz: 10, color: { rgb: C.navy } } }));
                put(ws, r, 2, item.name, cellStyle(zebra, { alignment: { wrapText: true, vertical: 'center' } }));
                put(ws, r, 3, item.htsoft_qty, cellStyle(zebra, { alignment: { horizontal: 'right', vertical: 'center' }, numFmt: NUM_FMT }), 'n');
                put(ws, r, 4, item.system_qty, cellStyle(zebra, { alignment: { horizontal: 'right', vertical: 'center' }, numFmt: NUM_FMT }), 'n');
                put(ws, r, 5, item.diff, cellStyle(isPlus ? C.greenSoft : C.redSoft, {
                    font: { bold: true, sz: 10.5, color: { rgb: isPlus ? C.green : C.red } },
                    alignment: { horizontal: 'right', vertical: 'center' },
                    numFmt: '+#,##0;-#,##0'
                }), 'n');
                put(ws, r, 6, item.pos_note || '', cellStyle(item.pos_note ? C.greenSoft : zebra, {
                    alignment: { wrapText: true, vertical: 'center' }, font: { sz: 9.5 }
                }));
                put(ws, r, 7, item.report_note || '', cellStyle(item.report_note ? C.amberSoft : zebra, {
                    alignment: { wrapText: true, vertical: 'center' }, font: { sz: 9.5 }
                }));
                r++;
            });

            put(ws, r, 0, 'Tổng: ' + site.items.length + ' mặt hàng chênh lệch · ' +
                          site.items.filter(function (i) { return i.pos_note || i.report_note; }).length + ' dòng đã có giải trình', {
                font: { bold: true, italic: true, sz: 10, color: { rgb: C.navy } },
                fill: { fgColor: { rgb: C.blueSoft } },
                border: BORDER
            });
            fillRange(ws, r, 0, LAST, { fill: { fgColor: { rgb: C.blueSoft } }, border: BORDER });
            merge(ws, r, 0, r, LAST);
            r++;
        }
        r += 2;

        // --- Ghi chú nhân viên ghi trên phiếu bán hàng ---
        var notes = site.sales_notes || [];
        put(ws, r, 0, 'GHI CHÚ NHÂN VIÊN GHI TRÊN PHIẾU BÁN HÀNG TRONG NGÀY (' + notes.length + ')', headStyle(C.purple));
        fillRange(ws, r, 0, LAST, { fill: { fgColor: { rgb: C.purple } } });
        merge(ws, r, 0, r, LAST);
        r++;

        if (!notes.length) {
            put(ws, r, 0, 'Không có ghi chú nào trên phiếu bán hàng.', {
                font: { italic: true, sz: 10, color: { rgb: C.grey } },
                fill: { fgColor: { rgb: C.purpleSoft } },
                alignment: { vertical: 'center' }
            });
            fillRange(ws, r, 0, LAST, { fill: { fgColor: { rgb: C.purpleSoft } } });
            merge(ws, r, 0, r, LAST);
            r++;
        } else {
            ['STT', 'Nội dung ghi chú trên phiếu', 'Thời gian'].forEach(function (h, i) {
                put(ws, r, i === 0 ? 0 : (i === 1 ? 1 : 6), h, headStyle(C.purple));
            });
            merge(ws, r, 1, r, 5);
            merge(ws, r, 6, r, LAST);
            r++;

            notes.forEach(function (n, i) {
                var zebra = i % 2 === 0 ? C.white : C.purpleSoft;
                put(ws, r, 0, i + 1, cellStyle(zebra, { alignment: { horizontal: 'center', vertical: 'center' } }), 'n');
                put(ws, r, 1, n.note || '', cellStyle(zebra, { alignment: { wrapText: true, vertical: 'center' } }));
                fillRange(ws, r, 1, 5, { fill: { fgColor: { rgb: zebra } }, border: BORDER });
                merge(ws, r, 1, r, 5);
                put(ws, r, 6, fmtDateTime(n.created_at), cellStyle(zebra, { alignment: { horizontal: 'center', vertical: 'center' }, font: { sz: 9.5 } }));
                fillRange(ws, r, 6, LAST, { fill: { fgColor: { rgb: zebra } }, border: BORDER });
                merge(ws, r, 6, r, LAST);
                r++;
            });
        }

        ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r + 1, c: LAST } });
        ws['!cols'] = [
            { wch: 5 }, { wch: 14 }, { wch: 40 }, { wch: 13 }, { wch: 13 }, { wch: 10 },
            { wch: 34 }, { wch: 34 }
        ];
        ws['!rows'] = ws['!rows'] || [];
        ws['!rows'][0] = { hpt: 24 };
        ws['!freeze'] = { xSplit: 0, ySplit: headerRow + 1 };

        return ws;
    }

    /* ------------------------------------------------------------------
     * Điều phối
     * --------------------------------------------------------------- */

    /**
     * Tên sheet Excel: tối đa 31 ký tự, không chứa : \ / ? * [ ]
     * Phải cắt 31 ký tự TRƯỚC khi đánh dấu đã dùng, nếu không hai mã dài giống
     * nhau ở 31 ký tự đầu sẽ cùng ra một tên mà vẫn tưởng là khác.
     */
    function sheetName(site, used) {
        var base = String(site.site_code || 'shop').replace(/[:\\\/?*\[\]]/g, '-').slice(0, 31);
        var name = base;
        var suffix = 2;

        while (used[name]) {
            var tail = '-' + suffix++;
            name = base.slice(0, 31 - tail.length) + tail;
        }

        used[name] = true;
        return name;
    }

    function fileStamp(snap) {
        return String(snap.scan_date || '').replace(/-/g, '') + '_' +
               String(snap.scanned_at || '').replace('T', ' ').split(' ')[1].slice(0, 5).replace(':', 'h');
    }

    function runExport(siteCode, $btn) {
        if (typeof XLSX === 'undefined') {
            alert('Thư viện Excel chưa tải xong, vui lòng thử lại sau vài giây.');
            return;
        }

        var snapshot = window.tgsHcrState && window.tgsHcrState.snapshot;
        if (!snapshot) {
            alert('Chưa chọn lần quét nào.');
            return;
        }

        var original = $btn.html();
        $btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>Đang gom dữ liệu...');

        $.ajax({
            url: CFG.ajaxUrl,
            method: 'POST',
            data: {
                action: 'tgs_htsoft_report_export',
                nonce: CFG.nonce,
                snapshot_code: snapshot.snapshot_code,
                site_code: siteCode || ''
            }
        }).done(function (res) {
            if (!res.success) {
                alert(res.data.message || 'Không lấy được dữ liệu để xuất');
                return;
            }

            $btn.html('<span class="spinner-border spinner-border-sm me-1"></span>Đang dựng file...');

            try {
                var data = res.data;
                var wb = XLSX.utils.book_new();
                var withOverview = !siteCode;

                // Chốt tên sheet TRƯỚC khi dựng sheet tổng quan, vì link nhảy
                // phải trỏ đúng tên đã khử trùng lặp. Gắn thẳng lên từng shop
                // thay vì map theo mã: hai shop trùng mã sẽ đè lên nhau.
                var used = withOverview ? { 'TỔNG QUAN': true } : {};
                data.sites.forEach(function (site) {
                    site.__sheet = sheetName(site, used);
                });

                if (withOverview) {
                    XLSX.utils.book_append_sheet(wb, buildOverviewSheet(data), 'TỔNG QUAN');
                }

                data.sites.forEach(function (site) {
                    XLSX.utils.book_append_sheet(wb, buildShopSheet(site, withOverview), site.__sheet);
                });

                var name = siteCode
                    ? 'DoiChieu_Shop' + siteCode + '_' + fileStamp(data.snapshot) + '.xlsx'
                    : 'DoiChieu_ToanHeThong_' + fileStamp(data.snapshot) + '.xlsx';

                XLSX.writeFile(wb, name);
            } catch (e) {
                alert('Lỗi khi dựng file Excel: ' + e.message);
            }
        }).fail(function () {
            alert('Lỗi kết nối máy chủ');
        }).always(function () {
            $btn.prop('disabled', false).html(original);
        });
    }

    $(document).on('click', '#hcrExportAllBtn', function () {
        runExport('', $(this));
    });

    $(document).on('click', '#hcrExportSiteBtn', function () {
        var site = window.tgsHcrState && window.tgsHcrState.activeSite;
        if (!site) {
            return;
        }
        runExport(site, $(this));
    });
});
