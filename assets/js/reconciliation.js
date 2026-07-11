jQuery(document).ready(function($) {
    const ajaxUrl = tgsHtsoftRecon.ajaxUrl;
    const nonce = tgsHtsoftRecon.nonce;

    let excelData = null;
    let currentSiteData = {};
    let selectedItems = [];

    // Handle file upload
    $('#htsoftExcelFile').on('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                excelData = {};
                workbook.SheetNames.forEach(sheetName => {
                    const sheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                    excelData[sheetName] = jsonData;
                });

                // Populate sheet select
                const $select = $('#htsoftSheetSelect');
                $select.empty().append('<option value="">-- Chọn sheet --</option>');

                workbook.SheetNames.forEach(sheetName => {
                    $select.append(`<option value="${sheetName}">${sheetName}</option>`);
                });

                $select.prop('disabled', false);

                showAlert('success', `Đã tải file thành công. Có ${workbook.SheetNames.length} sheet.`);
            } catch (error) {
                showAlert('danger', 'Lỗi đọc file Excel: ' + error.message);
            }
        };
        reader.readAsArrayBuffer(file);
    });

    // Handle sheet selection
    $('#htsoftSheetSelect').on('change', function() {
        const selectedSheet = $(this).val();
        $('#htsoftAnalyzeBtn').prop('disabled', !selectedSheet);
    });

    // Handle analyze button
    $('#htsoftAnalyzeBtn').on('click', function() {
        const selectedSheet = $('#htsoftSheetSelect').val();
        if (!selectedSheet || !excelData) {
            showAlert('warning', 'Vui lòng chọn sheet');
            return;
        }

        $(this).prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>Đang phân tích...');

        $.ajax({
            url: ajaxUrl,
            method: 'POST',
            data: {
                action: 'tgs_htsoft_parse_excel',
                nonce: nonce,
                excel_data: JSON.stringify(excelData),
                selected_sheet: selectedSheet
            },
            success: function(response) {
                if (response.success) {
                    renderAnalysisResult(response.data);
                    showAlert('success', `Đã phân tích thành công ${response.data.total_sites} website.`);
                    $('#uploadCard').addClass('d-none');
                    $('#analysisCard').removeClass('d-none');
                } else {
                    showAlert('danger', response.data.message || 'Lỗi phân tích Excel');
                }
            },
            error: function() {
                showAlert('danger', 'Lỗi kết nối server');
            },
            complete: function() {
                $('#htsoftAnalyzeBtn').prop('disabled', false).html('<i class="bx bx-analyse me-1"></i>Phân tích nhanh');
            }
        });
    });

    // Render analysis result
    function renderAnalysisResult(data) {
        $('#totalSitesBadge').text(`${data.total_sites} website`);

        const $siteList = $('#siteList');
        const $content = $('#siteTabsContent');

        $siteList.empty();
        $content.empty();

        data.tabs.forEach((tab, index) => {
            const isActive = index === 0 ? 'active' : '';

            // Vertical list item (sidebar) - CHỈ LƯU site_code, không lưu items JSON
            $siteList.append(`
                <a href="#" class="list-group-item list-group-item-action ${isActive}"
                   data-site-code="${tab.site_code}"
                   data-site-name="${tab.site_name || ''}">
                    <div class="d-flex w-100 justify-content-between align-items-center">
                        <div>
                            <h6 class="mb-1">
                                <i class="bx bx-store me-2"></i>Mã ${tab.site_code}
                            </h6>
                            ${tab.site_name ? `<small class="text-muted">${tab.site_name}</small>` : ''}
                        </div>
                        <span class="badge bg-secondary">${tab.total_items}</span>
                    </div>
                </a>
            `);

            // Lưu items vào cache JavaScript
            if (!window.tabItemsCache) {
                window.tabItemsCache = {};
            }
            window.tabItemsCache[tab.site_code] = tab.items;
        });

        // Empty state for content area
        $content.html(`
            <div class="text-center text-muted py-5">
                <i class="bx bx-info-circle" style="font-size: 48px;"></i>
                <p class="mt-3">Đang tải dữ liệu...</p>
            </div>
        `);

        // Auto load first tab
        if (data.tabs.length > 0) {
            loadTabData(data.tabs[0].site_code, data.tabs[0].items);
        }
    }

    // Handle sidebar item click
    $(document).on('click', '.htsoft-site-list .list-group-item', function(e) {
        e.preventDefault();

        // Remove active from all
        $('.htsoft-site-list .list-group-item').removeClass('active');
        // Add active to clicked
        $(this).addClass('active');

        const siteCode = $(this).data('site-code');
        const items = window.tabItemsCache[siteCode];

        // Load tab data if not loaded yet
        if (!currentSiteData[siteCode]) {
            loadTabData(siteCode, items);
        } else {
            // Re-render existing data
            renderTabContent(siteCode, currentSiteData[siteCode]);
        }
    });

    // Load tab data
    function loadTabData(siteCode, items) {
        if (currentSiteData[siteCode]) {
            return; // Đã load rồi
        }

        $.ajax({
            url: ajaxUrl,
            method: 'POST',
            data: {
                action: 'tgs_htsoft_get_tab_data',
                nonce: nonce,
                site_code: siteCode,
                excel_items: JSON.stringify(items)
            },
            success: function(response) {
                if (response.success) {
                    currentSiteData[siteCode] = response.data;
                    renderTabContent(siteCode, response.data);
                } else {
                    renderTabError(siteCode, response.data.message);
                }
            },
            error: function() {
                renderTabError(siteCode, 'Lỗi kết nối server');
            }
        });
    }

    // Render tab content
    function renderTabContent(siteCode, data) {
        const $content = $('#siteTabsContent');

        // Rút gọn tên website nếu quá dài (giữ 30 ký tự đầu)
        const siteName = data.site_name || `Website ${siteCode}`;
        const displayName = siteName.length > 30 ? siteName.substring(0, 30) + '...' : siteName;

        const statsHtml = `
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h5 class="mb-0">
                    <i class="bx bx-store me-2"></i>${displayName}
                    <small class="text-muted ms-2">(${siteCode})</small>
                </h5>
            </div>
            <div class="htsoft-stats">
                <div class="htsoft-stat-box">
                    <h6>Tổng sản phẩm</h6>
                    <div class="stat-value">${data.total_items}</div>
                </div>
                <div class="htsoft-stat-box">
                    <h6>Sản phẩm chênh lệch</h6>
                    <div class="stat-value text-danger">${data.items_with_diff}</div>
                </div>
                <div class="htsoft-stat-box">
                    <h6>Sản phẩm khớp</h6>
                    <div class="stat-value text-success">${data.total_items - data.items_with_diff}</div>
                </div>
            </div>
        `;

        // Sắp xếp: chênh lệch lớn nhất lên đầu, rồi đến chênh lệch nhỏ, cuối cùng là khớp
        data.comparison.sort((a, b) => {
            const diffA = Math.abs(a.diff);
            const diffB = Math.abs(b.diff);

            // Items có chênh lệch lên trước
            if (diffA > 0.01 && diffB <= 0.01) return -1;
            if (diffA <= 0.01 && diffB > 0.01) return 1;

            // Cả 2 đều có chênh lệch: sắp xếp theo độ lớn giảm dần
            if (diffA > 0.01 && diffB > 0.01) {
                return diffB - diffA;
            }

            // Cả 2 đều khớp: giữ nguyên thứ tự
            return 0;
        });

        let tableHtml = `
            <div class="d-flex justify-content-between align-items-center mb-3">
                <div class="btn-group" role="group">
                    <button class="btn btn-sm btn-outline-primary" onclick="selectAllDiff('${siteCode}')">
                        <i class="bx bx-check-square"></i> Chọn chênh lệch
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="clearSelection('${siteCode}')">
                        <i class="bx bx-x"></i> Bỏ chọn
                    </button>
                    <button class="btn btn-sm btn-outline-success" onclick="exportTabToExcel('${siteCode}')">
                        <i class="bx bx-download"></i> Xuất Excel
                    </button>
                </div>
                <button class="btn btn-sm btn-success" onclick="openAdjustmentModal('${siteCode}')" disabled id="createAdjBtn-${siteCode}">
                    <i class="bx bx-plus-circle me-1"></i>Tạo phiếu (<span class="selected-count-${siteCode}">0</span>)
                </button>
            </div>
            <div class="table-responsive">
                <table class="table table-sm table-hover htsoft-comparison-table">
                    <thead class="table-light">
                        <tr>
                            <th style="width: 40px"><input type="checkbox" class="form-check-input select-all-${siteCode}"></th>
                            <th style="width: 12%">SKU</th>
                            <th style="width: 35%">Tên sản phẩm</th>
                            <th style="width: 13%" class="text-end">Tồn Excel</th>
                            <th style="width: 13%" class="text-end">Tồn hệ thống</th>
                            <th style="width: 13%" class="text-end">Chênh lệch</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        data.comparison.forEach(item => {
            const diffClass = item.diff > 0 ? 'diff-positive' : (item.diff < 0 ? 'diff-negative' : 'diff-zero');

            // Format số: nếu là số nguyên thì bỏ .00, nếu có phần thập phân thì giữ 2 chữ số
            const formatNumber = (num) => {
                return num % 1 === 0 ? num.toFixed(0) : num.toFixed(2);
            };

            const diffText = item.diff > 0 ? `+${formatNumber(item.diff)}` : formatNumber(item.diff);

            // Phân loại độ chênh lệch để highlight
            let rowClass = '';
            const absDiff = Math.abs(item.diff);
            if (absDiff > 50) {
                rowClass = 'table-danger'; // Chênh lệch rất lớn
            } else if (absDiff > 10) {
                rowClass = 'table-warning'; // Chênh lệch trung bình
            } else if (absDiff > 0.01) {
                rowClass = 'table-info'; // Chênh lệch nhỏ
            }

            tableHtml += `
                <tr class="${rowClass}">
                    <td><input type="checkbox" class="form-check-input item-checkbox"
                        data-site="${siteCode}"
                        data-sku="${item.sku}"
                        data-diff="${item.diff}"
                        data-excel-qty="${item.excel_qty}"
                        data-system-qty="${item.system_qty}"
                        data-name="${item.global_product_name || item.product_name}"></td>
                    <td><code>${item.sku}</code></td>
                    <td>${item.global_product_name || item.product_name}</td>
                    <td class="text-end">${formatNumber(item.excel_qty)}</td>
                    <td class="text-end">${formatNumber(item.system_qty)}</td>
                    <td class="text-end ${diffClass}">${diffText}</td>
                </tr>
            `;
        });

        tableHtml += `
                    </tbody>
                </table>
            </div>
        `;

        $content.html(statsHtml + tableHtml);
    }

    // Render tab error
    function renderTabError(siteCode, message) {
        const $content = $('#siteTabsContent');
        $content.html(`
            <div class="alert alert-danger">
                <i class="bx bx-error me-2"></i>${message}
            </div>
        `);
    }

    // Handle checkbox selection
    $(document).on('change', '.item-checkbox', function() {
        updateSelectionButtons();
    });

    $(document).on('change', '[class*="select-all-"]', function() {
        const siteCode = $(this).attr('class').match(/select-all-(\S+)/)[1];
        const checked = $(this).prop('checked');
        $(`.item-checkbox[data-site="${siteCode}"]`).prop('checked', checked);
        updateSelectionButtons();
    });

    function updateSelectionButtons() {
        const siteCodes = Object.keys(currentSiteData);

        siteCodes.forEach(siteCode => {
            const count = $(`.item-checkbox[data-site="${siteCode}"]:checked`).length;
            $(`.selected-count-${siteCode}`).text(count);
            $(`#createAdjBtn-${siteCode}`).prop('disabled', count === 0);
        });
    }

    // Global functions for buttons
    window.selectAllDiff = function(siteCode) {
        $(`.item-checkbox[data-site="${siteCode}"]`).each(function() {
            const diff = parseFloat($(this).data('diff'));
            if (Math.abs(diff) > 0.01) {
                $(this).prop('checked', true);
            }
        });
        updateSelectionButtons();
    };

    window.clearSelection = function(siteCode) {
        $(`.item-checkbox[data-site="${siteCode}"]`).prop('checked', false);
        $(`.select-all-${siteCode}`).prop('checked', false);
        updateSelectionButtons();
    };

    window.openAdjustmentModal = function(siteCode) {
        const selectedCheckboxes = $(`.item-checkbox[data-site="${siteCode}"]:checked`);

        if (selectedCheckboxes.length === 0) {
            showAlert('warning', 'Vui lòng chọn ít nhất 1 sản phẩm');
            return;
        }

        const items = [];
        selectedCheckboxes.each(function() {
            items.push({
                sku: $(this).data('sku'),
                product_name: $(this).data('name'),
                system_qty: parseFloat($(this).data('system-qty')),
                excel_qty: parseFloat($(this).data('excel-qty')),
                diff: parseFloat($(this).data('diff'))
            });
        });

        // Format số: bỏ .00 nếu là số nguyên
        const formatNumber = (num) => {
            return num % 1 === 0 ? num.toFixed(0) : num.toFixed(2);
        };

        // Render preview
        let previewHtml = '';
        items.forEach(item => {
            const diffClass = item.diff > 0 ? 'text-success' : 'text-danger';
            const diffText = item.diff > 0 ? `+${formatNumber(item.diff)}` : formatNumber(item.diff);

            previewHtml += `
                <tr>
                    <td><code>${item.sku}</code></td>
                    <td>${item.product_name}</td>
                    <td class="text-end">${formatNumber(item.system_qty)}</td>
                    <td class="text-end">${formatNumber(item.excel_qty)}</td>
                    <td class="text-end ${diffClass}"><strong>${diffText}</strong></td>
                </tr>
            `;
        });

        $('#adjustmentItemsPreview').html(previewHtml);
        $('#adjustmentItemCount').text(items.length);
        $('#confirmAdjustmentBtn').data('site-code', siteCode).data('items', items);

        const modal = new bootstrap.Modal(document.getElementById('adjustmentModal'));
        modal.show();
    };

    // Handle create adjustment
    $('#confirmAdjustmentBtn').on('click', function() {
        const $btn = $(this);
        const siteCode = $btn.data('site-code');
        const items = $btn.data('items');
        const note = $('#adjustmentNote').val().trim();
        const blogId = currentSiteData[siteCode].blog_id;

        if (!blogId) {
            showAlert('danger', 'Lỗi: Không tìm thấy blog_id cho website này');
            return;
        }

        $btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>Đang tạo...');

        $.ajax({
            url: ajaxUrl,
            method: 'POST',
            data: {
                action: 'tgs_htsoft_create_adjustment',
                nonce: nonce,
                blog_id: blogId,
                items: JSON.stringify(items),
                note: note
            },
            success: function(response) {
                if (response.success) {
                    showAlert('success', response.data.message);

                    // Close modal
                    bootstrap.Modal.getInstance(document.getElementById('adjustmentModal')).hide();

                    // Hiển thị link đến phiếu
                    setTimeout(() => {
                        if (confirm('Phiếu điều chỉnh đã được tạo. Bạn có muốn xem chi tiết?')) {
                            // Mở tab mới sang website khác
                            window.open(response.data.detail_url, '_blank');
                        }

                        // Reload tab data (cả khi bấm OK hoặc Hủy)
                        delete currentSiteData[siteCode];
                        const items = window.tabItemsCache[siteCode];
                        if (items && items.length > 0) {
                            loadTabData(siteCode, items);
                        }
                    }, 500);
                } else {
                    showAlert('danger', response.data.message || 'Lỗi tạo phiếu điều chỉnh');
                }
            },
            error: function() {
                showAlert('danger', 'Lỗi kết nối server');
            },
            complete: function() {
                $btn.prop('disabled', false).html('<i class="bx bx-check me-1"></i>Tạo phiếu điều chỉnh');
            }
        });
    });

    // Show alert
    function showAlert(type, message) {
        const $alert = $('#htsoftAlert');
        $alert.removeClass('d-none alert-success alert-danger alert-warning alert-info')
             .addClass(`alert-${type}`)
             .find('#htsoftAlertText').text(message);

        // Auto hide after 5s
        setTimeout(() => {
            $alert.addClass('d-none');
        }, 5000);
    }

    // Helper: Thêm khối ghi chú bán hàng vào sheet Excel bên phải
    function addSalesNotesToSheet(ws, wsData, salesNotes, startCol) {
        if (!salesNotes || salesNotes.length === 0) return;

        const colLetter = XLSX.utils.encode_col(startCol);
        const colLetter2 = XLSX.utils.encode_col(startCol + 1);
        const colLetter3 = XLSX.utils.encode_col(startCol + 2);

        // Header khối ghi chú
        const headerCell = `${colLetter}1`;
        ws[headerCell] = { v: '📋 GHI CHÚ BÁN HÀNG TRONG NGÀY', t: 's' };
        ws[headerCell].s = {
            font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12 },
            fill: { fgColor: { rgb: '4472C4' } },
            alignment: { horizontal: 'center' }
        };

        // Merge header
        if (!ws['!merges']) ws['!merges'] = [];
        ws['!merges'].push({ s: { r: 0, c: startCol }, e: { r: 0, c: startCol + 2 } });

        // Sub header
        const subHeaderRow = 2;
        ws[`${colLetter}${subHeaderRow}`] = { v: 'STT', t: 's' };
        ws[`${colLetter}${subHeaderRow}`].s = {
            font: { bold: true, color: { rgb: 'FFFFFF' } },
            fill: { fgColor: { rgb: 'ED7D31' } },
            alignment: { horizontal: 'center' }
        };
        ws[`${colLetter2}${subHeaderRow}`] = { v: 'Nội dung ghi chú', t: 's' };
        ws[`${colLetter2}${subHeaderRow}`].s = {
            font: { bold: true, color: { rgb: 'FFFFFF' } },
            fill: { fgColor: { rgb: 'ED7D31' } },
            alignment: { horizontal: 'center' }
        };
        ws[`${colLetter3}${subHeaderRow}`] = { v: 'Thời gian', t: 's' };
        ws[`${colLetter3}${subHeaderRow}`].s = {
            font: { bold: true, color: { rgb: 'FFFFFF' } },
            fill: { fgColor: { rgb: 'ED7D31' } },
            alignment: { horizontal: 'center' }
        };

        // Data rows
        salesNotes.forEach((note, idx) => {
            const rowNum = idx + 3;
            const bgColor = idx % 2 === 0 ? 'FFF2CC' : 'FFFFFF';

            ws[`${colLetter}${rowNum}`] = { v: idx + 1, t: 'n' };
            ws[`${colLetter}${rowNum}`].s = {
                fill: { fgColor: { rgb: bgColor } },
                alignment: { horizontal: 'center', vertical: 'center' },
                border: { bottom: { style: 'thin', color: { rgb: 'D9D9D9' } } }
            };

            ws[`${colLetter2}${rowNum}`] = { v: note.note, t: 's' };
            ws[`${colLetter2}${rowNum}`].s = {
                fill: { fgColor: { rgb: bgColor } },
                alignment: { wrapText: true, vertical: 'center' },
                border: { bottom: { style: 'thin', color: { rgb: 'D9D9D9' } } }
            };

            const timeStr = note.created_at ? new Date(note.created_at).toLocaleString('vi-VN') : '';
            ws[`${colLetter3}${rowNum}`] = { v: timeStr, t: 's' };
            ws[`${colLetter3}${rowNum}`].s = {
                fill: { fgColor: { rgb: bgColor } },
                alignment: { horizontal: 'center', vertical: 'center' },
                border: { bottom: { style: 'thin', color: { rgb: 'D9D9D9' } } }
            };
        });

        // Tổng số ghi chú
        const totalRow = salesNotes.length + 3;
        ws[`${colLetter}${totalRow}`] = { v: `Tổng: ${salesNotes.length} ghi chú`, t: 's' };
        ws[`${colLetter}${totalRow}`].s = {
            font: { bold: true, italic: true, color: { rgb: '4472C4' } }
        };

        // Update range
        const currentRange = XLSX.utils.decode_range(ws['!ref']);
        const maxRow = Math.max(currentRange.e.r, totalRow - 1);
        const maxCol = Math.max(currentRange.e.c, startCol + 2);
        ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
    }

    // Export single tab to Excel
    window.exportTabToExcel = function(siteCode) {
        const data = currentSiteData[siteCode];
        if (!data || !data.comparison) {
            showAlert('warning', 'Chưa có dữ liệu để xuất');
            return;
        }

        // Lọc chỉ sản phẩm bị lệch
        const diffItems = data.comparison.filter(item => Math.abs(item.diff) > 0.01);

        if (diffItems.length === 0) {
            showAlert('info', 'Không có sản phẩm nào bị chênh lệch');
            return;
        }

        // Tạo workbook
        const wb = XLSX.utils.book_new();

        // Tạo data cho sheet
        const wsData = [
            ['Báo cáo sản phẩm chênh lệch tồn kho'],
            ['Website:', data.site_name || `Mã ${siteCode}`],
            ['Mã kho:', siteCode],
            ['Ngày xuất:', new Date().toLocaleString('vi-VN')],
            ['Tổng SP chênh lệch:', diffItems.length],
            [],
            ['STT', 'Mã hàng', 'Tên sản phẩm', 'Tồn HTSOFT', 'Tồn hệ thống', 'Chênh lệch']
        ];

        diffItems.forEach((item, idx) => {
            wsData.push([
                idx + 1,
                item.sku,
                item.global_product_name || item.product_name,
                item.excel_qty,
                item.system_qty,
                item.diff
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // Định dạng cột
        ws['!cols'] = [
            { wch: 5 },  // STT
            { wch: 15 }, // SKU
            { wch: 40 }, // Tên
            { wch: 12 }, // Tồn HTSOFT
            { wch: 12 }, // Tồn HT
            { wch: 12 }, // Chênh lệch
            { wch: 3 },  // Khoảng trống
            { wch: 5 },  // STT ghi chú
            { wch: 55 }, // Nội dung ghi chú
            { wch: 20 }, // Thời gian
        ];

        // Thêm khối ghi chú bán hàng bên phải (cột H = index 7)
        if (data.sales_notes && data.sales_notes.length > 0) {
            addSalesNotesToSheet(ws, wsData, data.sales_notes, 7);
        }

        XLSX.utils.book_append_sheet(wb, ws, siteCode.substring(0, 31));

        const fileName = `Chenh_lech_${siteCode}_${new Date().getTime()}.xlsx`;
        XLSX.writeFile(wb, fileName);

        showAlert('success', `Đã xuất ${diffItems.length} sản phẩm ra Excel`);
    };

    // Export all tabs to Excel
    window.exportAllToExcel = async function() {
        const allSiteCodes = Object.keys(window.tabItemsCache || {});

        if (allSiteCodes.length === 0) {
            showAlert('warning', 'Không có dữ liệu để xuất');
            return;
        }

        showAlert('info', 'Đang tải dữ liệu các website...');
        $('#exportAllBtn').prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>Đang xử lý...');

        // Load tất cả tab chưa có data
        for (const siteCode of allSiteCodes) {
            if (!currentSiteData[siteCode]) {
                const items = window.tabItemsCache[siteCode];
                await new Promise((resolve) => {
                    $.ajax({
                        url: ajaxUrl,
                        method: 'POST',
                        data: {
                            action: 'tgs_htsoft_get_tab_data',
                            nonce: nonce,
                            site_code: siteCode,
                            excel_items: JSON.stringify(items)
                        },
                        success: function(response) {
                            if (response.success) {
                                currentSiteData[siteCode] = response.data;
                            }
                            resolve();
                        },
                        error: function() {
                            resolve();
                        }
                    });
                });
            }
        }

        // Tạo workbook với nhiều sheet
        const wb = XLSX.utils.book_new();
        let totalDiffCount = 0;

        allSiteCodes.forEach((siteCode) => {
            const data = currentSiteData[siteCode];
            if (!data || !data.comparison) return;

            // Lọc sản phẩm bị lệch
            const diffItems = data.comparison.filter(item => Math.abs(item.diff) > 0.01);
            if (diffItems.length === 0) return;

            totalDiffCount += diffItems.length;

            // Tạo data cho sheet
            const wsData = [
                ['Báo cáo chênh lệch tồn kho'],
                ['Website:', data.site_name || `Mã ${siteCode}`],
                ['Mã kho:', siteCode],
                ['Số SP chênh lệch:', diffItems.length],
                [],
                ['STT', 'Mã hàng', 'Tên sản phẩm', 'Tồn HTSOFT', 'Tồn hệ thống', 'Chênh lệch']
            ];

            diffItems.forEach((item, idx) => {
                wsData.push([
                    idx + 1,
                    item.sku,
                    item.global_product_name || item.product_name,
                    item.excel_qty,
                    item.system_qty,
                    item.diff
                ]);
            });

            const ws = XLSX.utils.aoa_to_sheet(wsData);
            ws['!cols'] = [
                { wch: 5 },
                { wch: 15 },
                { wch: 40 },
                { wch: 12 },
                { wch: 12 },
                { wch: 12 },
                { wch: 3 },  // Khoảng trống
                { wch: 5 },  // STT ghi chú
                { wch: 55 }, // Nội dung ghi chú
                { wch: 20 }, // Thời gian
            ];

            // Thêm khối ghi chú bán hàng bên phải
            if (data.sales_notes && data.sales_notes.length > 0) {
                addSalesNotesToSheet(ws, wsData, data.sales_notes, 7);
            }

            // Tên sheet: Mã shop (tối đa 31 ký tự)
            const sheetName = siteCode.substring(0, 31);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });

        if (totalDiffCount === 0) {
            showAlert('info', 'Không có sản phẩm nào bị chênh lệch trong tất cả các website');
            $('#exportAllBtn').prop('disabled', false).html('<i class="bx bx-download me-1"></i>Xuất Excel tất cả');
            return;
        }

        const fileName = `Chenh_lech_tat_ca_${new Date().getTime()}.xlsx`;
        XLSX.writeFile(wb, fileName);

        showAlert('success', `Đã xuất ${totalDiffCount} sản phẩm từ ${allSiteCodes.length} website`);
        $('#exportAllBtn').prop('disabled', false).html('<i class="bx bx-download me-1"></i>Xuất Excel tất cả');
    };
});
