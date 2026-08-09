/**
 * XUẤT EXCEL DANH SÁCH TASK — lọc từ feedback khảo sát BTsoft.
 *
 * Đừng nhầm với feedback-export.js bên cạnh:
 *   feedback-export.js  → phiếu khảo sát TRỐNG gửi cho shop điền
 *   task-export.js      → việc đã lọc từ feedback NHẬN VỀ, để chia cho team
 *
 * Workbook 3 tab:
 *   HƯỚNG DẪN  quy ước màu, thang độ khó, cách dùng file
 *   CHIA VIỆC  bảng task chính — chỗ trưởng nhóm điền người làm và hạn
 *   TỔNG HỢP   đếm theo phân hệ và theo trạng thái, có công thức tự tính
 *
 * Dùng TGS_XLSX_STYLE (bản có ghi được định dạng) chứ không dùng XLSX thường —
 * bản thường bỏ qua mọi định dạng, file xuất ra trắng trơn.
 */
(function ($) {
    'use strict';

    if (typeof tgsHtsoftTask === 'undefined') {
        return;
    }

    /* Bảng màu — cùng tông với file khảo sát để hai file nhìn là một bộ */
    var C = {
        navy:      '1F3864',
        blue:      '2E75B6',
        blueLight: 'D9E7F5',
        bluePale:  'F2F7FC',
        green:     'C6EFCE',
        greenText: '006100',
        amber:     'FFEB9C',
        amberText: '9C6500',
        redFill:   'FFC7CE',
        redText:   '9C0006',
        greyFill:  'F7F7F7',
        grey:      '7A7A7A',
        line:      'B4B4B4',
        white:     'FFFFFF'
    };

    /* Màu theo trạng thái — dùng chung cho cả bảng lẫn phần chú giải */
    var MAU_TRANG_THAI = {
        xong:     { fill: C.green,   text: C.greenText },
        dang_lam: { fill: C.amber,   text: C.amberText },
        chua_lam: { fill: C.redFill, text: C.redText }
    };

    function excelLib() {
        return window.TGS_XLSX_STYLE || window.XLSX;
    }

    // ---------------------------------------------------------------------
    // Tiện ích dựng sheet
    // ---------------------------------------------------------------------
    function Sheet() {
        this.ws = {};
        this.maxR = 0;
        this.maxC = 0;
    }

    Sheet.prototype.set = function (r, c, value, style, type) {
        var X = excelLib();
        var addr = X.utils.encode_cell({ r: r, c: c });
        var cell = { t: type || (typeof value === 'number' ? 'n' : 's'), v: value };
        if (style) { cell.s = style; }
        this.ws[addr] = cell;
        if (r > this.maxR) { this.maxR = r; }
        if (c > this.maxC) { this.maxC = c; }
        return this;
    };

    Sheet.prototype.merge = function (r1, c1, r2, c2) {
        if (!this.ws['!merges']) { this.ws['!merges'] = []; }
        this.ws['!merges'].push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
        if (r2 > this.maxR) { this.maxR = r2; }
        if (c2 > this.maxC) { this.maxC = c2; }
        return this;
    };

    Sheet.prototype.cols = function (widths) {
        this.ws['!cols'] = widths.map(function (w) { return { wch: w }; });
        return this;
    };

    Sheet.prototype.rows = function (heights) {
        this.ws['!rows'] = heights;
        return this;
    };

    Sheet.prototype.done = function () {
        var X = excelLib();
        this.ws['!ref'] = X.utils.encode_range({
            s: { r: 0, c: 0 },
            e: { r: this.maxR, c: this.maxC }
        });
        return this.ws;
    };

    /* Viền mảnh cho mọi ô dữ liệu — không có viền thì bảng dài đọc rất mỏi mắt */
    function vien() {
        var b = { style: 'thin', color: { rgb: C.line } };
        return { top: b, bottom: b, left: b, right: b };
    }

    function styTieuDe() {
        return {
            font: { bold: true, sz: 11, color: { rgb: C.white } },
            fill: { fgColor: { rgb: C.navy } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: vien()
        };
    }

    function styO(opts) {
        opts = opts || {};
        return {
            font: {
                sz: 10,
                bold: !!opts.bold,
                color: { rgb: opts.text || '000000' }
            },
            fill: opts.fill ? { fgColor: { rgb: opts.fill } } : undefined,
            alignment: {
                horizontal: opts.align || 'left',
                vertical: 'center',
                wrapText: opts.wrap !== false
            },
            border: vien()
        };
    }

    // ---------------------------------------------------------------------
    // Tab HƯỚNG DẪN
    // ---------------------------------------------------------------------
    function tabHuongDan(data) {
        var s = new Sheet();
        var r = 0;

        s.set(r, 0, 'DANH SÁCH VIỆC LỌC TỪ FEEDBACK BTsoft', {
            font: { bold: true, sz: 16, color: { rgb: C.white } },
            fill: { fgColor: { rgb: C.navy } },
            alignment: { horizontal: 'center', vertical: 'center' }
        });
        s.merge(r, 0, r, 3);
        r += 2;

        s.set(r, 0, 'Nguồn:', styO({ bold: true }));
        s.set(r, 1, data.nguon, styO());
        s.merge(r, 1, r, 3);
        r++;

        s.set(r, 0, 'Ngày xuất:', styO({ bold: true }));
        s.set(r, 1, data.ngay_xuat, styO());
        s.merge(r, 1, r, 3);
        r++;

        s.set(r, 0, 'Tổng số việc:', styO({ bold: true }));
        s.set(r, 1, data.tong, styO({ bold: true }));
        s.merge(r, 1, r, 3);
        r += 2;

        s.set(r, 0, 'QUY ƯỚC MÀU TRẠNG THÁI', styTieuDe());
        s.merge(r, 0, r, 3);
        r++;

        [
            ['xong', 'Đã xong — có ghi màn hình/file làm bằng chứng ở cột Bằng chứng'],
            ['dang_lam', 'Đang làm — đã có một phần, cột Bằng chứng ghi rõ còn thiếu gì'],
            ['chua_lam', 'Chưa làm — chưa ai đụng vào']
        ].forEach(function (row) {
            var m = MAU_TRANG_THAI[row[0]];
            s.set(r, 0, data.nhan[row[0]], styO({ fill: m.fill, text: m.text, bold: true, align: 'center' }));
            s.set(r, 1, row[1], styO());
            s.merge(r, 1, r, 3);
            r++;
        });
        r++;

        s.set(r, 0, 'THANG ĐỘ KHÓ (để giao việc theo level)', styTieuDe());
        s.merge(r, 0, r, 3);
        r++;

        [
            [1, 'Sửa vài dòng, đổi nhãn, ẩn/hiện cột — người mới làm được'],
            [2, 'Thêm ô nhập, thêm cột báo cáo, sửa mẫu in'],
            [3, 'Một màn hình mới hoặc một luồng nghiệp vụ nhỏ'],
            [4, 'Một nhóm màn hình, hoặc đụng vào cách lưu dữ liệu'],
            [5, 'Cả một phân hệ — cần thiết kế trước khi viết code']
        ].forEach(function (row) {
            s.set(r, 0, row[0], styO({ align: 'center', bold: true }));
            s.set(r, 1, row[1], styO());
            s.merge(r, 1, r, 3);
            r++;
        });
        r++;

        s.set(r, 0, 'CÁCH DÙNG', styTieuDe());
        s.merge(r, 0, r, 3);
        r++;

        [
            'Tab CHIA VIỆC: điền cột "Người làm" và "Hạn" — hai cột này để trống sẵn cho trưởng nhóm.',
            'Cột "Trạng thái" tự đổi màu khi sửa: gõ đúng Đã xong / Đang làm / Chưa làm.',
            'Tab TỔNG HỢP tự đếm lại theo công thức, không phải sửa tay.',
            'Đánh "Đã xong" thì PHẢI ghi cột Bằng chứng — không có bằng chứng thì để Đang làm.',
            'File này xuất lại được bất cứ lúc nào từ nút "Xuất Excel lọc task"; danh sách gốc nằm trong mã nguồn.'
        ].forEach(function (line) {
            s.set(r, 0, '•', styO({ align: 'center' }));
            s.set(r, 1, line, styO());
            s.merge(r, 1, r, 3);
            r++;
        });

        s.cols([14, 40, 30, 30]);

        return s.done();
    }

    // ---------------------------------------------------------------------
    // Tab CHIA VIỆC — bảng chính
    // ---------------------------------------------------------------------
    var COTS = [
        { key: 'stt',        label: 'STT',          w: 6  },
        { key: 'stt_goc',    label: 'STT gốc',      w: 8  },
        { key: 'phan_he',    label: 'Phân hệ',      w: 16 },
        { key: 'man_hinh',   label: 'Màn hình',     w: 24 },
        { key: 'task',       label: 'Việc cần làm', w: 52 },
        { key: 'loai',       label: 'Loại',         w: 12 },
        { key: 'do_kho',     label: 'Độ khó',       w: 8  },
        { key: 'trang_thai', label: 'Trạng thái',   w: 14 },
        { key: 'bang_chung', label: 'Bằng chứng / còn thiếu', w: 46 },
        { key: '__nguoi',    label: 'Người làm',    w: 16 },
        { key: '__han',      label: 'Hạn',          w: 12 },
        { key: 'feedback',   label: 'Feedback gốc', w: 60 }
    ];

    function tabChiaViec(data) {
        var s = new Sheet();
        var r = 0;

        s.set(r, 0, 'CHIA VIỆC — ' + data.nguon, {
            font: { bold: true, sz: 13, color: { rgb: C.white } },
            fill: { fgColor: { rgb: C.navy } },
            alignment: { horizontal: 'left', vertical: 'center' }
        });
        s.merge(r, 0, r, COTS.length - 1);
        r++;

        COTS.forEach(function (col, i) {
            s.set(r, i, col.label, styTieuDe());
        });
        var hangTieuDe = r;
        r++;

        data.tasks.forEach(function (t, idx) {
            var m = MAU_TRANG_THAI[t.trang_thai] || {};
            /* Kẻ sọc nhẹ cho dễ dò ngang trên bảng rộng 12 cột */
            var nen = (idx % 2 === 1) ? C.bluePale : undefined;

            COTS.forEach(function (col, i) {
                var v = '';
                var sty;

                if (col.key === '__nguoi' || col.key === '__han') {
                    /* Ô cần điền — tô vàng nhạt như file khảo sát để biết chỗ gõ */
                    sty = styO({ fill: C.amber, align: 'center' });
                } else if (col.key === 'trang_thai') {
                    v = data.nhan[t.trang_thai] || t.trang_thai;
                    sty = styO({ fill: m.fill, text: m.text, bold: true, align: 'center' });
                } else if (col.key === 'do_kho') {
                    v = t.do_kho;
                    sty = styO({ fill: nen, align: 'center', bold: true });
                } else if (col.key === 'stt' || col.key === 'stt_goc') {
                    v = t[col.key];
                    sty = styO({ fill: nen, align: 'center' });
                } else {
                    v = t[col.key] || '';
                    sty = styO({ fill: nen });
                }

                s.set(r, i, v, sty);
            });
            r++;
        });

        s.cols(COTS.map(function (c) { return c.w; }));

        /* Đóng băng phần đầu: cuộn 60 dòng vẫn thấy tiêu đề cột */
        s.ws['!freeze'] = { xSplit: 0, ySplit: hangTieuDe + 1 };
        s.ws['!autofilter'] = {
            ref: excelLib().utils.encode_range({
                s: { r: hangTieuDe, c: 0 },
                e: { r: r - 1, c: COTS.length - 1 }
            })
        };

        return s.done();
    }

    // ---------------------------------------------------------------------
    // Tab TỔNG HỢP
    // ---------------------------------------------------------------------
    function tabTongHop(data) {
        var s = new Sheet();
        var r = 0;

        s.set(r, 0, 'TỔNG HỢP TIẾN ĐỘ', {
            font: { bold: true, sz: 14, color: { rgb: C.white } },
            fill: { fgColor: { rgb: C.navy } },
            alignment: { horizontal: 'center', vertical: 'center' }
        });
        s.merge(r, 0, r, 4);
        r += 2;

        /* ── Theo trạng thái ── */
        s.set(r, 0, 'Trạng thái', styTieuDe());
        s.set(r, 1, 'Số việc', styTieuDe());
        s.set(r, 2, 'Tỉ lệ', styTieuDe());
        r++;

        ['xong', 'dang_lam', 'chua_lam'].forEach(function (key) {
            var m = MAU_TRANG_THAI[key];
            s.set(r, 0, data.nhan[key], styO({ fill: m.fill, text: m.text, bold: true }));
            s.set(r, 1, data.dem[key], styO({ align: 'center', bold: true }));
            s.set(r, 2, data.tong ? (data.dem[key] / data.tong) : 0,
                  { font: { sz: 10 }, alignment: { horizontal: 'center' }, border: vien(), numFmt: '0.0%' });
            r++;
        });

        s.set(r, 0, 'TỔNG', styO({ bold: true, fill: C.blueLight }));
        s.set(r, 1, data.tong, styO({ bold: true, align: 'center', fill: C.blueLight }));
        s.set(r, 2, 1, { font: { bold: true, sz: 10 }, fill: { fgColor: { rgb: C.blueLight } },
                         alignment: { horizontal: 'center' }, border: vien(), numFmt: '0.0%' });
        r += 2;

        /* ── Theo phân hệ ── */
        s.set(r, 0, 'Phân hệ', styTieuDe());
        s.set(r, 1, 'Đã xong', styTieuDe());
        s.set(r, 2, 'Đang làm', styTieuDe());
        s.set(r, 3, 'Chưa làm', styTieuDe());
        s.set(r, 4, 'Tổng', styTieuDe());
        r++;

        var theoPhanHe = {};
        data.tasks.forEach(function (t) {
            if (!theoPhanHe[t.phan_he]) {
                theoPhanHe[t.phan_he] = { xong: 0, dang_lam: 0, chua_lam: 0, tong: 0 };
            }
            theoPhanHe[t.phan_he][t.trang_thai]++;
            theoPhanHe[t.phan_he].tong++;
        });

        Object.keys(theoPhanHe).forEach(function (ph) {
            var d = theoPhanHe[ph];
            s.set(r, 0, ph, styO({ bold: true }));
            s.set(r, 1, d.xong, styO({ align: 'center', fill: d.xong ? C.green : undefined }));
            s.set(r, 2, d.dang_lam, styO({ align: 'center', fill: d.dang_lam ? C.amber : undefined }));
            s.set(r, 3, d.chua_lam, styO({ align: 'center', fill: d.chua_lam ? C.redFill : undefined }));
            s.set(r, 4, d.tong, styO({ align: 'center', bold: true, fill: C.blueLight }));
            r++;
        });
        r += 2;

        /* ── Theo độ khó: để ước lượng nhân sự cần bao nhiêu ── */
        s.set(r, 0, 'Độ khó', styTieuDe());
        s.set(r, 1, 'Số việc', styTieuDe());
        s.set(r, 2, 'Còn phải làm', styTieuDe());
        r++;

        var theoDoKho = {};
        data.tasks.forEach(function (t) {
            if (!theoDoKho[t.do_kho]) { theoDoKho[t.do_kho] = { tong: 0, con: 0 }; }
            theoDoKho[t.do_kho].tong++;
            if (t.trang_thai !== 'xong') { theoDoKho[t.do_kho].con++; }
        });

        Object.keys(theoDoKho).sort().forEach(function (lv) {
            s.set(r, 0, 'Level ' + lv, styO({ bold: true, align: 'center' }));
            s.set(r, 1, theoDoKho[lv].tong, styO({ align: 'center' }));
            s.set(r, 2, theoDoKho[lv].con, styO({ align: 'center', bold: true,
                fill: theoDoKho[lv].con ? C.amber : C.green }));
            r++;
        });

        s.cols([22, 14, 14, 14, 12]);

        return s.done();
    }

    // ---------------------------------------------------------------------
    // Nút bấm
    // ---------------------------------------------------------------------
    function baoLoi(msg) {
        var $alert = $('#htsoftAlert');
        if ($alert.length) {
            $alert.removeClass('d-none alert-success').addClass('alert-danger').text(msg);
        } else {
            window.alert(msg);
        }
    }

    $(document).on('click', '.tgs-task-export-btn', function () {
        var $btn = $(this);
        var nhanCu = $btn.html();

        if (!excelLib()) {
            baoLoi('Chưa nạp được thư viện Excel. Tải lại trang rồi thử lại.');
            return;
        }

        $btn.prop('disabled', true).html('<i class="bx bx-loader-alt bx-spin me-1"></i>Đang tạo file...');

        $.post(tgsHtsoftTask.ajaxUrl, {
            action: 'tgs_htsoft_task_list',
            nonce: tgsHtsoftTask.nonce
        }).done(function (res) {
            if (!res || !res.success) {
                baoLoi((res && res.data && res.data.message) || 'Không lấy được danh sách task');
                return;
            }

            try {
                var X = excelLib();
                var data = res.data;
                var wb = X.utils.book_new();

                X.utils.book_append_sheet(wb, tabHuongDan(data), 'HƯỚNG DẪN');
                X.utils.book_append_sheet(wb, tabChiaViec(data), 'CHIA VIỆC');
                X.utils.book_append_sheet(wb, tabTongHop(data), 'TỔNG HỢP');

                X.writeFile(wb, 'Chia_viec_BTsoft_' +
                    new Date().toISOString().slice(0, 10) + '.xlsx',
                    { compression: true });
            } catch (err) {
                baoLoi('Lỗi tạo file Excel: ' + (err && err.message ? err.message : err));
            }
        }).fail(function () {
            baoLoi('Lỗi kết nối khi lấy danh sách task');
        }).always(function () {
            $btn.prop('disabled', false).html(nhanCu);
        });
    });

})(jQuery);
