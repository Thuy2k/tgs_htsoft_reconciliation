/**
 * LUỒNG RIÊNG - Xuất Excel khảo sát feedback shop (BTsoft).
 *
 * Không dùng chung dữ liệu với luồng đối chiếu tồn kho (reconciliation.js):
 * file này chỉ cần danh sách shop từ AJAX `tgs_htsoft_feedback_sites`, rồi dựng
 * 1 workbook nhiều tab:
 *   - Tab HƯỚNG DẪN  : cách điền, quy ước màu, thang điểm, danh sách tab các shop
 *   - Tab TỔNG HỢP   : bảng điểm tự động (công thức tham chiếu sang tab từng shop)
 *   - Tab <mã shop>  : phiếu khảo sát riêng của shop đó
 *
 * Toàn bộ ô cần điền được tô MÀU VÀNG, cột "Gợi ý" ghi sẵn câu hỏi mồi để shop
 * không bị bí khi viết feedback. Các đợt sau shop cập nhật lại ngay trên file cũ
 * (có khối "Lịch sử cập nhật" ở cuối mỗi tab).
 */
(function ($) {
    'use strict';

    if (typeof tgsHtsoftFeedback === 'undefined') {
        return;
    }

    // ---------------------------------------------------------------------
    // Bảng màu - đồng bộ tông với file xuất chênh lệch sẵn có
    // ---------------------------------------------------------------------
    var C = {
        navy: '1F3864',
        blue: '2E75B6',
        blueDark: '1F4E79',
        blueLight: 'D9E7F5',
        bluePale: 'F2F7FC',
        yellow: 'FFF8DC',
        yellowEdge: 'D6A800',
        gold: 'FFEB9C',
        green: 'C6EFCE',
        greenText: '006100',
        red: 'C00000',
        redFill: 'FFC7CE',
        redSoft: 'FDECEA',
        purple: '7B2D8B',
        purpleFill: 'F3E7F7',
        orange: 'ED7D31',
        orangeFill: 'FCE4D6',
        grey: '7A7A7A',
        greyFill: 'F7F7F7',
        line: 'B4B4B4',
        white: 'FFFFFF',
        text: '333333'
    };

    function border(color) {
        var c = { style: 'thin', color: { rgb: color || C.line } };
        return { top: c, bottom: c, left: c, right: c };
    }

    function borderThick(color) {
        var c = { style: 'medium', color: { rgb: color } };
        return { top: c, bottom: c, left: c, right: c };
    }

    // ---------------------------------------------------------------------
    // Sheet builder nhỏ gọn: tự theo dõi phạm vi, merge, cột, chiều cao dòng
    // ---------------------------------------------------------------------
    function Sheet() {
        this.ws = {};
        this.merges = [];
        this.cols = [];
        this.rows = {};
        this.maxR = 0;
        this.maxC = 0;
    }

    Sheet.prototype.set = function (r, c, value, style, opts) {
        opts = opts || {};
        var addr = XLSX.utils.encode_cell({ r: r, c: c });
        var cell;

        if (opts.f) {
            cell = { t: opts.t || 'n', f: opts.f, v: (opts.v !== undefined ? opts.v : (opts.t === 's' ? '' : 0)) };
        } else if (typeof value === 'number') {
            cell = { t: 'n', v: value };
        } else {
            cell = { t: 's', v: (value === undefined || value === null) ? '' : String(value) };
        }

        if (style) cell.s = style;
        if (opts.link) cell.l = opts.link;

        this.ws[addr] = cell;
        if (r > this.maxR) this.maxR = r;
        if (c > this.maxC) this.maxC = c;
        return this;
    };

    /** Ghi 1 dòng gồm nhiều ô: [{v, s, c, opts}] hoặc mảng giá trị */
    Sheet.prototype.row = function (r, cells) {
        var self = this;
        cells.forEach(function (item, idx) {
            if (item === null || item === undefined) return;
            var col = (item.c !== undefined) ? item.c : idx;
            self.set(r, col, item.v, item.s, item.opts);
        });
        return this;
    };

    /** Tô nền cho cả dải ô (dùng cho vùng merge để màu không bị hụt) */
    Sheet.prototype.fillRange = function (r, c1, c2, style) {
        for (var c = c1; c <= c2; c++) {
            var addr = XLSX.utils.encode_cell({ r: r, c: c });
            if (!this.ws[addr]) this.set(r, c, '', style);
            else if (!this.ws[addr].s) this.ws[addr].s = style;
        }
        return this;
    };

    Sheet.prototype.merge = function (r1, c1, r2, c2) {
        this.merges.push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
        if (r2 > this.maxR) this.maxR = r2;
        if (c2 > this.maxC) this.maxC = c2;
        return this;
    };

    Sheet.prototype.height = function (r, hpt) {
        this.rows[r] = { hpt: hpt };
        return this;
    };

    Sheet.prototype.finalize = function () {
        var ws = this.ws;
        ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: this.maxR, c: this.maxC } });
        if (this.merges.length) ws['!merges'] = this.merges;
        if (this.cols.length) ws['!cols'] = this.cols;

        var rows = [];
        var maxRowIdx = 0;
        Object.keys(this.rows).forEach(function (k) {
            if (+k > maxRowIdx) maxRowIdx = +k;
        });
        for (var i = 0; i <= maxRowIdx; i++) {
            rows.push(this.rows[i] || {});
        }
        if (rows.length) ws['!rows'] = rows;

        return ws;
    };

    // ---------------------------------------------------------------------
    // Preset style
    // ---------------------------------------------------------------------
    var ST = {
        title: {
            font: { bold: true, sz: 16, color: { rgb: C.white } },
            fill: { fgColor: { rgb: C.navy } },
            alignment: { horizontal: 'center', vertical: 'center' }
        },
        subtitle: {
            font: { bold: true, sz: 12, color: { rgb: C.blueDark } },
            fill: { fgColor: { rgb: C.blueLight } },
            alignment: { horizontal: 'center', vertical: 'center' }
        },
        meta: {
            font: { sz: 10, color: { rgb: C.blueDark } },
            fill: { fgColor: { rgb: C.bluePale } },
            alignment: { horizontal: 'center', vertical: 'center' }
        },
        welcome: {
            font: { sz: 11, color: { rgb: C.greenText }, italic: true },
            fill: { fgColor: { rgb: C.green } },
            alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
            border: border(C.line)
        },
        legend: {
            font: { bold: true, sz: 10, color: { rgb: C.blueDark } },
            fill: { fgColor: { rgb: C.gold } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: border(C.line)
        },
        section: function (bg) {
            return {
                font: { bold: true, sz: 12, color: { rgb: C.white } },
                fill: { fgColor: { rgb: bg || C.blue } },
                alignment: { horizontal: 'left', vertical: 'center' },
                border: border(C.line)
            };
        },
        colHead: function (bg) {
            return {
                font: { bold: true, sz: 10, color: { rgb: C.white } },
                fill: { fgColor: { rgb: bg || C.blue } },
                alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
                border: border(C.line)
            };
        },
        label: {
            font: { bold: true, sz: 10, color: { rgb: C.text } },
            fill: { fgColor: { rgb: C.bluePale } },
            alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
            border: border(C.line)
        },
        stt: {
            font: { sz: 10, color: { rgb: C.grey } },
            fill: { fgColor: { rgb: C.greyFill } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: border(C.line)
        },
        input: {
            font: { sz: 11, color: { rgb: '000000' } },
            fill: { fgColor: { rgb: C.yellow } },
            alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
            border: border(C.yellowEdge)
        },
        inputScore: {
            font: { bold: true, sz: 13, color: { rgb: C.blueDark } },
            fill: { fgColor: { rgb: C.yellow } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: border(C.yellowEdge)
        },
        inputTick: {
            font: { bold: true, sz: 13, color: { rgb: C.red } },
            fill: { fgColor: { rgb: C.yellow } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: border(C.yellowEdge)
        },
        hint: {
            font: { sz: 9, italic: true, color: { rgb: C.grey } },
            fill: { fgColor: { rgb: C.greyFill } },
            alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
            border: border(C.line)
        },
        note: {
            font: { sz: 10, italic: true, color: { rgb: C.purple } },
            fill: { fgColor: { rgb: C.purpleFill } },
            alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
            border: border(C.line)
        },
        scoreBig: {
            font: { bold: true, sz: 20, color: { rgb: C.greenText } },
            fill: { fgColor: { rgb: C.green } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: borderThick(C.greenText)
        },
        scoreBigLabel: {
            font: { bold: true, sz: 12, color: { rgb: C.greenText } },
            fill: { fgColor: { rgb: C.green } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: border(C.greenText)
        },
        cell: {
            font: { sz: 10, color: { rgb: C.text } },
            fill: { fgColor: { rgb: C.white } },
            alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
            border: border(C.line)
        },
        cellCenter: {
            font: { sz: 10, color: { rgb: C.text } },
            fill: { fgColor: { rgb: C.white } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: border(C.line)
        },
        cellCode: {
            font: { bold: true, sz: 10, color: { rgb: C.blueDark } },
            fill: { fgColor: { rgb: C.bluePale } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: border(C.line)
        },
        cellLink: {
            font: { sz: 10, bold: true, color: { rgb: '0563C1' }, underline: true },
            fill: { fgColor: { rgb: C.white } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: border(C.line)
        },
        spacer: { fill: { fgColor: { rgb: C.white } } }
    };

    function zebra(idx) {
        return idx % 2 === 0 ? C.white : 'F7FAFD';
    }

    function withFill(base, rgb) {
        return $.extend(true, {}, base, { fill: { fgColor: { rgb: rgb } } });
    }

    // ---------------------------------------------------------------------
    // Nội dung phiếu khảo sát
    // ---------------------------------------------------------------------
    var CRITERIA = [
        {
            key: 'search', short: 'Tìm kiếm',
            label: 'Tìm kiếm sản phẩm (theo mã, tên, mã vạch)',
            hint: 'Gõ tên có dấu / không dấu có ra đúng hàng không? Tìm có nhanh không? Có phải gõ đủ mã mới ra? So với phần mềm cũ thì thế nào?'
        },
        {
            key: 'order', short: 'Lên đơn',
            label: 'Lên đơn hàng – thao tác bán hàng',
            hint: 'Các bước lên đơn có nhanh gọn không? Có bước nào thừa, phải bấm đi bấm lại? Lúc đông khách có kịp không?'
        },
        {
            key: 'payment', short: 'Thanh toán',
            label: 'Thanh toán, in bill, hoá đơn',
            hint: 'Chọn hình thức thanh toán, nhập tiền khách đưa, tiền thối, in bill có ổn không? Máy in có nhận không?'
        },
        {
            key: 'return', short: 'Hoàn hàng',
            label: 'Hoàn hàng / đổi trả cho khách',
            hint: 'Tạo phiếu hoàn có dễ tìm không? Số tiền hoàn có đúng không? Tồn kho sau khi hoàn có về đúng không?'
        },
        {
            key: 'stock', short: 'Kho / Tồn',
            label: 'Nhập hàng – kiểm kho – theo dõi tồn',
            hint: 'Nhận hàng, kiểm kê, xem tồn hiện tại có tiện không? Số tồn trên phần mềm có khớp thực tế không?'
        },
        {
            key: 'report', short: 'Báo cáo',
            label: 'Báo cáo & công cụ đổ số liệu',
            hint: 'Báo cáo doanh thu, hàng bán chạy, hàng tồn lâu, công nợ... đã đủ chưa? Có số liệu nào anh/chị vẫn phải tự làm tay?'
        },
        {
            key: 'ui', short: 'Giao diện',
            label: 'Giao diện: bố cục, cỡ chữ, màu sắc',
            hint: 'Chữ có bị nhỏ khó đọc không? Màu có chói / khó nhìn không? Nút bấm có dễ thấy không? Anh/chị đang dùng trên máy tính, máy POS hay điện thoại?'
        },
        {
            key: 'stability', short: 'Ổn định',
            label: 'Tốc độ & độ ổn định (giật, lag, treo)',
            hint: 'Có bị chậm / đứng máy không? Thường xảy ra lúc nào: giờ cao điểm, khi in bill, khi mở báo cáo?'
        },
        {
            key: 'vs_old', short: 'Vs HTsoft',
            label: 'So với phần mềm cũ (HTsoft) – mức độ dễ dùng',
            hint: '5 = dễ dùng hơn hẳn · 3 = ngang nhau · 1 = khó hơn nhiều. Anh/chị ghi rõ chỗ nào dễ hơn, chỗ nào còn khó hơn.'
        },
        {
            key: 'support', short: 'Hỗ trợ',
            label: 'Đội ngũ hỗ trợ khi shop gặp vấn đề',
            hint: 'Báo lỗi có được trả lời nhanh không? Hướng dẫn có dễ hiểu không? Có việc nào báo rồi mà chưa được xử lý?'
        },
        {
            key: 'overall', short: 'Chung',
            label: 'Đánh giá chung về phần mềm BTsoft',
            hint: 'Nếu chấm 1 điểm chung cho BTsoft hiện tại thì anh/chị chấm mấy điểm? Vì sao ạ?'
        }
    ];

    var COMPARE = [
        {
            label: 'Ưu điểm của BTsoft so với HTsoft (cái gì tốt hơn?)',
            hint: 'VD: lên đơn nhanh hơn, xem được tồn theo thời gian thực, không phải ra máy chủ, báo cáo tự chạy, làm được trên điện thoại...'
        },
        {
            label: 'BTsoft còn thua HTsoft ở điểm nào?',
            hint: 'Anh/chị cứ ghi thẳng ạ. Đây là thông tin quý nhất để bên em sửa, và không ảnh hưởng gì tới đánh giá của shop mình.'
        },
        {
            label: 'Chức năng HTsoft có mà BTsoft chưa có',
            hint: 'VD: mẫu in, loại báo cáo, cách nhập nhanh, phím tắt, tra cứu lịch sử giá...'
        }
    ];

    var ERRORS = [
        'Lỗi hiển thị (sai bố cục, mất chữ, tràn màn hình)',
        'Sai số liệu (tồn kho, doanh thu, tiền thối...)',
        'Giật, lag, chậm, phải chờ lâu',
        'Công cụ tự động tính toán không hoạt động',
        'Mất kết nối / không lưu được đơn',
        'Máy in, mã vạch, thiết bị không nhận',
        'Lỗi khác (ghi rõ ở cột mô tả)'
    ];

    var ERROR_HINT = 'Ghi rõ: xảy ra ở màn hình nào, khoảng mấy giờ, tần suất (thỉnh thoảng / thường xuyên / liên tục). Có ảnh chụp màn hình thì gửi kèm nhóm Zalo giúp em ạ.';

    var NEEDS = [
        {
            label: 'Thông số / cột dữ liệu đang thiếu trên màn hình',
            hint: 'VD: muốn nhìn thấy thêm hạn sử dụng, tồn kho shop khác, giá vốn, số đã đặt, lịch sử mua của khách...'
        },
        {
            label: 'Công cụ / báo cáo cần bổ sung',
            hint: 'Công cụ nào giúp anh/chị đỡ phải làm tay, đỡ phải bấm máy tính, đỡ phải ghi sổ?'
        },
        {
            label: 'Tính năng mới anh/chị mong muốn',
            hint: 'Anh/chị cứ đề xuất thoải mái ạ, bên em sẽ xem xét đưa vào bản cập nhật tới.'
        }
    ];

    var FREE_HINTS = [
        'Điều anh/chị hài lòng nhất khi dùng BTsoft...',
        'Điều khiến anh/chị khó chịu nhất, mong sửa sớm nhất...',
        'Góp ý khác cho team phần mềm (đào tạo, tài liệu, cách hỗ trợ...)'
    ];

    // ---------------------------------------------------------------------
    // Tab phiếu khảo sát của 1 shop
    // Trả về { ws, refs } - refs dùng cho công thức ở tab TỔNG HỢP
    // ---------------------------------------------------------------------
    function buildShopSheet(shop, cfg) {
        var sh = new Sheet();
        sh.cols = [
            { wch: 6 },   // A - STT
            { wch: 44 },  // B - Nội dung
            { wch: 12 },  // C - Điểm / đánh dấu
            { wch: 58 },  // D - Ý kiến của anh/chị
            { wch: 52 }   // E - Gợi ý
        ];

        var LAST = 4;
        var r = 0;
        var refs = { scores: {} };

        function band(text, style, hpt) {
            sh.set(r, 0, text, style);
            sh.fillRange(r, 0, LAST, style);
            sh.merge(r, 0, r, LAST);
            sh.height(r, hpt || 20);
            r++;
        }

        function blank(hpt) {
            sh.fillRange(r, 0, LAST, ST.spacer);
            sh.height(r, hpt || 8);
            r++;
        }

        // ----- Đầu phiếu -----
        band('PHIẾU KHẢO SÁT TRẢI NGHIỆM PHẦN MỀM BÁN HÀNG BTsoft', ST.title, 34);
        band('🏪  ' + shop.site_name + '     •     Mã shop: ' + shop.site_code, ST.subtitle, 26);
        band('Đợt khảo sát: ' + cfg.round + '     •     Hạn gửi lại: ' + cfg.deadline +
             '     •     Phụ trách tổng hợp: ' + cfg.owner + '     •     Hỗ trợ: ' + cfg.contact, ST.meta, 18);

        band('Kính gửi anh/chị ' + shop.site_name + ', đây là tab riêng của shop mình. ' +
             'Anh/chị chỉ cần điền vào các Ô MÀU VÀNG, cột "Gợi ý" bên phải là câu hỏi mồi để anh/chị dễ viết. ' +
             'Không bắt buộc điền hết — điền được đến đâu quý đến đó. Mọi góp ý đều được ghi nhận để cải tiến phần mềm, ' +
             'không dùng để đánh giá cá nhân anh/chị.', ST.welcome, 58);

        // Thang điểm
        var legendLabels = [
            'THANG ĐIỂM:', '1 = Rất kém', '2 = Kém', '3 = Bình thường', '4 = Tốt · 5 = Rất tốt'
        ];
        legendLabels.forEach(function (t, i) {
            sh.set(r, i, t, ST.legend);
        });
        sh.height(r, 20);
        r++;

        blank();

        // ----- PHẦN A: Thông tin người điền -----
        band('PHẦN A.  THÔNG TIN NGƯỜI ĐIỀN PHIẾU', ST.section(C.blue), 22);

        var infoRows = [
            ['Họ và tên người điền', 'Ai điền phiếu này ạ? Để bên em tiện liên hệ lại khi cần hỏi thêm.'],
            ['Chức vụ / vị trí làm việc', 'VD: Quản lý shop, Thu ngân, Nhân viên bán hàng, Thủ kho...'],
            ['Số điện thoại / Zalo', 'Không bắt buộc, nhưng có thì bên em hỗ trợ trực tiếp sẽ nhanh hơn.'],
            ['Ngày điền phiếu', 'VD: ' + cfg.deadline],
            ['Đã dùng BTsoft được bao lâu', 'VD: mới dùng 2 tuần / hơn 1 tháng / từ đầu triển khai.'],
            ['Mức độ dùng hằng ngày', 'VD: dùng cả ngày / chỉ dùng khi lên đơn / chỉ xem báo cáo.']
        ];

        // Ô "Ngày điền phiếu" gán sẵn định dạng ngày để Excel không hiện số serial
        var dateInput = $.extend(true, {}, ST.input, { numFmt: 'dd/mm/yyyy' });

        infoRows.forEach(function (item, idx) {
            var inputStyle = (idx === 3) ? dateInput : ST.input;
            sh.set(r, 0, idx + 1, ST.stt);
            sh.set(r, 1, item[0], ST.label);
            sh.set(r, 2, '', inputStyle);
            sh.set(r, 3, '', inputStyle);
            sh.merge(r, 2, r, 3);
            sh.set(r, 4, item[1], ST.hint);
            sh.height(r, 26);
            if (idx === 0) refs.person = XLSX.utils.encode_cell({ r: r, c: 2 });
            if (idx === 3) refs.date = XLSX.utils.encode_cell({ r: r, c: 2 });
            r++;
        });

        blank();

        // ----- Điểm trung bình (tự động) -----
        var avgRow = r;
        sh.set(r, 0, 'ĐIỂM', ST.scoreBigLabel);
        sh.set(r, 1, 'TRUNG BÌNH CHUNG CỦA SHOP', ST.scoreBigLabel);
        sh.height(r, 30);
        refs.avg = XLSX.utils.encode_cell({ r: avgRow, c: 2 });
        r++;

        blank();

        // ----- PHẦN B: Chấm điểm theo nghiệp vụ -----
        band('PHẦN B.  CHẤM ĐIỂM THEO TỪNG PHẦN VIỆC HẰNG NGÀY  (điền số từ 1 đến 5 vào ô vàng)', ST.section(C.blue), 22);

        sh.row(r, [
            { v: 'STT', s: ST.colHead(C.blueDark) },
            { v: 'Phần việc / tiêu chí', s: ST.colHead(C.blueDark) },
            { v: 'Điểm (1-5)', s: ST.colHead(C.blueDark) },
            { v: 'Ý kiến cụ thể của anh/chị', s: ST.colHead(C.blueDark) },
            { v: 'Gợi ý để anh/chị dễ điền', s: ST.colHead(C.blueDark) }
        ]);
        sh.height(r, 24);
        r++;

        var scoreStart = r;
        CRITERIA.forEach(function (item, idx) {
            var bg = zebra(idx);
            sh.set(r, 0, idx + 1, ST.stt);
            sh.set(r, 1, item.label, withFill(ST.label, bg));
            sh.set(r, 2, '', ST.inputScore);
            sh.set(r, 3, '', ST.input);
            sh.set(r, 4, item.hint, ST.hint);
            sh.height(r, 44);
            refs.scores[item.key] = XLSX.utils.encode_cell({ r: r, c: 2 });
            r++;
        });
        var scoreEnd = r - 1;

        refs.scoreRange = 'C' + (scoreStart + 1) + ':C' + (scoreEnd + 1);

        // Công thức điểm trung bình (đặt sau khi biết dải ô)
        sh.set(avgRow, 2, '', ST.scoreBig, {
            f: 'IFERROR(ROUND(AVERAGE(' + refs.scoreRange + '),2),"")',
            t: 'n', v: 0
        });
        sh.set(avgRow, 3, 'Ô này tự tính khi anh/chị chấm điểm ở Phần B, không cần điền.', withFill(ST.hint, C.green));
        sh.set(avgRow, 4, '', withFill(ST.hint, C.green), {
            f: '"Đã chấm " & COUNT(' + refs.scoreRange + ') & "/' + CRITERIA.length + ' tiêu chí"',
            t: 's', v: ''
        });

        blank();

        // ----- PHẦN C: So sánh với phần mềm cũ -----
        band('PHẦN C.  SO SÁNH BTsoft VỚI PHẦN MỀM CŨ (HTsoft)', ST.section(C.orange), 22);

        sh.row(r, [
            { v: 'STT', s: ST.colHead(C.orange) },
            { v: 'Nội dung', s: ST.colHead(C.orange) },
            { v: 'Ý kiến của anh/chị', s: ST.colHead(C.orange), c: 2 },
            { v: 'Gợi ý để anh/chị dễ điền', s: ST.colHead(C.orange), c: 4 }
        ]);
        sh.set(r, 3, '', ST.colHead(C.orange));
        sh.merge(r, 2, r, 3);
        sh.height(r, 24);
        r++;

        COMPARE.forEach(function (item, idx) {
            sh.set(r, 0, idx + 1, ST.stt);
            sh.set(r, 1, item.label, withFill(ST.label, C.orangeFill));
            sh.set(r, 2, '', ST.input);
            sh.set(r, 3, '', ST.input);
            sh.merge(r, 2, r, 3);
            sh.set(r, 4, item.hint, ST.hint);
            sh.height(r, 46);
            r++;
        });

        blank();

        // ----- PHẦN D: Lỗi / sự cố gặp phải -----
        band('PHẦN D.  LỖI & SỰ CỐ GẶP PHẢI TRONG QUÁ TRÌNH DÙNG  (gõ chữ x vào ô vàng nếu có gặp)', ST.section(C.red), 22);

        sh.row(r, [
            { v: 'STT', s: ST.colHead(C.red) },
            { v: 'Loại lỗi', s: ST.colHead(C.red) },
            { v: 'Có gặp?\n(gõ x)', s: ST.colHead(C.red) },
            { v: 'Mô tả cụ thể (màn hình nào, lúc nào, mấy lần)', s: ST.colHead(C.red) },
            { v: 'Gợi ý để anh/chị dễ điền', s: ST.colHead(C.red) }
        ]);
        sh.height(r, 30);
        r++;

        var errStart = r;
        ERRORS.forEach(function (label, idx) {
            var bg = idx % 2 === 0 ? C.white : C.redSoft;
            sh.set(r, 0, idx + 1, ST.stt);
            sh.set(r, 1, label, withFill(ST.label, bg));
            sh.set(r, 2, '', ST.inputTick);
            sh.set(r, 3, '', ST.input);
            sh.set(r, 4, idx === 0 ? ERROR_HINT : '', ST.hint);
            sh.height(r, 34);
            r++;
        });
        var errEnd = r - 1;
        refs.errorRange = 'C' + (errStart + 1) + ':C' + (errEnd + 1);
        // Ô chưa điền vẫn là ô chuỗi rỗng nên COUNTA sẽ đếm nhầm là "có đánh dấu".
        // Dùng SUMPRODUCT(--(range<>"")) để chỉ đếm ô thực sự có ký tự.
        refs.errorCountFormula = function (prefix) {
            return 'SUMPRODUCT(--(' + (prefix || '') + refs.errorRange + '<>""))';
        };

        // Dòng đếm số lỗi
        sh.set(r, 0, '', withFill(ST.label, C.redFill));
        sh.set(r, 1, 'Tổng số loại lỗi đã đánh dấu', withFill(ST.label, C.redFill));
        sh.set(r, 2, '', $.extend(true, {}, ST.cellCenter, {
            font: { bold: true, sz: 12, color: { rgb: C.red } },
            fill: { fgColor: { rgb: C.redFill } }
        }), { f: refs.errorCountFormula(), t: 'n', v: 0 });
        sh.set(r, 3, 'Ô này tự đếm, anh/chị không cần điền.', withFill(ST.hint, C.redFill));
        sh.set(r, 4, '', withFill(ST.hint, C.redFill));
        sh.height(r, 22);
        r++;

        blank();

        // ----- PHẦN E: Thiếu gì / cần bổ sung gì -----
        band('PHẦN E.  PHẦN MỀM CÒN THIẾU GÌ – CẦN BỔ SUNG GÌ', ST.section(C.purple), 22);

        sh.row(r, [
            { v: 'STT', s: ST.colHead(C.purple) },
            { v: 'Nội dung', s: ST.colHead(C.purple) },
            { v: 'Ý kiến của anh/chị', s: ST.colHead(C.purple), c: 2 },
            { v: 'Gợi ý để anh/chị dễ điền', s: ST.colHead(C.purple), c: 4 }
        ]);
        sh.set(r, 3, '', ST.colHead(C.purple));
        sh.merge(r, 2, r, 3);
        sh.height(r, 24);
        r++;

        NEEDS.forEach(function (item, idx) {
            sh.set(r, 0, idx + 1, ST.stt);
            sh.set(r, 1, item.label, withFill(ST.label, C.purpleFill));
            sh.set(r, 2, '', ST.input);
            sh.set(r, 3, '', ST.input);
            sh.merge(r, 2, r, 3);
            sh.set(r, 4, item.hint, ST.hint);
            sh.height(r, 46);
            r++;
        });

        blank();

        // ----- PHẦN F: Góp ý tự do -----
        band('PHẦN F.  GÓP Ý TỰ DO – ANH/CHỊ MUỐN NÓI GÌ VỚI TEAM PHẦN MỀM CŨNG ĐƯỢC', ST.section(C.blueDark), 22);

        FREE_HINTS.forEach(function (hint, idx) {
            sh.set(r, 0, idx + 1, ST.stt);
            sh.set(r, 1, 'Góp ý ' + (idx + 1), withFill(ST.label, C.bluePale));
            sh.set(r, 2, '', ST.input);
            sh.set(r, 3, '', ST.input);
            sh.merge(r, 2, r, 3);
            sh.set(r, 4, hint, ST.hint);
            sh.height(r, 48);
            r++;
        });

        blank();

        // ----- PHẦN G: Xác nhận -----
        band('PHẦN G.  XÁC NHẬN', ST.section(C.greenText), 22);

        sh.set(r, 0, '', withFill(ST.label, C.green));
        sh.set(r, 1, 'Tôi xác nhận các thông tin trên đúng với trải nghiệm sử dụng thực tế của tôi ' +
                     'và đồng ý để team phần mềm liên hệ lại khi cần làm rõ.', withFill(ST.label, C.green));
        sh.merge(r, 0, r, 1);
        sh.set(r, 2, '', ST.input);
        sh.set(r, 3, '', ST.input);
        sh.merge(r, 2, r, 3);
        sh.set(r, 4, 'Gõ chữ "Đồng ý" hoặc ký tên vào ô vàng ạ.', ST.hint);
        sh.height(r, 34);
        r++;

        blank();

        // ----- PHẦN H: Lịch sử cập nhật (dùng lại file cho các đợt sau) -----
        band('PHẦN H.  LỊCH SỬ CẬP NHẬT  (các đợt sau anh/chị sửa ngay trên tab này, không cần tạo file mới)', ST.section(C.grey), 22);

        sh.row(r, [
            { v: 'Đợt', s: ST.colHead(C.grey) },
            { v: 'Ngày cập nhật', s: ST.colHead(C.grey) },
            { v: 'Người cập nhật', s: ST.colHead(C.grey) },
            { v: 'Nội dung thay đổi chính so với lần trước', s: ST.colHead(C.grey) },
            { v: 'Gợi ý', s: ST.colHead(C.grey) }
        ]);
        sh.height(r, 24);
        r++;

        for (var k = 0; k < 4; k++) {
            sh.set(r, 0, k === 0 ? cfg.round : '', k === 0 ? ST.cellCode : ST.input);
            sh.set(r, 1, '', ST.input);
            sh.set(r, 2, '', ST.input);
            sh.set(r, 3, '', ST.input);
            sh.set(r, 4, k === 0
                ? 'Lần đầu điền: ghi ngày và tên người điền. Các lần sau ghi rõ đã sửa điểm nào, vì sao.'
                : '', ST.hint);
            sh.height(r, 26);
            r++;
        }

        blank();
        band('Cảm ơn anh/chị đã dành thời gian. Mọi góp ý của shop đều được team phần mềm đọc và tổng hợp gửi Ban lãnh đạo. ' +
             'Cần hỗ trợ điền phiếu, anh/chị liên hệ: ' + cfg.contact, ST.welcome, 40);

        return { ws: sh.finalize(), refs: refs };
    }

    // ---------------------------------------------------------------------
    // Tab TỔNG HỢP - công thức tham chiếu sang từng tab shop
    // ---------------------------------------------------------------------
    function quoteSheet(name) {
        return "'" + String(name).replace(/'/g, "''") + "'";
    }

    function buildSummary(entries, cfg) {
        var sh = new Sheet();
        var headers = ['STT', 'Mã shop', 'Tên shop', 'Trạng thái', 'Người điền', 'Ngày điền', 'Điểm TB'];
        CRITERIA.forEach(function (c) { headers.push(c.short); });
        headers.push('Số lỗi');

        sh.cols = [{ wch: 5 }, { wch: 11 }, { wch: 32 }, { wch: 12 }, { wch: 20 }, { wch: 13 }, { wch: 10 }];
        CRITERIA.forEach(function () { sh.cols.push({ wch: 10 }); });
        sh.cols.push({ wch: 9 });

        var LAST = headers.length - 1;
        var r = 0;

        function band(text, style, hpt) {
            sh.set(r, 0, text, style);
            sh.fillRange(r, 0, LAST, style);
            sh.merge(r, 0, r, LAST);
            sh.height(r, hpt || 20);
            r++;
        }

        band('BẢNG TỔNG HỢP FEEDBACK CÁC SHOP – PHẦN MỀM BTsoft', ST.title, 32);
        band('Đợt khảo sát: ' + cfg.round + '     •     Hạn gửi: ' + cfg.deadline +
             '     •     Tổng số shop: ' + entries.length +
             '     •     Phụ trách: ' + cfg.owner, ST.subtitle, 24);
        band('Bảng này TỰ ĐỘNG cập nhật khi các shop điền vào tab của mình – không cần gõ tay ô nào ở tab này. ' +
             'Mở file lên là số liệu tự tính lại. Bấm vào mã shop để nhảy sang tab của shop đó.', ST.note, 28);

        // Khối chỉ số nhanh - công thức điền sau khi biết vị trí bảng chi tiết
        var kpiLabelRow = r;
        var kpiValueRow = r + 1;
        r += 3;

        // Header bảng chi tiết
        var headerRow = r;
        headers.forEach(function (h, i) {
            sh.set(r, i, h, ST.colHead(C.blueDark));
        });
        sh.height(r, 30);
        r++;

        var dataStart = r;

        var statusStyle = {
            font: { bold: true, sz: 10, color: { rgb: C.blueDark } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: border(C.line)
        };
        var avgStyle = {
            font: { bold: true, sz: 12, color: { rgb: C.greenText } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: border(C.line)
        };
        var errStyle = {
            font: { bold: true, sz: 10, color: { rgb: C.red } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: border(C.line)
        };

        entries.forEach(function (entry, idx) {
            var sn = quoteSheet(entry.sheetName) + '!';
            var refs = entry.refs;
            var bg = zebra(idx);

            sh.set(r, 0, idx + 1, ST.stt);
            sh.set(r, 1, entry.shop.site_code, withFill(ST.cellLink, bg), {
                link: {
                    Target: '#' + quoteSheet(entry.sheetName) + '!A1',
                    Tooltip: 'Mở tab khảo sát của ' + entry.shop.site_name
                }
            });
            sh.set(r, 2, entry.shop.site_name, withFill(ST.cell, bg));

            sh.set(r, 3, '', withFill(statusStyle, bg), {
                f: 'IF(COUNT(' + sn + refs.scoreRange + ')=0,"Chưa điền","Đã điền")',
                t: 's', v: 'Chưa điền'
            });
            sh.set(r, 4, '', withFill(ST.cell, bg), {
                f: 'IF(' + sn + refs.person + '="","",' + sn + refs.person + ')',
                t: 's', v: ''
            });
            // Excel thường tự đổi chuỗi ngày thành số serial -> ép về dạng chữ
            // dd/mm/yyyy; nếu shop gõ chữ tự do thì IFERROR giữ nguyên chữ đó.
            sh.set(r, 5, '', withFill(ST.cellCenter, bg), {
                f: 'IF(' + sn + refs.date + '="","",IFERROR(TEXT(' + sn + refs.date + ',"dd/mm/yyyy"),' + sn + refs.date + '))',
                t: 's', v: ''
            });
            sh.set(r, 6, '', withFill(avgStyle, bg), {
                f: 'IFERROR(ROUND(AVERAGE(' + sn + refs.scoreRange + '),2),"")',
                t: 'n', v: 0
            });

            CRITERIA.forEach(function (crit, ci) {
                var addr = sn + refs.scores[crit.key];
                sh.set(r, 7 + ci, '', withFill(ST.cellCenter, bg), {
                    f: 'IF(' + addr + '="","",' + addr + ')',
                    t: 'n', v: 0
                });
            });

            sh.set(r, 7 + CRITERIA.length, '', withFill(errStyle, bg), {
                f: refs.errorCountFormula(sn),
                t: 'n', v: 0
            });

            sh.height(r, 20);
            r++;
        });

        var firstExcelRow = dataStart + 1;
        var lastExcelRow = dataStart + entries.length;
        var statusRange = 'D' + firstExcelRow + ':D' + lastExcelRow;
        var avgRange = 'G' + firstExcelRow + ':G' + lastExcelRow;

        var kpis = [
            { label: 'Tổng số shop', f: String(entries.length), t: 'n' },
            { label: 'Đã gửi feedback', f: 'COUNTIF(' + statusRange + ',"Đã điền")', t: 'n' },
            { label: 'Chưa gửi', f: 'COUNTIF(' + statusRange + ',"Chưa điền")', t: 'n' },
            { label: 'Tỷ lệ phản hồi', f: 'IFERROR(TEXT(COUNTIF(' + statusRange + ',"Đã điền")/' + entries.length + ',"0%"),"")', t: 's' },
            { label: 'Điểm TB toàn hệ thống', f: 'IFERROR(ROUND(AVERAGE(' + avgRange + '),2),"")', t: 'n' }
        ];

        kpis.forEach(function (kpi, i) {
            var c = i * 2;
            sh.set(kpiLabelRow, c, kpi.label, withFill(ST.label, C.blueLight));
            sh.set(kpiLabelRow, c + 1, '', withFill(ST.label, C.blueLight));
            sh.merge(kpiLabelRow, c, kpiLabelRow, c + 1);

            sh.set(kpiValueRow, c, '', $.extend(true, {}, ST.cellCenter, {
                font: { bold: true, sz: 14, color: { rgb: C.blueDark } },
                fill: { fgColor: { rgb: C.gold } },
                border: border(C.line)
            }), { f: kpi.f, t: kpi.t, v: kpi.t === 's' ? '' : 0 });
            sh.set(kpiValueRow, c + 1, '', withFill(ST.cellCenter, C.gold));
            sh.merge(kpiValueRow, c, kpiValueRow, c + 1);
        });
        sh.height(kpiLabelRow, 20);
        sh.height(kpiValueRow, 28);

        // Chú thích cuối bảng
        r++;
        sh.set(r, 0, 'Ghi chú: "Số lỗi" là số loại lỗi shop đã đánh dấu x ở Phần D. ' +
                     'Điểm theo thang 1–5 (5 là tốt nhất). Ô trống nghĩa là shop chưa chấm tiêu chí đó.',
               ST.note);
        sh.fillRange(r, 0, LAST, ST.note);
        sh.merge(r, 0, r, LAST);
        sh.height(r, 24);

        var ws = sh.finalize();
        ws['!autofilter'] = {
            ref: XLSX.utils.encode_range({
                s: { r: headerRow, c: 0 },
                e: { r: dataStart + entries.length - 1, c: LAST }
            })
        };

        return ws;
    }

    // ---------------------------------------------------------------------
    // Tab HƯỚNG DẪN
    // ---------------------------------------------------------------------
    function buildGuideSheet(entries, cfg) {
        var sh = new Sheet();
        sh.cols = [{ wch: 6 }, { wch: 34 }, { wch: 60 }, { wch: 38 }, { wch: 14 }];
        var LAST = 4;
        var r = 0;

        function band(text, style, hpt) {
            sh.set(r, 0, text, style);
            sh.fillRange(r, 0, LAST, style);
            sh.merge(r, 0, r, LAST);
            sh.height(r, hpt || 20);
            r++;
        }

        function blank(hpt) {
            sh.fillRange(r, 0, LAST, ST.spacer);
            sh.height(r, hpt || 8);
            r++;
        }

        band('HƯỚNG DẪN ĐIỀN PHIẾU KHẢO SÁT PHẦN MỀM BTsoft', ST.title, 34);
        band('Đợt khảo sát: ' + cfg.round + '     •     Hạn gửi lại: ' + cfg.deadline +
             '     •     Phụ trách: ' + cfg.owner + '     •     Hỗ trợ: ' + cfg.contact, ST.subtitle, 24);
        blank();

        band('1.  MỤC ĐÍCH CỦA PHIẾU NÀY', ST.section(C.blue), 22);
        band('Bên em đang triển khai BTsoft song song với phần mềm cũ (HTsoft). Phiếu này để nghe ý kiến thật từ ' +
             'người trực tiếp bán hàng mỗi ngày: cái gì tiện, cái gì còn vướng, cái gì cần thêm. ' +
             'Anh/chị góp ý càng thật thì phần mềm càng nhanh hợp với việc của shop. ' +
             'Phiếu KHÔNG dùng để chấm điểm hay đánh giá cá nhân anh/chị.', ST.welcome, 56);
        blank();

        band('2.  CÁC BƯỚC ĐIỀN – CHỈ 4 BƯỚC', ST.section(C.blue), 22);
        var steps = [
            ['Bước 1', 'Tìm tab của shop mình', 'Nhìn dãy tab ở đáy file Excel. Tên tab chính là MÃ SHOP của mình (VD: 2001). Danh sách mã shop xem ở mục 5 bên dưới.'],
            ['Bước 2', 'Chỉ điền vào ô MÀU VÀNG', 'Ô vàng là ô cần điền. Ô xám bên phải là GỢI Ý — đọc để biết nên viết gì, không cần sửa.'],
            ['Bước 3', 'Chấm điểm 1–5 và viết ý kiến', 'Phần B chấm điểm từ 1 (rất kém) đến 5 (rất tốt). Điểm trung bình tự tính, không phải cộng tay.'],
            ['Bước 4', 'Lưu và gửi lại', 'Lưu file rồi gửi lại cho ' + cfg.owner + ' trước ngày ' + cfg.deadline + '. Các đợt sau anh/chị sửa tiếp ngay trên file này.']
        ];
        steps.forEach(function (s, idx) {
            sh.set(r, 0, idx + 1, ST.stt);
            sh.set(r, 1, s[0] + ' – ' + s[1], withFill(ST.label, zebra(idx)));
            sh.set(r, 2, s[2], ST.cell);
            sh.set(r, 3, '', ST.cell);
            sh.merge(r, 2, r, 3);
            sh.set(r, 4, '', ST.cell);
            sh.height(r, 40);
            r++;
        });
        blank();

        band('3.  QUY ƯỚC MÀU – NHÌN MÀU LÀ BIẾT PHẢI LÀM GÌ', ST.section(C.blue), 22);
        var colorRules = [
            ['Ô MÀU VÀNG', ST.input, 'Ô anh/chị cần điền (điểm số, ý kiến, đánh dấu x).'],
            ['Ô MÀU XÁM, CHỮ NGHIÊNG', ST.hint, 'Gợi ý / câu hỏi mồi. Chỉ để đọc, không cần sửa.'],
            ['Ô MÀU XANH LÁ', withFill(ST.cellCenter, C.green), 'Ô tự động tính (điểm trung bình, số lỗi). Không cần điền.'],
            ['DÒNG MÀU ĐẬM', ST.section(C.blue), 'Tên từng phần của phiếu (Phần A, B, C...).']
        ];
        colorRules.forEach(function (rule, idx) {
            sh.set(r, 0, idx + 1, ST.stt);
            sh.set(r, 1, rule[0], rule[1]);
            sh.set(r, 2, rule[2], ST.cell);
            sh.set(r, 3, '', ST.cell);
            sh.merge(r, 2, r, 3);
            sh.set(r, 4, '', ST.cell);
            sh.height(r, 24);
            r++;
        });
        blank();

        band('4.  THANG ĐIỂM 1 – 5', ST.section(C.blue), 22);
        var scale = [
            ['1', 'Rất kém', 'Gần như không dùng được, phải làm tay hoặc quay lại phần mềm cũ.'],
            ['2', 'Kém', 'Dùng được nhưng rất vướng, mất nhiều thời gian.'],
            ['3', 'Bình thường', 'Tạm ổn, ngang phần mềm cũ, chưa có gì nổi bật.'],
            ['4', 'Tốt', 'Dùng thoải mái, nhanh hơn cách cũ, còn vài điểm nhỏ cần chỉnh.'],
            ['5', 'Rất tốt', 'Rất hài lòng, không phải phàn nàn gì.']
        ];
        scale.forEach(function (s, idx) {
            sh.set(r, 0, s[0], $.extend(true, {}, ST.cellCode, {
                font: { bold: true, sz: 13, color: { rgb: C.blueDark } },
                fill: { fgColor: { rgb: C.gold } }
            }));
            sh.set(r, 1, s[1], withFill(ST.label, zebra(idx)));
            sh.set(r, 2, s[2], ST.cell);
            sh.set(r, 3, '', ST.cell);
            sh.merge(r, 2, r, 3);
            sh.set(r, 4, '', ST.cell);
            sh.height(r, 22);
            r++;
        });
        blank();

        band('5.  DANH SÁCH TAB CỦA CÁC SHOP – BẤM VÀO MÃ SHOP ĐỂ MỞ NHANH TAB CỦA MÌNH', ST.section(C.purple), 22);
        sh.row(r, [
            { v: 'STT', s: ST.colHead(C.purple) },
            { v: 'Mã shop (tên tab)', s: ST.colHead(C.purple) },
            { v: 'Tên shop', s: ST.colHead(C.purple) },
            { v: 'Ghi chú', s: ST.colHead(C.purple) },
            { v: 'Mở tab', s: ST.colHead(C.purple) }
        ]);
        sh.height(r, 24);
        r++;

        entries.forEach(function (entry, idx) {
            var bg = zebra(idx);
            sh.set(r, 0, idx + 1, ST.stt);
            sh.set(r, 1, entry.shop.site_code, withFill(ST.cellCode, bg));
            sh.set(r, 2, entry.shop.site_name, withFill(ST.cell, bg));
            sh.set(r, 3, '', withFill(ST.cell, bg));
            sh.set(r, 4, 'Mở tab ➜', withFill(ST.cellLink, bg), {
                link: {
                    Target: '#' + quoteSheet(entry.sheetName) + '!A1',
                    Tooltip: 'Mở tab khảo sát của shop ' + entry.shop.site_name
                }
            });
            sh.height(r, 20);
            r++;
        });

        blank();
        band('Trong quá trình điền nếu có gì chưa rõ, anh/chị nhắn ngay cho ' + cfg.owner + ' (' + cfg.contact + '). ' +
             'Cảm ơn anh/chị rất nhiều ạ!', ST.welcome, 34);

        return sh.finalize();
    }

    // ---------------------------------------------------------------------
    // Tên tab hợp lệ cho Excel
    // ---------------------------------------------------------------------
    function safeSheetName(raw, used) {
        var name = String(raw).replace(/[\\\/\?\*\[\]:]/g, '-').trim();
        if (!name) name = 'SHOP';
        name = name.substring(0, 31);

        var base = name;
        var i = 2;
        while (used[name.toLowerCase()]) {
            var suffix = '_' + i;
            name = base.substring(0, 31 - suffix.length) + suffix;
            i++;
        }
        used[name.toLowerCase()] = true;
        return name;
    }

    // ---------------------------------------------------------------------
    // UI
    // ---------------------------------------------------------------------
    var shopsCache = null;
    var $modal = null;

    function feedbackAlert(type, message) {
        var $alert = $('#htsoftAlert');
        if ($alert.length) {
            $alert.removeClass('d-none alert-success alert-danger alert-warning alert-info')
                  .addClass('alert-' + type)
                  .find('#htsoftAlertText').text(message);
            setTimeout(function () { $alert.addClass('d-none'); }, 6000);
        } else if (type === 'danger') {
            alert(message);
        }
    }

    function renderShopList(shops) {
        var $list = $('#tgsFbShopList');
        if (!shops.length) {
            $list.html('<div class="tgs-fb-empty">Không tìm thấy shop nào có mã website.</div>');
            return;
        }

        var html = shops.map(function (shop) {
            return '<label class="tgs-fb-shop-item" data-search="' +
                   $('<div>').text((shop.site_code + ' ' + shop.site_name).toLowerCase()).html() + '">' +
                   '<input type="checkbox" class="form-check-input tgs-fb-shop-cb m-0" value="' +
                   $('<div>').text(shop.site_code).html() + '" checked>' +
                   '<span class="tgs-fb-shop-code">' + $('<div>').text(shop.site_code).html() + '</span>' +
                   '<span class="tgs-fb-shop-name">' + $('<div>').text(shop.site_name).html() + '</span>' +
                   '</label>';
        }).join('');

        $list.html(html);
        updateSelectedCount();
    }

    function updateSelectedCount() {
        var n = $('.tgs-fb-shop-cb:checked').length;
        $('#tgsFbSelectedCount').text(n + ' shop');
        $('#tgsFbExportBtn').prop('disabled', n === 0);
    }

    function loadShops() {
        if (shopsCache) {
            renderShopList(shopsCache);
            return;
        }

        $.ajax({
            url: tgsHtsoftFeedback.ajaxUrl,
            method: 'POST',
            data: {
                action: 'tgs_htsoft_feedback_sites',
                nonce: tgsHtsoftFeedback.nonce
            },
            success: function (res) {
                if (res.success) {
                    shopsCache = res.data.shops;
                    renderShopList(shopsCache);
                } else {
                    $('#tgsFbShopList').html('<div class="tgs-fb-empty text-danger">' +
                        (res.data && res.data.message ? res.data.message : 'Lỗi tải danh sách shop') + '</div>');
                }
            },
            error: function () {
                $('#tgsFbShopList').html('<div class="tgs-fb-empty text-danger">Lỗi kết nối máy chủ</div>');
            }
        });
    }

    function openModal() {
        if (!$modal) {
            var el = document.getElementById('tgsFeedbackModal');
            if (!el) {
                feedbackAlert('danger', 'Không tìm thấy hộp thoại khảo sát');
                return;
            }
            $modal = new bootstrap.Modal(el);
        }

        if (!$('#tgsFbRound').val()) $('#tgsFbRound').val(tgsHtsoftFeedback.defaultRound);
        if (!$('#tgsFbDeadline').val()) $('#tgsFbDeadline').val(tgsHtsoftFeedback.defaultDeadline);
        if (!$('#tgsFbOwner').val()) $('#tgsFbOwner').val('Team Phần mềm BTsoft');
        if (!$('#tgsFbContact').val()) $('#tgsFbContact').val('Nhóm Zalo hỗ trợ BTsoft');

        $modal.show();
        loadShops();
    }

    $(document).on('click', '.tgs-fb-open-btn', function (e) {
        e.preventDefault();
        openModal();
    });

    $(document).on('change', '.tgs-fb-shop-cb', updateSelectedCount);

    $(document).on('click', '#tgsFbSelectAll', function () {
        $('.tgs-fb-shop-item:not(.is-hidden) .tgs-fb-shop-cb').prop('checked', true);
        updateSelectedCount();
    });

    $(document).on('click', '#tgsFbClearAll', function () {
        $('.tgs-fb-shop-cb').prop('checked', false);
        updateSelectedCount();
    });

    $(document).on('input', '#tgsFbSearch', function () {
        var q = $(this).val().toLowerCase().trim();
        $('.tgs-fb-shop-item').each(function () {
            var hit = !q || ($(this).data('search') + '').indexOf(q) !== -1;
            $(this).toggleClass('is-hidden', !hit);
        });
    });

    $(document).on('click', '#tgsFbExportBtn', function () {
        var $btn = $(this);
        var selected = $('.tgs-fb-shop-cb:checked').map(function () { return String($(this).val()); }).get();

        if (!selected.length) {
            feedbackAlert('warning', 'Vui lòng chọn ít nhất 1 shop');
            return;
        }

        var cfg = {
            round: ($('#tgsFbRound').val() || '').trim() || tgsHtsoftFeedback.defaultRound,
            deadline: ($('#tgsFbDeadline').val() || '').trim() || tgsHtsoftFeedback.defaultDeadline,
            owner: ($('#tgsFbOwner').val() || '').trim() || 'Team Phần mềm BTsoft',
            contact: ($('#tgsFbContact').val() || '').trim() || 'Nhóm Zalo hỗ trợ BTsoft'
        };

        $btn.prop('disabled', true)
            .html('<span class="spinner-border spinner-border-sm me-1"></span>Đang tạo file...');
        $('#tgsFbStatus').text('Đang dựng ' + selected.length + ' tab shop...');

        setTimeout(function () {
            try {
                buildAndDownload(selected, cfg);
                $('#tgsFbStatus').text('');
                if ($modal) $modal.hide();
                feedbackAlert('success', 'Đã tạo file khảo sát cho ' + selected.length + ' shop');
            } catch (err) {
                $('#tgsFbStatus').text('');
                feedbackAlert('danger', 'Lỗi tạo file Excel: ' + (err && err.message ? err.message : err));
            } finally {
                $btn.prop('disabled', false)
                    .html('<i class="bx bx-download me-1"></i>Tạo file Excel khảo sát');
            }
        }, 50);
    });

    // ---------------------------------------------------------------------
    // Dựng workbook và tải về
    // ---------------------------------------------------------------------
    function buildAndDownload(selectedCodes, cfg) {
        var selectedSet = {};
        selectedCodes.forEach(function (code) { selectedSet[code] = true; });

        var shops = (shopsCache || []).filter(function (s) { return selectedSet[s.site_code]; });
        if (!shops.length) {
            throw new Error('Không có shop nào được chọn');
        }

        var used = {};
        var entries = shops.map(function (shop) {
            var sheetName = safeSheetName(shop.site_code, used);
            var built = buildShopSheet(shop, cfg);
            return { shop: shop, sheetName: sheetName, ws: built.ws, refs: built.refs };
        });

        var wb = XLSX.utils.book_new();
        // Ép Excel tính lại toàn bộ công thức khi mở file (tab TỔNG HỢP tham chiếu
        // chéo sang tab từng shop nên cần recalc, không dùng giá trị cache).
        wb.Workbook = { CalcPr: { fullCalcOnLoad: true } };

        XLSX.utils.book_append_sheet(wb, buildGuideSheet(entries, cfg), 'HƯỚNG DẪN');
        XLSX.utils.book_append_sheet(wb, buildSummary(entries, cfg), 'TỔNG HỢP');

        entries.forEach(function (entry) {
            XLSX.utils.book_append_sheet(wb, entry.ws, entry.sheetName);
        });

        var slug = cfg.round.replace(/[^0-9a-zA-Z]+/g, '_').replace(/^_+|_+$/g, '');
        var fileName = 'Khao_sat_feedback_BTsoft_' + (slug || 'dot') + '_' +
                       new Date().toISOString().slice(0, 10) + '.xlsx';

        XLSX.writeFile(wb, fileName);
    }

    // Đăng ký hàm mở modal ra global để nút inline gọi được
    window.tgsOpenFeedbackExport = openModal;

})(jQuery);
