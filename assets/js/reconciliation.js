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
                   data-site-code="${tab.site_code}">
                    <div class="d-flex w-100 justify-content-between align-items-center">
                        <div>
                            <h6 class="mb-0">
                                <i class="bx bx-store me-2"></i>Mã ${tab.site_code}
                            </h6>
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
});
