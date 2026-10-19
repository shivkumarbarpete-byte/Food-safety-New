

document.addEventListener('DOMContentLoaded', function () {

    let dataset = [];
    const encoders = {};
    window.addEventListener('scroll', function() {
    var winScroll = document.body.scrollTop || document.documentElement.scrollTop;
    var height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    var scrolled = (winScroll / height) * 100;
    if(el('progressBar')) el('progressBar').style.width = scrolled + "%";
});

    const additiveWatchlist = {
        "E102": "Tartrazine (colour)", "E110": "Sunset Yellow", "E122": "Carmoisine",
        "E124": "Ponceau 4R", "E129": "Allura Red", "E211": "Sodium Benzoate",
        "E221": "Sodium Sulfite", "E249": "Potassium Nitrite", "E250": "Sodium Nitrite",
        "E621": "Monosodium Glutamate (MSG)", "E330": "Citric Acid",
        "E202": "Potassium Sorbate", "E440": "Pectin"
    };

    const commonAllergens = [
        "milk", "peanut", "groundnut", "soy", "soya", "egg", "wheat",
        "gluten", "almond", "cashew", "tree nut", "sesame", "fish", "shellfish", "mustard"
    ];

    const tempRanges = {
        "Dairy": [1, 5], "Meat & Poultry": [-2, 4], "Seafood": [0, 4],
        "Fresh Produce": [2, 8], "Beverage": [2, 8], "Bakery": [15, 25],
        "Frozen Food": [-25, -18], "Baby Food": [1, 5],
        "Packaged Snack": [15, 30], "Street Food": [60, 100]
    };
    const categoryEncode = {
    "Dairy": 1, "Meat & Poultry": 2, "Seafood": 3, "Fresh Produce": 4,
    "Beverage": 5, "Bakery": 6, "Frozen Food": 7, "Baby Food": 8,
    "Packaged Snack": 9, "Street Food": 10
};

    const validFoodKeywords = [
        "chips", "biscuit", "milk", "cheese", "yogurt", "meat", "chicken",
        "fish", "vegetable", "fruit", "juice", "tea", "coffee", "bread",
        "cake", "ice cream", "dal", "rice", "snack", "sauce", "oil", "butter", "paneer"
    ];

    const harmfulWords = ["preservative", "artificial", "synthetic", "flavour enhancer"];

    var el = function (id) { return document.getElementById(id); };
    var numVal = function (id) { var e = el(id); if (!e) return null; var v = parseFloat(e.value); return isNaN(v) ? null : v; };
    function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
    function todayISO() { return new Date().toISOString().slice(0, 10); }
    function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }

    function showToast(message, type, duration) {
        type = type || 'info';
        duration = duration || 3000;
        var container = el('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }

        var toast = document.createElement('div');
        toast.className = 'toast toast-' + type;

        var iconClass = 'fa-info-circle';
        if (type === 'success') iconClass = 'fa-check-circle';
        else if (type === 'error') iconClass = 'fa-circle-xmark';
        else if (type === 'warning') iconClass = 'fa-triangle-exclamation';

        toast.innerHTML = '<i class="fas ' + iconClass + ' toast-icon"></i><div class="toast-content">' + escapeHtml(message) + '</div><button type="button" class="toast-close" aria-label="Close">&times;</button>';

        var closeBtn = toast.querySelector('.toast-close');
        var dismissed = false;
        function dismiss() {
            if (dismissed) return;
            dismissed = true;
            toast.classList.add('toast-hide');
            setTimeout(function () {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', dismiss);
        }

        container.appendChild(toast);
        setTimeout(dismiss, duration);
    }
    window.showToast = showToast;

    // ============================================================
    //  BUTTON LOADING HELPER
    //  Usage: setButtonLoading(btn, true, 'Saving...')
    //         setButtonLoading(btn, false)  — restores original
    // ============================================================
    function setButtonLoading(btn, isLoading, loadingText) {
        if (!btn) return;
        if (isLoading) {
            btn._origHTML = btn.innerHTML;
            btn._origDisabled = btn.disabled;
            var spinnerClass = (btn.classList.contains('btn-outline') || btn.style.background === '') ? 'btn-spinner btn-spinner-dark' : 'btn-spinner';
            btn.innerHTML = '<span class="' + spinnerClass + '"></span>' + (loadingText || 'Loading...');
            btn.disabled = true;
            btn.classList.add('btn-loading');
        } else {
            if (btn._origHTML !== undefined) btn.innerHTML = btn._origHTML;
            btn.disabled = btn._origDisabled || false;
            btn.classList.remove('btn-loading');
        }
    }
    window.setButtonLoading = setButtonLoading;

    function getDefaultParams(category) {
        var d = {
            "Dairy": { ph: 6.5, moisture: 80, tmin: 1, tmax: 5 },
            "Packaged Snack": { ph: 5.5, moisture: 5, tmin: 15, tmax: 30 },
            "Meat & Poultry": { ph: 6.0, moisture: 70, tmin: -2, tmax: 4 },
            "Seafood": { ph: 6.2, moisture: 75, tmin: 0, tmax: 4 },
            "Fresh Produce": { ph: 5.5, moisture: 85, tmin: 2, tmax: 8 },
            "Beverage": { ph: 3.5, moisture: 90, tmin: 2, tmax: 8 },
            "Bakery": { ph: 6.0, moisture: 35, tmin: 15, tmax: 25 },
            "Frozen Food": { ph: 6.0, moisture: 60, tmin: -25, tmax: -18 },
            "Baby Food": { ph: 5.0, moisture: 80, tmin: 1, tmax: 5 },
            "Street Food": { ph: 5.8, moisture: 50, tmin: 60, tmax: 100 }
        };
        return d[category] || { ph: 6, moisture: 50, tmin: 5, tmax: 25 };
    }

    function autoEncode(value, colIndex) {
        if (!isNaN(value)) return parseFloat(value);
        if (!encoders[colIndex]) encoders[colIndex] = {};
        if (!(value in encoders[colIndex])) encoders[colIndex][value] = Object.keys(encoders[colIndex]).length;
        return encoders[colIndex][value];
    }

    function resetEncoders() { for (var k in encoders) delete encoders[k]; }



    function validateInputs() {
        ['p_name', 'p_exp', 'fssai', 'lab_data', 'lab_limit'].forEach(function (id) {
            var elem = el(id); if (!elem) return;
            if (!elem.value || (id === 'fssai' && !/^\d{14}$/.test(elem.value)) || (id === 'lab_data' && !parseCSVNums(elem.value).length)) elem.classList.add('invalid');
            else elem.classList.remove('invalid');
        });
    }

    function parseCSVNums(s) { var n = s.split(/[,\s]+/).map(function (x) { return Number(x); }).filter(function (x) { return !isNaN(x); }); return n.length >= 2 ? n : []; }

    // nutritionTraffic: display levels ONLY — does NOT contribute to score.
    // Thresholds are UK/EU FSA 'traffic light' per-100g reference values.
    function nutritionTraffic(p) {
        var out = {};
        if (p.sugar == null) out.sugar = { level: 'NA', text: '—' };
        else { var l = p.sugar > 22.5 ? 'high' : (p.sugar > 5 ? 'med' : 'low'); out.sugar = { level: l, text: p.sugar + ' g/100g' }; }
        if (p.sodium == null) out.sodium = { level: 'NA', text: '—' };
        else { var l = p.sodium > 800 ? 'high' : (p.sodium > 300 ? 'med' : 'low'); out.sodium = { level: l, text: p.sodium + ' mg/100g' }; }
        // Sat fat: >10g/100g = high, >5g/100g = med (FSA reference)
        if (p.sat == null) out.sat = { level: 'NA', text: '—' };
        else { var l = p.sat > 10 ? 'high' : (p.sat > 5 ? 'med' : 'low'); out.sat = { level: l, text: p.sat + ' g/100g' }; }
        if (p.trans == null) out.trans = { level: 'NA', text: '—' };
        else { var l = p.trans > 2 ? 'high' : (p.trans > 0.5 ? 'med' : 'low'); out.trans = { level: l, text: p.trans + ' g/100g' }; }
        return out;
    }

    // generateFOPWarnings: returns display warning strings ONLY.
    // Uses energy-relative thresholds (% of total kcal) which are more
    // nutritionally meaningful than raw per-100g values.
    // IMPORTANT: this function does NOT directly modify the risk score.
    // Score deductions are calculated separately below in analyze().
    function generateFOPWarnings(sugar, sodium, sat, kcal) {
        var w = [];
        if (sugar !== null) {
            if (kcal) {
                var e = (sugar * 4 / kcal) * 100;
                if (e > 20) w.push("HIGH SUGAR ⚠️");
                else if (e > 10) w.push("MEDIUM SUGAR");
            } else {
                if (sugar > 22.5) w.push("HIGH SUGAR ⚠️");
                else if (sugar > 10) w.push("MEDIUM SUGAR");
            }
        }
        if (sodium !== null) {
            if (sodium > 1000) w.push("VERY HIGH SODIUM ⚠️");
            else if (sodium > 600) w.push("MEDIUM SODIUM");
        }
        if (sat !== null) {
            if (kcal) {
                var e = (sat * 9 / kcal) * 100;
                if (e > 25) w.push("HIGH SATURATED FAT ⚠️");
                else if (e > 12) w.push("MEDIUM SATURATED FAT");
            } else {
                if (sat > 10) w.push("HIGH SATURATED FAT ⚠️");
                else if (sat > 5) w.push("MEDIUM SATURATED FAT");
            }
        }
        return w;
    }

    function baseRiskByCategory(cat) {
        var m = { "Packaged Snack": 20, "Dairy": 40, "Meat & Poultry": 60, "Seafood": 65, "Fresh Produce": 25, "Beverage": 25, "Bakery": 30, "Frozen Food": 35, "Baby Food": 55, "Street Food": 70 };
        return m[cat] || 30;
    }

    function analyze() {
        validateInputs();
        var name = el('p_name') ? el('p_name').value.trim() : '';
        var cat = el('p_cat') ? el('p_cat').value : '';
        var exp = el('p_exp') ? el('p_exp').value : '';
        var ing = el('p_ing') ? el('p_ing').value.toLowerCase() : '';
        var origin = el('p_origin') ? el('p_origin').value : '';
        var fssai = el('fssai') ? el('fssai').value.trim() : '';

        var dataOrigin = window.lastDataOrigin || 'Manually Entered by User';
        var missingFields = [];

        var isConsumer = (window.currentMode === 'consumer');
        var pH = null, moisture = null, temperature = null;
        var tmin = null, tmax = null;

        if (!isConsumer) {
            // Lab / Inspector mode: read actual instrument measurements entered by user
            pH = numVal('p_ph');
            moisture = numVal('p_moisture');
            temperature = numVal('p_temp');
            tmin = numVal('t_min');
            tmax = numVal('t_max');
            if (temperature === null && tmax !== null) temperature = tmax;

            if (pH !== null && (pH < 0 || pH > 14)) missingFields.push('Invalid pH (0-14)');
            if (moisture !== null && (moisture < 0 || moisture > 100)) missingFields.push('Invalid Moisture (0-100%)');
            if (temperature !== null && (temperature < -50 || temperature > 150)) missingFields.push('Invalid Temp (-50 to 150°C)');
        }

        var sugar = numVal('n_sugar'), sodium = numVal('n_sodium'), sat = numVal('n_sat'), trans = numVal('n_trans'), kcal = numVal('n_kcal');
        [sugar, sodium, sat, trans, kcal].forEach(function(val) {
            if (val !== null && val < 0) missingFields.push('Negative nutrition value');
        });

        var notes = [], score = baseRiskByCategory(cat);

        if (!name || !validFoodKeywords.some(function (k) { return name.toLowerCase().includes(k); })) { notes.push('Unverified product name format.'); score += 5; }

        var expStatus = 'Data unavailable';
        if (exp) { 
            var d = new Date(exp), now = new Date(), days = Math.floor((d - now) / (1000 * 3600 * 24)); 
            if (days < 0) { expStatus = 'Expired (' + Math.abs(days) + ' days ago)'; score += 40; } 
            else if (days <= 3) { expStatus = 'Near expiry (' + days + ' days)'; score += 15; } 
            else expStatus = 'OK (' + days + ' days left)'; 
        }
        else { 
            notes.push('Expiry date not provided (marked Data unavailable; risk +5)'); 
            missingFields.push('Expiry Date');
            score += 5; 
        }

        if (!ing) {
            missingFields.push('Ingredients List');
            notes.push('Ingredients list not provided.');
        }

        var allergenCount = 0, additiveCount = 0, addFlags = [];
        if (ing) {
            for (var i = 0; i < commonAllergens.length; i++) if (ing.includes(commonAllergens[i])) allergenCount++;
            var em = (ing.match(/e\s?\d{3}/gi) || []).map(function (x) { return x.toUpperCase().replace(/\s/g, ''); });
            for (var j = 0; j < em.length; j++) if (additiveWatchlist[em[j]]) { additiveCount++; addFlags.push(em[j] + ': ' + additiveWatchlist[em[j]]); }
        }
        if (allergenCount > 0) { score += 8; notes.push(allergenCount + ' allergen(s) detected.'); }
        if (additiveCount > 0) { score += additiveCount * 4; notes.push('Additives: ' + addFlags.join('; ')); }
        harmfulWords.forEach(function (w) { if (ing.includes(w)) { notes.push('Contains ' + w); score += 5; } });

        if (!fssai) { 
            notes.push("FSSAI License: Data unavailable"); 
            score += 5; 
        } else if (!/^\d{14}$/.test(fssai)) { 
            notes.push("Invalid FSSAI format (14 digits required)"); 
            score += 10; 
        } else {
            notes.push("FSSAI number format valid (Format check only)");
        }

        var originStatus = 'Not set';
        if (origin === 'India') { originStatus = 'India'; } else if (origin === 'Imported') { score += 5; originStatus = 'Imported'; } else { score += 3; originStatus = 'Other'; }

        var nut = nutritionTraffic({ sugar: sugar, sodium: sodium, sat: sat, trans: trans });
        var nutNotes = [];
        for (var k in nut) { if (nut[k].level !== 'NA') nutNotes.push(k.toUpperCase() + '=' + nut[k].level.toUpperCase()); }
        if (nutNotes.length) notes.push('Nutrition levels: ' + nutNotes.join(' | '));

        var fopW = generateFOPWarnings(sugar, sodium, sat, kcal);
        var nutScorePenalty = 0;
        if (fopW.length) {
            notes.push('FOP: ' + fopW.join(' | '));
            fopW.forEach(function(w) {
                var pen = w.includes('⚠️') ? 8 : 3;
                score += pen;
                nutScorePenalty += pen;
            });
        }
        if (trans !== null && trans > 0.5) {
            score += 6;
            nutScorePenalty += 6;
            notes.push('Trans fat concern: ' + trans + 'g/100g');
        }

        var tempStatus = 'Not set';
        if (!isConsumer && !isNaN(tmin) && !isNaN(tmax) && tempRanges[cat]) {
            if (tmin < tempRanges[cat][0] || tmax > tempRanges[cat][1]) {
                notes.push('Temp out of range for ' + cat);
                score += 18;
                tempStatus = 'Out of Range';
            } else {
                tempStatus = 'OK';
            }
        }

        score = clamp(Math.round(score), 0, 100);
        
        var isInsufficient = (!name || name === 'Unknown Product') && (!exp) && (!ing);
        var riskLevelState = 'MODERATE CONCERN';
        var verdict = 'Some information requires attention.';
        var badge = 'badge-warn';

        if (isInsufficient) {
            riskLevelState = 'INSUFFICIENT INFORMATION';
            verdict = 'Insufficient Information — Please enter product name, expiry date, or ingredients.';
            badge = 'badge-warn';
            score = 0;
            notes.push("⚠️ Insufficient product information provided for screening assessment.");
        } else if (score <= 40) {
            riskLevelState = 'SAFE (LOW RISK)';
            verdict = 'Safe — No obvious issue found in available product information.';
            badge = 'badge-safe';
            notes.push("✅ No obvious issue found in available product information.");
        } else if (score >= 70) {
            riskLevelState = 'UNSAFE (HIGH RISK)';
            verdict = 'Unsafe — Potential issue detected in available product information.';
            badge = 'badge-risk';
            notes.push("⚠️ Potential issue detected in available product information.");
        } else {
            riskLevelState = 'CAUTION (MODERATE RISK)';
            verdict = 'Caution — Some information requires attention.';
            badge = 'badge-warn';
            notes.push("⚠️ Some information requires attention.");
        }

        var breakdown = {
            Nutrition: nutScorePenalty,
            Additives: additiveCount * 6,
            Expiry: exp ? (expStatus.startsWith('Expired') ? 40 : (expStatus.startsWith('Near') ? 15 : 0)) : 5,
            Temp: tempStatus === 'Out of Range' ? 18 : 0,
            Origin: origin === 'India' ? 0 : 5
        };

        return {
            name: name, cat: cat, expStatus: expStatus, allergenCount: allergenCount,
            additiveCount: additiveCount, notes: notes, score: score, badge: badge,
            verdict: verdict, riskLevelState: riskLevelState, breakdown: breakdown, originStatus: originStatus,
            tempStatus: tempStatus, fopWarnings: fopW, pH: pH, moisture: moisture,
            temperature: temperature, dataOrigin: dataOrigin, missingFields: missingFields,
            fssai: fssai
        };
    }


    var riskChart = null, labChart = null;

    function initRiskChart() {
        var c = el('riskChart'); if (!c) return;
        if (riskChart) riskChart.destroy();
        riskChart = new Chart(c.getContext('2d'), { type: 'pie', data: { labels: ['Nutrition', 'Additives', 'Expiry', 'Temp', 'Origin', 'Base'], datasets: [{ data: [1, 1, 1, 1, 1, 1], backgroundColor: ['#16a34a', '#f59e0b', '#f97316', '#ef4444', '#22d3ee', '#60a5fa'] }] }, options: {
             plugins: { 
                legend: { 
                    position: 'bottom',
                labels: { color: document.documentElement.getAttribute('data-theme') === 'dark' ? '#f1f5f9' : '#0f172a' } 
             } 
            }, maintainAspectRatio: false
         } });
    }

    function initLabChart(mean, limit) {
        mean = mean || 0; limit = limit || 0;
        var c = el('labChart'); if (!c) return;
        if (labChart) labChart.destroy();
        labChart = new Chart(c.getContext('2d'), { type: 'bar', data: { labels: ['Average', 'Safe Limit'], datasets: [{ data: [mean, limit], backgroundColor: ['#16a34a', '#d1d5db'], borderWidth: 1 }] }, options: { indexAxis: 'y', scales: { x: { beginAtZero: true } }, plugins: { legend: { display: false } }, maintainAspectRatio: false } });
    }

    function runChecks() {
        var _runBtn = el('runBtn');
        setButtonLoading(_runBtn, true, 'Evaluating...');
        showToast('Evaluating safety risk score...', 'info', 2000);
        try {
        var r = analyze();
        if (el('k_overall')) el('k_overall').textContent = r.riskLevelState;
        if (el('k_exp')) el('k_exp').textContent = r.expStatus;
        if (el('k_add')) el('k_add').textContent = r.additiveCount;
        if (el('k_all')) el('k_all').textContent = r.allergenCount;
        if (el('k_origin')) el('k_origin').textContent = r.originStatus;

        if (el('dataSourceBadge')) {
            el('dataSourceBadge').innerHTML = '<strong>Data Origin:</strong> <span class="badge" style="background:#e0f2fe; color:#0369a1;">' + escapeHtml(r.dataOrigin) + '</span>';
        }

        if (el('inputWarningBanner')) {
            if (r.missingFields && r.missingFields.length > 0) {
                el('inputWarningBanner').style.display = 'block';
                el('inputWarningBanner').innerHTML = '⚠️ <strong>Input Data Warning:</strong> Data unavailable or out of range for [' + escapeHtml(r.missingFields.join(', ')) + ']. Assessment accuracy depends on the quality and completeness of the input data.';
            } else {
                el('inputWarningBanner').style.display = 'none';
            }
        }

        var ul = el('bullets'); if (ul) { ul.innerHTML = ''; r.notes.forEach(function (n) { var li = document.createElement('li'); li.innerHTML = '<i class="fas fa-info-circle"></i> ' + n; ul.appendChild(li); }); }
        var v = el('verdict');
        if (v) {
            var labelText = (r.score <= 40 ? 'SAFE' : (r.score >= 70 ? 'UNSAFE' : 'CAUTION'));
            if (r.riskLevelState === 'INSUFFICIENT INFORMATION') labelText = 'INSUFFICIENT INFO';
            v.innerHTML = '<strong>' + labelText + '</strong> (Risk Score: ' + r.score + '/100) — ' + escapeHtml(r.verdict);
            v.className = 'badge ' + r.badge;
        }
        var fd = el('fopWarnings'); if (fd) { if (r.fopWarnings.length) { fd.innerHTML = '🚨 ' + r.fopWarnings.join(' • '); fd.style.display = 'block'; } else fd.style.display = 'none'; }

        // Render "Why was this result given?" breakdown box
        var whyBox = el('resultWhyBox');
        if (whyBox) {
            var whyHtml = '<div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:12px 16px; margin-top:12px; font-size: 0.9rem; color: #334155;">';
            whyHtml += '<h5 style="color:#0284c7; margin-bottom:4px;">WHAT WE CHECKED</h5>';
            whyHtml += '<p style="margin-top:0; margin-bottom:12px;">✓ Expiry ✓ Ingredients ✓ Allergens ✓ Additives ✓ Label information</p>';
            
            whyHtml += '<h5 style="color:#0284c7; margin-bottom:4px;">WHAT WE FOUND</h5>';
            whyHtml += '<p style="margin-top:0; margin-bottom:12px;">' + escapeHtml(r.verdict) + '</p>';
            
            whyHtml += '<h5 style="color:#0284c7; margin-bottom:4px;">WHY</h5>';
            whyHtml += '<ul style="margin-top:0; margin-bottom:12px; padding-left:20px;">';
            if (r.riskLevelState === 'INSUFFICIENT INFORMATION') {
                whyHtml += '<li>Required product information (name, expiry date, ingredients) was not provided.</li>';
            } else {
                if (r.expStatus.startsWith('Expired')) whyHtml += '<li>Product is past its expiry/best-before date (' + escapeHtml(r.expStatus) + ').</li>';
                else if (r.expStatus.startsWith('Near')) whyHtml += '<li>Product is near its expiry date (' + escapeHtml(r.expStatus) + ').</li>';
                else if (r.expStatus === 'Data unavailable') whyHtml += '<li>Expiry / best-before date was not provided.</li>';
                if (r.allergenCount > 0) whyHtml += '<li>' + r.allergenCount + ' potential allergen(s) detected in ingredients.</li>';
                if (r.additiveCount > 0) whyHtml += '<li>' + r.additiveCount + ' additive(s) / E-numbers flagged on watchlist.</li>';
                if (r.fopWarnings && r.fopWarnings.length > 0) whyHtml += '<li>Front-of-pack nutrition concerns: ' + escapeHtml(r.fopWarnings.join(', ')) + '.</li>';
                if (r.originStatus === 'Imported') whyHtml += '<li>Product is imported; origin screening applied.</li>';
                if (!r.fssai || !/^\d{14}$/.test(r.fssai)) whyHtml += '<li>FSSAI license number is missing or invalid format.</li>';
                if (r.score <= 30 && r.allergenCount === 0 && r.additiveCount === 0 && (!r.fopWarnings || r.fopWarnings.length === 0)) {
                    whyHtml += '<li>The available product information did not trigger the configured screening rules.</li>';
                }
            }
            whyHtml += '</ul>';
            
            whyHtml += '<h5 style="color:#0284c7; margin-bottom:4px;">WHAT WE CANNOT DETERMINE</h5>';
            whyHtml += '<p style="margin-top:0; margin-bottom:0;">Barcode and label information cannot confirm microbiological, chemical contaminant or laboratory-only hazards.</p>';
            whyHtml += '</div>';
            whyBox.innerHTML = whyHtml;
        }

        if (riskChart) { riskChart.data.labels = Object.keys(r.breakdown); riskChart.data.datasets[0].data = Object.values(r.breakdown); riskChart.update(); }

        var resCard = el('results-section-card');
        if (resCard) {
            resCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        showToast('Safety check complete: ' + r.verdict, r.score > 60 ? 'error' : (r.score > 30 ? 'warning' : 'success'));
        } catch (err) {
            showToast('Safety check failed: ' + (err.message || err), 'error');
        } finally {
            setButtonLoading(_runBtn, false);
        }
    }

    async function saveReview() {
    var r = analyze();
    var token = localStorage.getItem('fs_token');
    if (!token) { showToast('Please login first to save reviews!', 'warning'); return; }
    var btn = el('saveReview');
    setButtonLoading(btn, true, 'Saving...');
    try {
        // In Consumer Mode, pH/moisture/temperature are not measured; send null.
        var isConsumer = (window.currentMode === 'consumer');
        var res = await fetch((window.API_BASE || 'http://localhost:5000') + '/api/reviews', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({
            name: r.name || '?',
            cat: r.cat,
            verdict: r.verdict,
            score: r.score,
            origin: r.originStatus,
            notes: r.notes.join(' | '),
            pH: isConsumer ? null : r.pH,
            moisture: isConsumer ? null : r.moisture,
            temperature: isConsumer ? null : r.temperature,
            safe: r.verdict.includes('Low Risk') ? 1 : 0,
              catCode: categoryEncode[r.cat] || 0
            })
        });
        var data = await res.json();
        if (!res.ok) { showToast(data.message || 'Failed to save review', 'error'); return; }
        renderHistory();
        showToast('Review saved successfully!', 'success');
    } catch (err) {
        showToast('Server error. Is the backend running?', 'error');
    } finally {
        setButtonLoading(btn, false);
    }
}

    function downloadHTML() { 
        var r = analyze(); 
        var h = '<html><head><meta charset="utf-8"><title>' + escapeHtml(r.name) + '</title></head><body style="font-family:sans-serif; padding:20px; line-height:1.5;">' +
            '<h1>Preliminary Risk Assessment Report</h1>' +
            '<p><strong>Product:</strong> ' + escapeHtml(r.name) + '<br><strong>Category:</strong> ' + escapeHtml(r.cat) + '<br><strong>Data Origin:</strong> ' + escapeHtml(r.dataOrigin) + '<br><strong>Verdict:</strong> ' + escapeHtml(r.verdict) + ' (' + r.score + '/100)</p>' +
            '<h3>Analysis Findings:</h3><ul>' + r.notes.map(function (n) { return '<li>' + escapeHtml(n) + '</li>'; }).join('') + '</ul>' +
            '<hr style="margin-top:20px;">' +
            '<p style="font-size:0.85rem; color:#4b5563;"><strong>Disclaimer:</strong> This is a preliminary screening assessment based on available product information. It is not a laboratory test or regulatory certification.<br>Assessment accuracy depends on the quality and completeness of the input data.</p>' +
            '</body></html>'; 
        var b = new Blob([h], { type: 'text/html' }); 
        var a = document.createElement('a'); 
        a.href = URL.createObjectURL(b); 
        a.download = 'preliminary_risk_report.html'; 
        document.body.appendChild(a); 
        a.click(); 
        a.remove(); 
    }

    function downloadPDF() { 
        var jsPDF = window.jspdf ? window.jspdf.jsPDF : (window.jsPDF || null);
        if (!jsPDF) { showToast('jsPDF library not loaded', 'error'); return; } 
        var r = analyze(); 
        var doc = new jsPDF(); 
        var y = 15;

        // Title Header
        doc.setFillColor(30, 41, 59);
        doc.rect(0, 0, 210, 25, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(15);
        doc.setFont('helvetica', 'bold');
        doc.text('PRELIMINARY RISK ASSESSMENT REPORT', 14, 16);

        y = 35;
        doc.setTextColor(0, 0, 0);

        // Section A: PRODUCT & TRACEABILITY INFORMATION
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(241, 245, 249);
        doc.rect(14, y - 5, 182, 8, 'F');
        doc.text('1. PRODUCT IDENTIFICATION & DATA ORIGIN', 16, y);
        y += 8;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text('Product Name: ' + (r.name || 'Unspecified'), 16, y);
        doc.text('Category: ' + (r.cat || 'Unspecified'), 110, y);
        y += 6;
        doc.text('Data Source / Origin: ' + (r.dataOrigin || 'User Input'), 16, y);
        doc.text('Expiry Status: ' + (r.expStatus || 'N/A'), 110, y);
        y += 6;
        doc.text('FSSAI License Format: ' + (r.fssaiStatus || 'Format Checked'), 16, y);
        y += 10;

        // Section B: USER-PROVIDED & RETRIEVED PRODUCT DATA
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(241, 245, 249);
        doc.rect(14, y - 5, 182, 8, 'F');
        doc.text('2. USER-PROVIDED DATA & INGREDIENT ANALYSIS', 16, y);
        y += 8;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        var ingStr = el('p_ing') ? el('p_ing').value.trim() : 'Not provided';
        var ingSplit = doc.splitTextToSize('Ingredients: ' + ingStr, 178);
        doc.text(ingSplit, 16, y);
        y += (ingSplit.length * 5) + 4;

        if (r.fopWarnings && r.fopWarnings.length > 0) {
            doc.text('Front-of-Pack Nutrition Warnings: ' + r.fopWarnings.join(' | '), 16, y);
            y += 6;
        }

        // Section C: PRELIMINARY RISK SCREENING & VERDICT
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(241, 245, 249);
        doc.rect(14, y - 5, 182, 8, 'F');
        doc.text('3. PRELIMINARY SCREENING VERDICT', 16, y);
        y += 8;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('Assessment Outcome: ' + r.verdict + ' (Risk Score: ' + r.score + ' / 100)', 16, y);
        y += 6;

        doc.setFont('helvetica', 'normal');
        doc.text('Assessment Findings:', 16, y);
        y += 6;
        r.notes.forEach(function (n) { 
            if (y > 260) { doc.addPage(); y = 20; } 
            var lines = doc.splitTextToSize('• ' + n, 174);
            doc.text(lines, 18, y); 
            y += (lines.length * 4) + 2; 
        }); 
        y += 6;

        // Section D: EXPERIMENTAL ML ESTIMATE (IF RUN)
        var knnOut = el('knn_out') ? el('knn_out').innerText.trim() : '';
        if (knnOut) {
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.setFillColor(241, 245, 249);
            doc.rect(14, y - 5, 182, 8, 'F');
            doc.text('4. EXPERIMENTAL MACHINE LEARNING (k-NN) ESTIMATE', 16, y);
            y += 8;

            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            var mlSplit = doc.splitTextToSize('ML Prediction: ' + knnOut + ' (Preliminary Estimate Only)', 178);
            doc.text(mlSplit, 16, y);
            y += (mlSplit.length * 5) + 6;
        }

        // Section E: LIMITATIONS & DISCLAIMERS
        if (y > 230) { doc.addPage(); y = 20; }
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(254, 226, 226);
        doc.rect(14, y - 5, 182, 8, 'F');
        doc.setTextColor(185, 28, 28);
        doc.text('5. SCOPE & LIMITATIONS DISCLAIMER', 16, y);
        y += 8;

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(50, 50, 50);

        var disclaimers = [
            '1. Preliminary Screening: This software provides a preliminary risk assessment based on available product information only.',
            '2. Not a Laboratory Certification: This report does NOT certify a product as officially safe or unsafe, nor does it replace laboratory testing.',
            '3. Data Dependence: Evaluation accuracy depends strictly on the quality and accuracy of user-supplied data and database entries.',
            '4. Regulatory Scope: Format validation verifies barcode / FSSAI number length but does not perform official regulatory registry verification.'
        ];

        disclaimers.forEach(function(d) {
            var lines = doc.splitTextToSize(d, 178);
            doc.text(lines, 16, y);
            y += (lines.length * 4) + 2;
        });

        doc.save('preliminary_risk_report.pdf'); 
        showToast('Exported Preliminary Risk Report PDF', 'success');
    }

    function stdNormCDF(x) { var t = 1 / (1 + 0.2316419 * Math.abs(x)); var d = 0.3989423 * Math.exp(-x * x / 2); var p = 1 - d * t * (1.330274429 + t * (-1.821255978 + t * (1.781477937 + t * (-0.356563782 + t * 0.319381530)))); return x >= 0 ? p : 1 - p; }

    function studentTCDF(x, v) {
        function betacf(x, a, b) { var MAXIT = 100, EPS = 3e-7, FPMIN = 1e-30, qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; var h = d; for (var m = 1, m2 = 2; m <= MAXIT; m++, m2 += 2) { var aa = m * (b - m) * x / ((qam + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c; aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2)); d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c; if (Math.abs(d * c - 1) < EPS) break; } return h; }
        function gammaln(z) { var cof = [76.18, -86.5, 24.01, -1.23, 0.0012, -5.3e-6]; var x = z, y = z, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp); var ser = 1.000000000190015; for (var j = 0; j < 6; j++) { y += 1; ser += cof[j] / y; } return -tmp + Math.log(2.5066 * ser / x); }
        function betai(x, a, b) { var bt = (x === 0 || x === 1) ? 0 : Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x)); if (x < (a + 1) / (a + b + 2)) return bt * betacf(x, a, b) / a; else return 1 - bt * betacf(1 - x, b, a) / b; }
        return 0.5 * betai(v / (v + x * x), v / 2, 0.5);
    }

    function generateLabReportId() {
        var now = new Date();
        var yyyy = now.getFullYear();
        var mm = String(now.getMonth() + 1).padStart(2, '0');
        var dd = String(now.getDate()).padStart(2, '0');
        var rnd = String(Math.floor(1000 + Math.random() * 9000));
        return 'REPORT-LAB-' + yyyy + mm + dd + '-' + rnd;
    }

    function runLabTest() {
        var reportId = el('lab_report_id') ? el('lab_report_id').value.trim() : '';
        if (!reportId) {
            reportId = generateLabReportId();
            if (el('lab_report_id')) el('lab_report_id').value = reportId;
        }

        var sampleId = el('lab_sample_id') ? el('lab_sample_id').value.trim() : '';
        var sampleName = el('lab_sample_name') ? el('lab_sample_name').value.trim() : '';
        var batchNo = el('lab_batch_no') ? el('lab_batch_no').value.trim() : '';
        var collectionDate = el('lab_collection_date') ? el('lab_collection_date').value : '';
        var receivedDate = el('lab_received_date') ? el('lab_received_date').value : '';
        var testingDate = el('lab_testing_date') ? el('lab_testing_date').value : '';
        var testMethod = el('lab_test_method') ? el('lab_test_method').value.trim() : '';
        var analyst = el('lab_analyst') ? el('lab_analyst').value.trim() : '';
        var reviewer = el('lab_reviewer') ? el('lab_reviewer').value.trim() : '';

        var param = el('lab_param') ? el('lab_param').value.trim() : '';
        var unit = el('lab_unit') ? el('lab_unit').value.trim() : '';
        param = param || 'Measured Parameter';
        unit = unit || 'units';

        var data = parseCSVNums(el('lab_data') ? el('lab_data').value : '');
        var L = parseFloat(el('lab_limit') ? el('lab_limit').value : '');
        var sourceType = el('lab_limit_source_type') ? el('lab_limit_source_type').value : 'User-provided';
        var sourceDesc = el('lab_limit_source_desc') ? el('lab_limit_source_desc').value.trim() : '';

        var sigma = parseFloat(el('lab_sigma') ? el('lab_sigma').value : '');
        var alpha = parseFloat(el('lab_alpha') ? el('lab_alpha').value : '0.05');
        var out = el('lab_out'), summary = el('lab_summary');
        if (!out) return; out.innerHTML = '';
        if (!data.length) { 
            out.innerHTML = '<li>Enter valid numeric measurements.</li>'; 
            if (summary) { summary.textContent = 'Invalid Data'; summary.className = 'badge badge-risk'; } 
            return; 
        }

        var n = data.length, mean = data.reduce(function (a, b) { return a + b; }, 0) / n;
        var sd = 0, se = 0, z = 0, p = 0, useZ = false;

        if (n > 1) {
            sd = isNaN(sigma) ? Math.sqrt(data.reduce(function (a, x) { return a + (x - mean) * (x - mean); }, 0) / (n - 1)) : sigma;
            se = sd / Math.sqrt(n);
            if (!isNaN(L)) {
                z = (mean - L) / se;
                useZ = !isNaN(sigma);
                p = useZ ? (1 - stdNormCDF(z)) : (1 - studentTCDF(z, n - 1));
            }
        }

        if (el('lab_n')) el('lab_n').textContent = n;
        if (el('lab_mean')) el('lab_mean').textContent = mean.toFixed(2) + ' ' + unit;
        if (el('lab_sd')) el('lab_sd').textContent = (n > 1 ? sd.toFixed(2) : 'N/A') + ' ' + unit;

        var dec = 'Analysis Complete';
        if (!isNaN(L) && n > 1) {
            dec = p < alpha ? 'Exceeds Reference Limit (p < α)' : 'Within Reference Limit (p ≥ α)';
            if (summary) { 
                summary.textContent = dec; 
                summary.className = 'badge ' + (p < alpha ? 'badge-risk' : 'badge-safe'); 
            }
        } else {
            if (summary) { 
                summary.textContent = 'Reference limit not provided / Insufficient data for test'; 
                summary.className = 'badge badge-warn'; 
            }
        }

        var sourceText = sourceType + (sourceDesc ? ' (' + escapeHtml(sourceDesc) + ')' : '');
        var interpretation = 'Reference limit not provided. Cannot determine safety.';
        if (!isNaN(L) && n > 1) {
            interpretation = p < alpha ? 
                'Statistically significant evidence that sample mean exceeds reference limit (' + escapeHtml(param) + ' > ' + L + ' ' + escapeHtml(unit) + ', p = ' + p.toFixed(4) + ' < α = ' + alpha + ').' :
                'No statistically significant evidence that sample mean exceeds reference limit (' + escapeHtml(param) + ' ≤ ' + L + ' ' + escapeHtml(unit) + ', p = ' + p.toFixed(4) + ' ≥ α = ' + alpha + ').';
        }

        var facility = el('lab_facility') ? el('lab_facility').value.trim() : '';

        var listItems = [
            '<strong>Data Origin:</strong> <span class="badge" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a;">User-Entered Laboratory Measurements</span>',
            '<strong>Report Tracking ID:</strong> <span class="text-primary font-bold">' + escapeHtml(reportId) + '</span> ' + (sampleId ? '| <strong>Sample ID:</strong> ' + escapeHtml(sampleId) : '') + (batchNo ? ' | <strong>Batch/Lot:</strong> ' + escapeHtml(batchNo) : ''),
            (sampleName ? '<strong>Product / Sample Name:</strong> ' + escapeHtml(sampleName) : null),
            (facility ? '<strong>Testing Laboratory:</strong> ' + escapeHtml(facility) : null),
            (testMethod ? '<strong>Test Method / Standard:</strong> ' + escapeHtml(testMethod) : null),
            '<strong>Parameter Evaluated:</strong> ' + escapeHtml(param) + ' (' + escapeHtml(unit) + ')',
            '<strong>User-Entered Measurements:</strong> ' + data.join(', ') + ' ' + escapeHtml(unit),
            '<strong>Sample Size (n):</strong> ' + n + ' | <strong>Sample Mean (x̄):</strong> ' + mean.toFixed(2) + ' ' + escapeHtml(unit),
            (!isNaN(L) ? '<strong>Reference Threshold Limit (L):</strong> ' + L + ' ' + escapeHtml(unit) + ' <small style="color:#6b7280;">[' + escapeHtml(sourceText) + ']</small>' : '<strong>Reference Threshold Limit:</strong> Reference limit not provided.'),
            (!isNaN(L) && n > 1 ? '<strong>Statistical Model Used:</strong> ' + (useZ ? 'Z-Test (known σ = ' + sigma + ')' : 'T-Test (sample s = ' + sd.toFixed(2) + ')') : null),
            (!isNaN(L) && n > 1 ? '<strong>Standard Error (SE):</strong> ' + se.toFixed(2) + ' | <strong>Test Statistic (' + (useZ ? 'z' : 't') + '):</strong> ' + z.toFixed(2) : null),
            (!isNaN(L) && n > 1 ? '<strong>p-value:</strong> ' + p.toFixed(4) + ' (Alpha level α = ' + alpha + ', Confidence Level = ' + Math.round((1 - alpha) * 100) + '%)' : null),
            '<strong>Statistical Interpretation:</strong> ' + interpretation,
            (analyst || reviewer ? '<strong>Personnel:</strong> Analyst: ' + escapeHtml(analyst || 'N/A') + ' | Reviewer: ' + escapeHtml(reviewer || 'N/A') : null)
        ];

        listItems.forEach(function (s) { 
            if (!s) return;
            var li = document.createElement('li'); 
            li.innerHTML = s; 
            out.appendChild(li); 
        });

        initLabChart(mean, L);

        // Store active lab calculation output on window for PDF generation & saving
        window.lastLabResult = {
            reportId: reportId,
            sampleId: sampleId,
            sampleName: sampleName,
            batchNo: batchNo,
            collectionDate: collectionDate,
            receivedDate: receivedDate,
            testingDate: testingDate,
            testMethod: testMethod,
            analyst: analyst,
            reviewer: reviewer,
            param: param,
            unit: unit,
            data: data,
            limit: L,
            sourceType: sourceType,
            sourceDesc: sourceDesc,
            sigma: isNaN(sigma) ? null : sigma,
            alpha: alpha,
            n: n,
            mean: mean,
            sd: sd,
            se: se,
            z: z,
            useZ: useZ,
            p: p,
            decision: dec,
            interpretation: interpretation,
            timestamp: new Date().toISOString()
        };
    }

    function getSavedLabAssessments() {
        try {
            var raw = localStorage.getItem('fs_lab_history');
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function renderLabSavedSelect() {
        var select = el('labSavedSelect');
        if (!select) return;
        var arr = getSavedLabAssessments();
        select.innerHTML = '<option value="">-- Load Saved Test --</option>';
        arr.forEach(function(item) {
            var opt = document.createElement('option');
            opt.value = item.reportId;
            var label = (item.reportId || 'ID-N/A') + ' - ' + (item.sampleName || item.param || 'Test') + ' (' + (item.timestamp ? item.timestamp.slice(0, 10) : '') + ')';
            opt.textContent = label;
            select.appendChild(opt);
        });
    }

    function saveLabAssessment() {
        runLabTest();
        if (!window.lastLabResult) {
            showToast('No valid lab result to save.', 'error');
            return;
        }
        var arr = getSavedLabAssessments();
        var idx = arr.findIndex(function(x) { return x.reportId === window.lastLabResult.reportId; });
        if (idx >= 0) {
            arr[idx] = window.lastLabResult;
        } else {
            arr.unshift(window.lastLabResult);
        }
        localStorage.setItem('fs_lab_history', JSON.stringify(arr));
        renderLabSavedSelect();
        showToast('Lab assessment saved with ID: ' + window.lastLabResult.reportId, 'success');
    }

    function loadSavedLabAssessment(reportId) {
        if (!reportId) return;
        var arr = getSavedLabAssessments();
        var item = arr.find(function(x) { return x.reportId === reportId; });
        if (!item) {
            showToast('Saved test not found.', 'error');
            return;
        }

        if (el('lab_report_id')) el('lab_report_id').value = item.reportId || '';
        if (el('lab_sample_id')) el('lab_sample_id').value = item.sampleId || '';
        if (el('lab_sample_name')) el('lab_sample_name').value = item.sampleName || '';
        if (el('lab_batch_no')) el('lab_batch_no').value = item.batchNo || '';
        if (el('lab_collection_date')) el('lab_collection_date').value = item.collectionDate || '';
        if (el('lab_received_date')) el('lab_received_date').value = item.receivedDate || '';
        if (el('lab_testing_date')) el('lab_testing_date').value = item.testingDate || '';
        if (el('lab_test_method')) el('lab_test_method').value = item.testMethod || '';
        if (el('lab_analyst')) el('lab_analyst').value = item.analyst || '';
        if (el('lab_reviewer')) el('lab_reviewer').value = item.reviewer || '';

        if (el('lab_param')) el('lab_param').value = item.param || '';
        if (el('lab_unit')) el('lab_unit').value = item.unit || '';
        if (el('lab_data')) el('lab_data').value = item.data ? item.data.join(', ') : '';
        if (el('lab_limit')) el('lab_limit').value = item.limit !== undefined ? item.limit : '';
        if (el('lab_limit_source_type')) el('lab_limit_source_type').value = item.sourceType || 'User-provided';
        if (el('lab_limit_source_desc')) el('lab_limit_source_desc').value = item.sourceDesc || '';
        if (el('lab_sigma')) el('lab_sigma').value = item.sigma !== null && item.sigma !== undefined ? item.sigma : '';
        if (el('lab_alpha')) el('lab_alpha').value = item.alpha || '0.05';

        runLabTest();
        showToast('Restored lab test assessment: ' + item.reportId, 'info');
    }

    function downloadLabPDF() {
        runLabTest();
        var res = window.lastLabResult;
        if (!res) {
            showToast('No valid laboratory test data available to export.', 'warning');
            return;
        }

        var jsPDF = window.jspdf ? window.jspdf.jsPDF : (window.jsPDF || null);
        if (!jsPDF) {
            showToast('jsPDF library not loaded.', 'error');
            return;
        }

        var doc = new jsPDF();
        var y = 15;

        // Title Header
        doc.setFillColor(30, 41, 59);
        doc.rect(0, 0, 210, 25, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('LABORATORY STATISTICAL ASSESSMENT REPORT', 14, 16);

        y = 35;
        doc.setTextColor(0, 0, 0);

        // Section A: SAMPLE INFORMATION & TRACEABILITY
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(241, 245, 249);
        doc.rect(14, y - 5, 182, 8, 'F');
        doc.text('A. SAMPLE INFORMATION & TRACEABILITY', 16, y);
        y += 8;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text('Report ID: ' + (res.reportId || 'N/A'), 16, y);
        doc.text('Sample ID: ' + (res.sampleId || 'Not Specified'), 110, y);
        y += 6;
        doc.text('Product / Sample Name: ' + (res.sampleName || 'Not Specified'), 16, y);
        doc.text('Batch / Lot #: ' + (res.batchNo || 'Not Specified'), 110, y);
        y += 6;
        doc.text('Collection Date: ' + (res.collectionDate || 'N/A'), 16, y);
        doc.text('Received Date: ' + (res.receivedDate || 'N/A'), 80, y);
        doc.text('Testing Date: ' + (res.testingDate || 'N/A'), 140, y);
        y += 6;
        doc.text('Test Method: ' + (res.testMethod || 'Standard Laboratory Measurement'), 16, y);
        y += 6;
        doc.text('Personnel: Analyst: ' + (res.analyst || 'Unspecified') + ' | Reviewer: ' + (res.reviewer || 'Unspecified'), 16, y);
        y += 10;

        // Section B: INPUT DATA
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(241, 245, 249);
        doc.rect(14, y - 5, 182, 8, 'F');
        doc.text('B. INPUT MEASUREMENT DATA', 16, y);
        y += 8;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text('Parameter Name: ' + res.param + ' (' + res.unit + ')', 16, y);
        y += 6;
        doc.text('Reference Limit (L): ' + res.limit + ' ' + res.unit + ' [' + res.sourceType + (res.sourceDesc ? ': ' + res.sourceDesc : '') + ']', 16, y);
        y += 6;

        var rawDataStr = res.data ? res.data.join(', ') : 'N/A';
        var splitData = doc.splitTextToSize('Raw Measurements: ' + rawDataStr + ' ' + res.unit, 178);
        doc.text(splitData, 16, y);
        y += (splitData.length * 5) + 4;

        // Section C: STATISTICAL ANALYSIS
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(241, 245, 249);
        doc.rect(14, y - 5, 182, 8, 'F');
        doc.text('C. STATISTICAL ANALYSIS', 16, y);
        y += 8;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text('Statistical Method: ' + (res.useZ ? 'Z-Test (known σ)' : 'One-Sample T-Test (sample s)'), 16, y);
        doc.text('Sample Size (n): ' + res.n, 120, y);
        y += 6;
        doc.text('Sample Mean (x̄): ' + res.mean.toFixed(2) + ' ' + res.unit, 16, y);
        doc.text('Std Dev (s/σ): ' + res.sd.toFixed(2) + ' ' + res.unit, 80, y);
        doc.text('Std Error (SE): ' + res.se.toFixed(2), 140, y);
        y += 6;
        doc.text('Test Statistic (' + (res.useZ ? 'z' : 't') + '): ' + res.z.toFixed(2), 16, y);
        doc.text('p-value: ' + res.p.toFixed(4) + ' (α = ' + res.alpha + ')', 80, y);
        y += 6;

        doc.setFont('helvetica', 'bold');
        doc.text('Statistical Decision: ' + res.decision, 16, y);
        y += 6;
        doc.setFont('helvetica', 'normal');
        var interpSplit = doc.splitTextToSize('Interpretation: ' + res.interpretation, 178);
        doc.text(interpSplit, 16, y);
        y += (interpSplit.length * 5) + 6;

        // Section D: ML / PRELIMINARY SCREENING RESULT (IF APPLICABLE)
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(241, 245, 249);
        doc.rect(14, y - 5, 182, 8, 'F');
        doc.text('D. PRELIMINARY ML / SCREENING ESTIMATES (IF APPLICABLE)', 16, y);
        y += 8;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        var knnElem = el('knn_out');
        var knnText = (knnElem && knnElem.innerText) ? knnElem.innerText.trim() : 'No separate ML model prediction run for this sample.';
        doc.text('Model / Method: k-Nearest Neighbors (k-NN) / Decision Tree Screening', 16, y);
        y += 6;
        var knnSplit = doc.splitTextToSize('Screening Output: ' + knnText + ' (Labeled as Preliminary / Experimental)', 178);
        doc.text(knnSplit, 16, y);
        y += (knnSplit.length * 5) + 6;

        // Section E: LIMITATIONS & DISCLAIMERS
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(254, 226, 226);
        doc.rect(14, y - 5, 182, 8, 'F');
        doc.setTextColor(185, 28, 28);
        doc.text('E. LIMITATIONS & DISCLAIMERS', 16, y);
        y += 8;

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(50, 50, 50);

        var disclaimers = [
            '1. Preliminary Assessment: This software does NOT provide official laboratory accreditation or safety certification.',
            '2. Statistical Boundaries: Statistical calculations confirm sample sample mean properties but do not replace complete microbial/chemical regulatory testing.',
            '3. Data Dependence: Analysis validity strictly depends on the accuracy and completeness of user-supplied data and measurements.',
            '4. ML Estimates: Machine learning predictions are experimental preliminary estimates and cannot be used for legal or compliance disputes.',
            '5. Regulatory Notice: No official government approval, accreditation ID, or FSSAI certificate is generated by this report.'
        ];

        disclaimers.forEach(function(d) {
            var lines = doc.splitTextToSize(d, 178);
            doc.text(lines, 16, y);
            y += (lines.length * 4) + 2;
        });

        doc.save('laboratory_report_' + res.reportId + '.pdf');
        showToast('Generated 5-Section Laboratory Report: ' + res.reportId, 'success');
    }
async function renderHistory() {
    var token = localStorage.getItem('fs_token');
    var tb = document.querySelector('#history_table tbody');
    if (tb) tb.innerHTML = '';

    if (!token) {
        if (el('dash_total')) el('dash_total').textContent = '0';
        if (el('dash_safe')) el('dash_safe').textContent = '0';
        if (el('dash_unsafe')) el('dash_unsafe').textContent = '0';
        if (el('dash_avg')) el('dash_avg').textContent = '0%';
        return;
    }

    try {
        var res = await fetch((window.API_BASE || 'http://localhost:5000') + '/api/reviews', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        var arr = await res.json();
        if (!res.ok) return;

        var safe = arr.filter(function (r) { return r.verdict.includes('No obvious issue') || r.verdict.includes('Low Risk') || r.safe === 1; }).length;
        var unsafe = arr.filter(function (r) { return r.verdict.includes('Potential issue') || r.verdict.includes('Attention') || r.verdict.includes('Higher Risk'); }).length;
        var avgScore = arr.length ? Math.round(arr.reduce(function (s, r) { return s + r.score; }, 0) / arr.length) : 0;

        if (el('dash_total')) el('dash_total').textContent = arr.length;
        if (el('dash_safe')) el('dash_safe').textContent = safe;
        if (el('dash_unsafe')) el('dash_unsafe').textContent = unsafe;
        if (el('dash_avg')) el('dash_avg').textContent = avgScore + '%';

        arr.forEach(function (r) {
            var tr = document.createElement('tr');
            tr.innerHTML = '<td>' + escapeHtml(new Date(r.ts).toLocaleString()) + '</td><td>' + escapeHtml(r.name) + '</td><td>' + escapeHtml(r.cat) + '</td><td>' + escapeHtml(r.verdict) + '</td><td>' + r.score + '</td><td>' + escapeHtml(r.origin) + '</td><td>' + escapeHtml((r.notes || '').slice(0, 80)) + '</td>';
            tb.appendChild(tr);
        });
    } catch (err) {
        console.error('Failed to load history', err);
    }
}

    async function exportHistoryCSV() {
    var token = localStorage.getItem('fs_token');
    if (!token) { showToast('Please login first!', 'warning'); return; }
    var btn = el('exportCSV');
    setButtonLoading(btn, true, 'Exporting...');
    try {
        var res = await fetch((window.API_BASE || 'http://localhost:5000') + '/api/reviews', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        var a = await res.json();
        if (!res.ok || !a.length) { showToast('No history to export', 'info'); return; }

        var csv = 'Date,Product,Category,Verdict,Score\n' + a.map(function (r) {
            return '"' + new Date(r.ts).toLocaleString() + '","' + r.name + '","' + r.cat + '","' + r.verdict + '",' + r.score;
        }).join('\n');

        var b = new Blob([csv], { type: 'text/csv' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(b);
        link.download = 'reviews.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        showToast('CSV exported successfully!', 'success');
    } catch (err) {
        showToast('Server error while exporting', 'error');
    } finally {
        setButtonLoading(btn, false);
    }
}
  async function clearHistory() {
    var token = localStorage.getItem('fs_token');
    if (!token) { showToast('Please login first!', 'warning'); return; }
    if (!confirm('Clear all history?')) return;
    var btn = el('clearHistory');
    setButtonLoading(btn, true, 'Clearing...');
    try {
        var res = await fetch((window.API_BASE || 'http://localhost:5000') + '/api/reviews', {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) { showToast('Failed to clear history', 'error'); return; }
        renderHistory();
        showToast('History cleared', 'success');
    } catch (err) {
        showToast('Server error', 'error');
    } finally {
        setButtonLoading(btn, false);
    }
}



    // ============================================================
    //  ML SECTION - DETAILED CALCULATIONS VISIBLE
    // ============================================================

    var mlChart = null;

    function clearMLResults() {
        var mlOutput = el('ml-output');
        var mlResultsDiv = el('ml-results');
        if (mlOutput) mlOutput.innerHTML = '';
        if (mlResultsDiv) mlResultsDiv.style.display = 'block';
        if (mlChart) {
            mlChart.destroy();
            mlChart = null;
        }
    }

    function showMLResult(text, isHeading) {
        var mlOutput = el('ml-output');
        var mlResultsDiv = el('ml-results');
        if (!mlOutput || !mlResultsDiv) return;
        mlResultsDiv.style.display = 'block';
        if (isHeading) {
            mlOutput.innerHTML += '<strong style="color:#15803d; font-size:1.1rem; display:block; margin:15px 0 8px;">' + text + '</strong>';
        } else {
            mlOutput.innerHTML += '<span style="line-height:1.8;">' + text + '</span><br>';
        }
        mlOutput.scrollTop = mlOutput.scrollHeight;
    }

    // ============================================================
    // CATEGORY-AWARE DATASET & DYNAMIC FORM SCHEMAS
    // ============================================================
    var CATEGORY_SCHEMAS = {
      "Dairy": {
        csvCategory: "Dairy",
        common: [
          { key: "Temperature_C", label: "Measured Temp (°C)", id: "p_temp", placeholder: "e.g. 4.0", min: -50, max: 150, step: 0.1, icon: "fa-thermometer-half" },
          { key: "Moisture_percent", label: "Measured Moisture (%)", id: "p_moisture", placeholder: "e.g. 85.0", min: 0, max: 100, step: 0.1, icon: "fa-tint" },
          { key: "Storage_Days", label: "Storage Days", id: "p_storage_days", placeholder: "e.g. 3", min: 0, max: 365, step: 1, icon: "fa-calendar-alt" }
        ],
        specific: [
          { key: "pH", label: "Measured pH", id: "p_ph", placeholder: "e.g. 6.6", min: 0, max: 14, step: 0.01, icon: "fa-vial" },
          { key: "Fat_Percent", label: "Fat Percent (%)", id: "p_fat_percent", placeholder: "e.g. 3.5", min: 0, max: 100, step: 0.1, icon: "fa-cheese" },
          { key: "Titratable_Acidity", label: "Titratable Acidity (%)", id: "p_titratable_acidity", placeholder: "e.g. 0.14", min: 0, max: 5, step: 0.01, icon: "fa-flask" }
        ]
      },
      "Meat & Poultry": {
        csvCategory: "Meat_Poultry",
        common: [
          { key: "Temperature_C", label: "Measured Temp (°C)", id: "p_temp", placeholder: "e.g. 2.0", min: -50, max: 150, step: 0.1, icon: "fa-thermometer-half" },
          { key: "Moisture_percent", label: "Measured Moisture (%)", id: "p_moisture", placeholder: "e.g. 72.0", min: 0, max: 100, step: 0.1, icon: "fa-tint" },
          { key: "Storage_Days", label: "Storage Days", id: "p_storage_days", placeholder: "e.g. 2", min: 0, max: 365, step: 1, icon: "fa-calendar-alt" }
        ],
        specific: [
          { key: "pH", label: "Measured pH", id: "p_ph", placeholder: "e.g. 5.7", min: 0, max: 14, step: 0.01, icon: "fa-vial" },
          { key: "Color_Score", label: "Color Score (1-10)", id: "p_color_score", placeholder: "e.g. 8.0", min: 1, max: 10, step: 0.1, icon: "fa-palette" }
        ]
      },
      "Seafood": {
        csvCategory: "Seafood",
        common: [
          { key: "Temperature_C", label: "Measured Temp (°C)", id: "p_temp", placeholder: "e.g. -1.0", min: -50, max: 150, step: 0.1, icon: "fa-thermometer-half" },
          { key: "Moisture_percent", label: "Measured Moisture (%)", id: "p_moisture", placeholder: "e.g. 78.0", min: 0, max: 100, step: 0.1, icon: "fa-tint" },
          { key: "Storage_Days", label: "Storage Days", id: "p_storage_days", placeholder: "e.g. 1", min: 0, max: 365, step: 1, icon: "fa-calendar-alt" }
        ],
        specific: [
          { key: "TVBN_Level", label: "TVBN Level (mg/100g)", id: "p_tvbn_level", placeholder: "e.g. 12.0", min: 0, max: 100, step: 0.1, icon: "fa-fish" }
        ]
      },
      "Fresh Produce": {
        csvCategory: "Fresh_Produce",
        common: [
          { key: "Temperature_C", label: "Measured Temp (°C)", id: "p_temp", placeholder: "e.g. 10.0", min: -50, max: 150, step: 0.1, icon: "fa-thermometer-half" },
          { key: "Moisture_percent", label: "Measured Moisture (%)", id: "p_moisture", placeholder: "e.g. 88.0", min: 0, max: 100, step: 0.1, icon: "fa-tint" },
          { key: "Storage_Days", label: "Storage Days", id: "p_storage_days", placeholder: "e.g. 3", min: 0, max: 365, step: 1, icon: "fa-calendar-alt" }
        ],
        specific: [
          { key: "Ripeness_Index", label: "Ripeness Index (1-10)", id: "p_ripeness_index", placeholder: "e.g. 5.0", min: 1, max: 10, step: 0.1, icon: "fa-apple-alt" }
        ]
      },
      "Beverage": {
        csvCategory: "Beverage",
        common: [
          { key: "Temperature_C", label: "Measured Temp (°C)", id: "p_temp", placeholder: "e.g. 5.0", min: -50, max: 150, step: 0.1, icon: "fa-thermometer-half" },
          { key: "Moisture_percent", label: "Measured Moisture (%)", id: "p_moisture", placeholder: "e.g. 92.0", min: 0, max: 100, step: 0.1, icon: "fa-tint" },
          { key: "Storage_Days", label: "Storage Days", id: "p_storage_days", placeholder: "e.g. 10", min: 0, max: 365, step: 1, icon: "fa-calendar-alt" }
        ],
        specific: [
          { key: "pH", label: "Measured pH", id: "p_ph", placeholder: "e.g. 3.2", min: 0, max: 14, step: 0.01, icon: "fa-vial" },
          { key: "Sugar_Content_Percent", label: "Sugar Content (%)", id: "p_sugar_content", placeholder: "e.g. 11.0", min: 0, max: 100, step: 0.1, icon: "fa-cubes" }
        ]
      },
      "Bakery": {
        csvCategory: "Bakery",
        common: [
          { key: "Temperature_C", label: "Measured Temp (°C)", id: "p_temp", placeholder: "e.g. 20.0", min: -50, max: 150, step: 0.1, icon: "fa-thermometer-half" },
          { key: "Moisture_percent", label: "Measured Moisture (%)", id: "p_moisture", placeholder: "e.g. 20.0", min: 0, max: 100, step: 0.1, icon: "fa-tint" },
          { key: "Storage_Days", label: "Storage Days", id: "p_storage_days", placeholder: "e.g. 2", min: 0, max: 365, step: 1, icon: "fa-calendar-alt" }
        ],
        specific: [
          { key: "Mold_Risk_Index", label: "Mold Risk Index (1-10)", id: "p_mold_risk_index", placeholder: "e.g. 2.0", min: 1, max: 10, step: 0.1, icon: "fa-bread-slice" }
        ]
      },
      "Frozen Food": {
        csvCategory: "Frozen_Food",
        common: [
          { key: "Temperature_C", label: "Measured Temp (°C)", id: "p_temp", placeholder: "e.g. -20.0", min: -50, max: 150, step: 0.1, icon: "fa-thermometer-half" },
          { key: "Moisture_percent", label: "Measured Moisture (%)", id: "p_moisture", placeholder: "e.g. 65.0", min: 0, max: 100, step: 0.1, icon: "fa-tint" },
          { key: "Storage_Days", label: "Storage Days", id: "p_storage_days", placeholder: "e.g. 20", min: 0, max: 365, step: 1, icon: "fa-calendar-alt" }
        ],
        specific: [
          { key: "Temp_Deviation_Neg18", label: "Temp Deviation from -18°C", id: "p_temp_deviation", placeholder: "e.g. 1.0", min: -20, max: 30, step: 0.1, icon: "fa-snowflake" }
        ]
      },
      "Baby Food": {
        csvCategory: "Baby_Food",
        common: [
          { key: "Temperature_C", label: "Measured Temp (°C)", id: "p_temp", placeholder: "e.g. 4.0", min: -50, max: 150, step: 0.1, icon: "fa-thermometer-half" },
          { key: "Moisture_percent", label: "Measured Moisture (%)", id: "p_moisture", placeholder: "e.g. 80.0", min: 0, max: 100, step: 0.1, icon: "fa-tint" },
          { key: "Storage_Days", label: "Storage Days", id: "p_storage_days", placeholder: "e.g. 2", min: 0, max: 365, step: 1, icon: "fa-calendar-alt" }
        ],
        specific: [
          { key: "pH", label: "Measured pH (Stricter)", id: "p_ph", placeholder: "e.g. 6.3", min: 0, max: 14, step: 0.01, icon: "fa-baby" }
        ]
      },
      "Packaged Snack": {
        csvCategory: "Packaged_Snack",
        common: [
          { key: "Temperature_C", label: "Measured Temp (°C)", id: "p_temp", placeholder: "e.g. 24.0", min: -50, max: 150, step: 0.1, icon: "fa-thermometer-half" },
          { key: "Moisture_percent", label: "Measured Moisture (%)", id: "p_moisture", placeholder: "e.g. 3.0", min: 0, max: 100, step: 0.1, icon: "fa-tint" },
          { key: "Storage_Days", label: "Storage Days", id: "p_storage_days", placeholder: "e.g. 30", min: 0, max: 365, step: 1, icon: "fa-calendar-alt" }
        ],
        specific: [
          { key: "Oil_Rancidity_Index", label: "Oil Rancidity Index", id: "p_oil_rancidity_index", placeholder: "e.g. 1.0", min: 0, max: 20, step: 0.1, icon: "fa-cookie" }
        ]
      },
      "Street Food": {
        csvCategory: "Street_Food",
        common: [
          { key: "Temperature_C", label: "Measured Temp (°C)", id: "p_temp", placeholder: "e.g. 5.0", min: -50, max: 150, step: 0.1, icon: "fa-thermometer-half" },
          { key: "Moisture_percent", label: "Measured Moisture (%)", id: "p_moisture", placeholder: "e.g. 60.0", min: 0, max: 100, step: 0.1, icon: "fa-tint" },
          { key: "Storage_Days", label: "Storage Days", id: "p_storage_days", placeholder: "e.g. 0.5", min: 0, max: 365, step: 0.1, icon: "fa-calendar-alt" }
        ],
        specific: [
          { key: "Hygiene_Score", label: "Hygiene Score (1-10)", id: "p_hygiene_score", placeholder: "e.g. 8.5", min: 1, max: 10, step: 0.1, icon: "fa-utensils" }
        ]
      }
    };

    function renderDynamicLabFields(catName) {
      var container = el('labMeasurementsGroup');
      if (!container) return;

      var schema = CATEGORY_SCHEMAS[catName] || CATEGORY_SCHEMAS['Dairy'];
      var html = '';

      // Common fields
      schema.common.forEach(function (f) {
        html += '<div class="col"><div class="form-group">';
        html += '<label class="form-label"><i class="fas ' + f.icon + '"></i> ' + f.label + '</label>';
        html += '<input type="number" step="' + f.step + '" min="' + f.min + '" max="' + f.max + '" class="form-control" id="' + f.id + '" placeholder="' + f.placeholder + '">';
        html += '</div></div>';
      });

      // Category-specific fields
      schema.specific.forEach(function (f) {
        html += '<div class="col"><div class="form-group">';
        html += '<label class="form-label"><i class="fas ' + f.icon + '"></i> ' + f.label + '</label>';
        html += '<input type="number" step="' + f.step + '" min="' + f.min + '" max="' + f.max + '" class="form-control" id="' + f.id + '" placeholder="' + f.placeholder + '">';
        html += '</div></div>';
      });

      container.innerHTML = html;
    }

    // ML functions now loaded from mlAnalysis.js via window.FSML
    var ml = window.FSML.init({
      el: el,
      showToast: showToast,
      setButtonLoading: setButtonLoading,
      clearMLResults: clearMLResults,
      showMLResult: showMLResult,
      CATEGORY_SCHEMAS: CATEGORY_SCHEMAS,
      numVal: numVal,
      getMlChart: function(){ return mlChart; },
      setMlChart: function(v){ mlChart = v; }
    });


    // ============================================================
    //  IMAGE LABEL 
    // ============================================================

    function realImageAnalysis(imageDataUrl) {
        return new Promise(function (resolve) {
            var img = new Image();
            img.onload = function () {
                var canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                var pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                var total = pixels.length / 4;

                var red = 0, green = 0, blue = 0, yellow = 0, orange = 0, brown = 0, cream = 0, white = 0, dark = 0;
                var satSum = 0;

                for (var i = 0; i < pixels.length; i += 4) {
                    var r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
                    var maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
                    var sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
                    satSum += sat;
                    if (r > 240 && g > 240 && b > 240) white++;
                    if ((r + g + b) / 3 < 40) dark++;
                    if (sat > 0.15) {
                        if (r > 150 && r > g * 1.5 && r > b * 1.5) red++;
                        if (g > 100 && g > r * 1.3 && g > b * 1.3) green++;
                        if (b > 120 && b > r * 1.3 && b > g * 1.3) blue++;
                        if (r > 150 && g > 150 && b < 100) yellow++;
                        if (r > 180 && g > 80 && g < 180 && b < 80) orange++;
                        if (r > 80 && r < 180 && g > 30 && g < 120 && b < 80) brown++;
                        if (r > 200 && g > 180 && b > 140 && b < 200) cream++;
                    }
                }

                var p = { red: red / total * 100, green: green / total * 100, blue: blue / total * 100, yellow: yellow / total * 100, orange: orange / total * 100, brown: brown / total * 100, cream: cream / total * 100, white: white / total * 100, dark: dark / total * 100 };

                var scores = {};
                scores['Fresh Produce'] = p.green * 3 + p.yellow * 0.5;
                scores['Dairy'] = p.cream * 4 + p.white * 2 + p.blue * 1.5;
                scores['Meat & Poultry'] = p.red * 4 + p.brown * 2 + p.dark;
                scores['Packaged Snack'] = p.yellow * 3.5 + p.orange * 3 + p.red;
                scores['Beverage'] = p.blue * 3 + p.orange * 2 + p.white * 1.5;
                scores['Bakery'] = p.brown * 4 + p.cream * 2 + p.yellow;
                scores['Frozen Food'] = p.blue * 4 + p.white * 3;
                scores['Baby Food'] = p.cream * 3 + p.white * 2;
                scores['Seafood'] = p.blue * 3 + p.red * 2 + p.brown;
                scores['Street Food'] = p.orange * 3 + p.yellow * 2 + p.red * 1.5;

                var sorted = Object.entries(scores).sort(function (a, b) { return b[1] - a[1]; });
                var topCat = sorted[0][0], secondCat = sorted[1][0];
                var gap = sorted[0][1] - sorted[1][1];
                var confidence = Math.min(Math.max(Math.round((gap / (sorted[0][1] + sorted[1][1])) * 100 + 25), 30), 70);

                var vegScore = p.green + p.yellow + p.cream;
                var nonVegScore = p.red + p.brown + p.dark;
                var veg = Math.abs(vegScore - nonVegScore) < 3 ? "Unclear ⚠️" : (vegScore > nonVegScore ? "Likely Veg 🟢" : "Likely Non-Veg 🔴");

                var colorTotal = p.red + p.green + p.blue + p.yellow + p.orange + p.brown + p.cream;
                var isFood = colorTotal > 30;

                var checks = [];
                if (colorTotal > 30) checks.push("✓ Food colors (" + colorTotal.toFixed(0) + "%)"); else checks.push("✗ Low food colors");
                if (dark > 5 || white > 2) checks.push("✓ Text detected"); else checks.push("⚠️ Little text");
                if (canvas.width > 150) checks.push("✓ Resolution " + canvas.width + "x" + canvas.height); else checks.push("✗ Low resolution");

                resolve({ isFood: isFood, topCat: topCat, secondCat: secondCat, confidence: confidence, veg: veg, checks: checks });
            };
            img.onerror = function () { resolve({ isFood: false, topCat: "Unknown", secondCat: "Unknown", confidence: 0, veg: "Unknown", checks: ["✗ Invalid image"] }); };
            img.src = imageDataUrl;
        });
    }

    async function analyzeLabelWithOCR(imageDataUrl) {
        if (typeof Tesseract === 'undefined') {
            return { text: '', topCat: 'Packaged Snack', confidence: 0, checks: ['OCR library unavailable'] };
        }

        var result = await Tesseract.recognize(imageDataUrl, 'eng');
        var text = (result.data && result.data.text ? result.data.text : '').replace(/\s+/g, ' ').trim();
        var lowerText = text.toLowerCase();
        var categoryRules = [
            { name: 'Dairy', words: ['milk', 'cheese', 'yogurt', 'curd', 'paneer', 'butter', 'ghee', 'dairy'] },
            { name: 'Meat & Poultry', words: ['chicken', 'mutton', 'beef', 'pork', 'meat', 'poultry'] },
            { name: 'Seafood', words: ['fish', 'seafood', 'salmon', 'tuna', 'prawn', 'shrimp'] },
            { name: 'Fresh Produce', words: ['fruit', 'vegetable', 'fresh produce', 'apple', 'mango', 'tomato'] },
            { name: 'Beverage', words: ['juice', 'drink', 'beverage', 'tea', 'coffee', 'cola', 'soda', 'water'] },
            { name: 'Bakery', words: ['bread', 'biscuit', 'cookie', 'cake', 'bakery', 'pastry'] },
            { name: 'Frozen Food', words: ['frozen', 'ice cream', 'pizza'] },
            { name: 'Baby Food', words: ['baby', 'infant', 'formula'] },
            { name: 'Street Food', words: ['street food', 'chaat', 'stall'] },
            { name: 'Packaged Snack', words: ['chips', 'snack', 'namkeen', 'noodles', 'cracker', 'popcorn'] }
        ];

        var matches = categoryRules.map(function (rule) {
            return { name: rule.name, score: rule.words.reduce(function (count, word) {
                return count + (lowerText.indexOf(word) !== -1 ? 1 : 0);
            }, 0) };
        }).sort(function (a, b) { return b.score - a.score; });

        var topCat = matches[0].score ? matches[0].name : 'Packaged Snack';
        var confidence = Math.min(95, Math.max(35, Math.round((result.data && result.data.confidence) || (text ? 55 : 0))));
        var likelyFood = !!text && (matches[0].score > 0 || /ingredients|nutrition|calories|net weight|manufactured|expiry|best before|food/i.test(text));
        var checks = [];
        checks.push(text ? 'OCR text extracted' : 'No readable text found');
        checks.push(likelyFood ? 'Food-label terms detected' : 'Food terms not confirmed');

        return { text: text, topCat: topCat, confidence: confidence, likelyFood: likelyFood, checks: checks };
    }

    async function enrichLabelFromOpenFoodFacts(ocrText) {
        var query = ocrText.split(/\s+/).filter(function (word) {
            return word.length > 2 && !/^(ingredients|nutrition|calories|manufactured|expiry|product|food|best|before)$/i.test(word);
        }).slice(0, 5).join(' ');
        if (!query) return null;
        try {
            var response = await fetch('https://world.openfoodfacts.org/cgi/search.pl?search_terms=' + encodeURIComponent(query) + '&search_simple=1&action=process&json=1&page_size=1');
            if (!response.ok) return null;
            var data = await response.json();
            var product = data.products && data.products[0];
            if (!product || !product.product_name) return null;
            return product;
        } catch (err) {
            console.warn('Open Food Facts label enrichment unavailable', err);
            return null;
        }
    }

    function getLabelProductName(text) {
        var ignored = /^(ingredients|nutrition|nutrition facts|calories|net weight|manufactured|mfd|expiry|exp|best before|food product|serving size|per 100g)$/i;
        var lines = text.split(/\n|(?=ingredients|nutrition|calories|net weight|best before)/i)
            .map(function (line) { return line.replace(/[^a-zA-Z0-9&' -]/g, ' ').replace(/\s+/g, ' ').trim(); })
            .filter(function (line) { return line.length >= 3 && line.length <= 80 && !ignored.test(line); });
        return lines[0] || '';
    }

    function getLabelIngredients(text) {
        var match = text.match(/ingredients?\s*[:\-]?\s*(.*?)(?=nutrition|allergen|contains|net weight|manufactured|best before|expiry|$)/i);
        return match && match[1] ? match[1].trim() : '';
    }

    function getLabelNumber(text, pattern) {
        var match = text.match(pattern);
        return match && match[1] ? match[1].replace(',', '.').trim() : '';
    }

    function fillFormFromLabel(details) {
        if (details.name && el('p_name')) el('p_name').value = details.name;
        if (details.category && el('p_cat')) {
            el('p_cat').value = details.category;
            el('p_cat').dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (details.ingredients && el('p_ing')) el('p_ing').value = details.ingredients;
        if (details.expiry && el('p_exp')) el('p_exp').value = details.expiry;
        if (details.kcal && el('n_kcal')) el('n_kcal').value = details.kcal;
        if (details.sugar && el('n_sugar')) el('n_sugar').value = details.sugar;
        if (details.sodium && el('n_sodium')) el('n_sodium').value = details.sodium;
        if (details.sat && el('n_sat')) el('n_sat').value = details.sat;
        window.lastDataOrigin = details.source || 'Extracted from uploaded product label';
    }


    // ========== IMAGE UPLOAD - EK ALERT, NO HTML ==========
    var labelInput = el('labelImage');
    var previewDiv = el('imagePreview');

    if (labelInput && previewDiv) {
        labelInput.addEventListener('change', function (e) {
            var file = e.target.files[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) { showToast("Please upload an image file (JPG/PNG)", "error"); return; }

            var reader = new FileReader();
            reader.onload = function (ev) {
                var imageDataUrl = ev.target.result;

                
                previewDiv.innerHTML = '<img src="' + imageDataUrl + '" style="max-width:100%; max-height:250px; border-radius:8px; border:2px solid #e5e7eb;">';
                var loadingResult = el('imageResult');
                if (loadingResult) {
                    loadingResult.style.display = 'block';
                    loadingResult.style.background = '#eff6ff';
                    loadingResult.style.border = '2px solid #3b82f6';
                    loadingResult.innerHTML = '<span class="loader"></span> Reading label text and checking Open Food Facts...';
                }

                                analyzeLabelWithOCR(imageDataUrl).then(async function (r) {
                    var imgRes = el('imageResult');
                    var product = r.text ? await enrichLabelFromOpenFoodFacts(r.text) : null;
                    var category = product ? (product.categories || '').toLowerCase() : '';
                    var productName = product && product.product_name ? product.product_name : getLabelProductName(r.text);
                    var detectedCategory = r.topCat;
                    if (category.indexOf('dairy') !== -1 || category.indexOf('milk') !== -1) detectedCategory = 'Dairy';
                    if (category.indexOf('beverage') !== -1 || category.indexOf('drink') !== -1) detectedCategory = 'Beverage';
                    if (category.indexOf('bakery') !== -1 || category.indexOf('bread') !== -1) detectedCategory = 'Bakery';
                    if (category.indexOf('frozen') !== -1) detectedCategory = 'Frozen Food';
                    if (category.indexOf('baby') !== -1) detectedCategory = 'Baby Food';
                    var labelIngredients = (product && (product.ingredients_text || product.ingredients_text_en)) || getLabelIngredients(r.text);
                    var labelNutrition = product && product.nutriments ? product.nutriments : {};
                    var labelDetails = {
                        name: productName,
                        category: detectedCategory && (product || r.likelyFood) ? detectedCategory : '',
                        ingredients: labelIngredients,
                        kcal: labelNutrition['energy-kcal_100g'] || getLabelNumber(r.text, /(?:energy|calories|kcal)[^\d]{0,12}(\d+(?:[.,]\d+)?)/i),
                        sugar: labelNutrition.sugars_100g || getLabelNumber(r.text, /sugars?[^\d]{0,12}(\d+(?:[.,]\d+)?)/i),
                        sodium: labelNutrition.sodium_100g ? labelNutrition.sodium_100g * 1000 : getLabelNumber(r.text, /sodium[^\d]{0,12}(\d+(?:[.,]\d+)?)/i),
                        sat: labelNutrition['saturated-fat_100g'] || getLabelNumber(r.text, /saturated\s+fat[^\d]{0,12}(\d+(?:[.,]\d+)?)/i),
                        source: product ? 'Retrieved from Open Food Facts and uploaded label' : 'Extracted from uploaded product label'
                    };

                    if(imgRes) {
                        imgRes.style.display = 'block';
                        imgRes.style.background = '#f0fdf4';
                        imgRes.style.border = '2px solid #16a34a';
                        if (labelDetails.name || labelDetails.ingredients || product) {
                            imgRes.innerHTML = '<strong style="color:#15803d;">✅ Information detected from label — Please review and edit extracted information before running analysis:</strong>' + (labelDetails.name ? '<br>📦 Product: <strong>' + escapeHtml(labelDetails.name) + '</strong>' : '') + (labelDetails.category ? '<br>🏷️ Category: <strong>' + escapeHtml(labelDetails.category) + '</strong>' : '') + (labelDetails.ingredients ? '<br>📝 Ingredients: ' + escapeHtml(labelDetails.ingredients) : '') + (product ? '<br>🌐 Additional information matched with Open Food Facts' : '') + '<br><small style="color:#4b5563;">You can make corrections in the form below before performing safety checks.</small>';
                        } else {
                            imgRes.style.background = '#fffbeb';
                            imgRes.style.borderColor = '#d97706';
                            imgRes.innerHTML = '<strong style="color:#b45309;">⚠️ Text could not be read from this image</strong><br><small>No dummy product information was added. Upload a clear, front-facing label photo with visible product text.</small>';
                        }
                    }

                    fillFormFromLabel(labelDetails);
                    var range = tempRanges[detectedCategory];
                    if (range) { if (el('t_min')) el('t_min').value = range[0]; if (el('t_max')) el('t_max').value = range[1]; }
                    if (el('p_name') && !labelDetails.name) el('p_name').focus();

                }).catch(function (err) {
                    console.error('Label OCR failed', err);
                    var imgRes = el('imageResult');
                    if (imgRes) {
                        imgRes.style.display = 'block';
                        imgRes.style.background = '#f0fdf4';
                        imgRes.style.border = '2px solid #16a34a';
                        imgRes.innerHTML = '<strong style="color:#b45309;">⚠️ Text could not be read from this image</strong><br><small>No dummy product information was added. Upload a clear, front-facing label photo with visible product text.</small>';
                    }
                });
            };
            reader.readAsDataURL(file);
        });
    }
// ============================================================
//  BARCODE SCANNER - Camera + Upload + Manual + API
// ============================================================

var cameraRunning = false;

// --- Open Food Facts API Fetch ---
function fetchProductFromAPI(barcode) {
    var resultDiv = el('barcodeResult');
    if (!resultDiv) return;
    
    resultDiv.style.display = 'block';
  resultDiv.innerHTML = '<div style="padding:15px; text-align:center;"><span class="loader"></span> Searching barcode <strong>' + barcode + '</strong> in Open Food Facts database...</div>';
    
    // Open Food Facts API - FREE, no key needed
    var url = 'https://world.openfoodfacts.org/api/v0/product/' + barcode + '.json';
    
    return fetch(url)
        .then(function (response) {
            if (!response.ok) throw new Error('API Error: ' + response.status);
            return response.json();
        })
        .then(function (data) {
            console.log("📦 API Response:", data);
            
            if (data.status === 0 || !data.product) {
                resultDiv.innerHTML = '<div style="padding:15px; background:#fef2f2; border:2px solid #dc2626; border-radius:8px; color:#b91c1c; text-align:center;"><strong>âŒ Product Not Found</strong><br><small>Barcode ' + barcode + ' not in database. Try another or enter manually.</small></div>';
                return;
            }
            
            var p = data.product;
            var name = p.product_name || p.product_name_en || 'Unknown Product';
            var brand = p.brands || 'Unknown Brand';
            var category = p.categories || '';
            var ingredients = p.ingredients_text || p.ingredients_text_en || '';
            var allergens = p.allergens || '';
            var additives = p.additives || '';
            var image = p.image_front_small_url || p.image_front_url || '';
            var countries = p.countries || '';
            
            // Extract nutrition
            var nutriments = p.nutriments || {};
            var kcal = nutriments['energy-kcal_100g'] || nutriments['energy-kcal'] || '';
            var sugar = nutriments.sugars_100g || '';
            var sodium = nutriments.sodium_100g || '';
            var sat = nutriments['saturated-fat_100g'] || nutriments['saturated-fat'] || '';
            var trans = nutriments['trans-fat_100g'] || '';
            var fat = nutriments.fat_100g || '';
            var protein = nutriments.proteins_100g || '';
            var carbs = nutriments.carbohydrates_100g || '';
            
            // Determine category for our form
            var ourCategory = 'Packaged Snack'; // default
            var catLower = (category + ' ' + name + ' ' + ingredients).toLowerCase();
            
            if (catLower.includes('dairy') || catLower.includes('milk') || catLower.includes('cheese') || catLower.includes('yogurt') || catLower.includes('butter') || catLower.includes('cream') || catLower.includes('paneer') || catLower.includes('ghee')) {
                ourCategory = 'Dairy';
            } else if (catLower.includes('meat') || catLower.includes('chicken') || catLower.includes('poultry') || catLower.includes('mutton') || catLower.includes('beef') || catLower.includes('pork')) {
                ourCategory = 'Meat & Poultry';
            } else if (catLower.includes('fish') || catLower.includes('seafood') || catLower.includes('shrimp') || catLower.includes('salmon') || catLower.includes('tuna')) {
                ourCategory = 'Seafood';
            } else if (catLower.includes('beverage') || catLower.includes('drink') || catLower.includes('juice') || catLower.includes('tea') || catLower.includes('coffee') || catLower.includes('water') || catLower.includes('cola') || catLower.includes('soda')) {
                ourCategory = 'Beverage';
            } else if (catLower.includes('bread') || catLower.includes('bakery') || catLower.includes('cake') || catLower.includes('biscuit') || catLower.includes('cookie') || catLower.includes('pastry')) {
                ourCategory = 'Bakery';
            } else if (catLower.includes('frozen') || catLower.includes('ice cream') || catLower.includes('pizza')) {
                ourCategory = 'Frozen Food';
            } else if (catLower.includes('baby') || catLower.includes('infant')) {
                ourCategory = 'Baby Food';
            } else if (catLower.includes('snack') || catLower.includes('chips') || catLower.includes('namkeen') || catLower.includes('noodle') || catLower.includes('instant')) {
                ourCategory = 'Packaged Snack';
            } else if (catLower.includes('fruit') || catLower.includes('vegetable') || catLower.includes('organic') || catLower.includes('fresh')) {
                ourCategory = 'Fresh Produce';
            }
            
            // Determine origin
            var origin = 'India';
            if (countries) {
                var cLower = countries.toLowerCase();
                if (cLower.includes('india')) origin = 'India';
                else if (cLower.includes('france') || cLower.includes('germany') || cLower.includes('usa') || cLower.includes('uk') || cLower.includes('japan') || cLower.includes('china')) {
                    origin = 'Imported';
                } else {
                    origin = 'Imported';
                }
            }
            
            // FSSAI - check if available
            var fssai = '';
            if (p.allergens_tags && p.allergens_tags.length) {
                // Open Food Facts doesn't have FSSAI, generate mock
                fssai = '';
            }
            
            // Expiry - check if available in API
            var expDateFormatted = 'Data unavailable';
            if (p.expiration_date) {
                expDateFormatted = p.expiration_date;
            }
            
            // ===== BUILD RESULT DISPLAY =====
            var html = '';
            html += '<div style="padding:20px; background:linear-gradient(135deg, #f0fdf4, #dcfce7); border:2px solid #16a34a; border-radius:12px;">';
            html += '<div style="display:flex; gap:15px; flex-wrap:wrap; align-items:flex-start;">';
            
            // Product image
            if (image) {
                html += '<img src="' + image + '" style="width:120px; height:120px; object-fit:contain; border-radius:8px; border:2px solid #e5e7eb; background:white;" onerror="this.style.display=\'none\'">';
            }
            
            // Product info
            html += '<div style="flex:1; min-width:250px;">';
            html += '<div style="font-size:1.3rem; font-weight:700; color:#15803d;">' + escapeHtml(name) + '</div>';
            html += '<div style="font-size:0.9rem; color:#374151; margin-top:4px;">Brand: ' + escapeHtml(brand) + '</div>';
            html += '<div style="font-size:0.85rem; color:#6b7280; margin-top:2px;">Category: ' + escapeHtml(ourCategory) + '</div>';
            html += '<div style="font-size:0.85rem; color:#6b7280;">Barcode: ' + barcode + '</div>';
            html += '<div style="font-size:0.85rem; color:#6b7280;">Expiry Date: ' + (expDateFormatted !== 'Data unavailable' ? escapeHtml(expDateFormatted) : '<span style="color:#dc2626;">Data unavailable</span>') + '</div>';
            html += '<div style="font-size:0.85rem; color:#6b7280;">FSSAI License: <span style="color:#dc2626;">Data unavailable (Not in Open Food Facts)</span></div>';
            html += '</div>';
            html += '</div>';
            
            // Nutrition table
            html += '<div style="margin-top:15px; background:white; border-radius:8px; padding:12px; border:1px solid #e5e7eb;">';
            html += '<div style="font-weight:600; color:#374151; margin-bottom:8px;">📊 Nutrition (per 100g):</div>';
            html += '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:6px; font-size:0.85rem;">';
            
            html += '<div>🔥 Energy: <strong>' + (kcal ? kcal + ' kcal' : 'Data unavailable') + '</strong></div>';
            html += '<div>🧈 Fat: <strong>' + (fat ? fat + ' g' : 'Data unavailable') + '</strong></div>';
            html += '<div>⛔ Sat Fat: <strong>' + (sat ? sat + ' g' : 'Data unavailable') + '</strong></div>';
            html += '<div>⚠️ Trans Fat: <strong>' + (trans ? trans + ' g' : 'Data unavailable') + '</strong></div>';
            html += '<div>🍞 Carbs: <strong>' + (carbs ? carbs + ' g' : 'Data unavailable') + '</strong></div>';
            html += '<div>🍬 Sugar: <strong>' + (sugar ? sugar + ' g' : 'Data unavailable') + '</strong></div>';
            html += '<div>💪 Protein: <strong>' + (protein ? protein + ' g' : 'Data unavailable') + '</strong></div>';
            html += '<div>🧂 Sodium: <strong>' + (sodium ? sodium + ' g' : 'Data unavailable') + '</strong></div>';
            
            html += '</div></div>';
            
            // Ingredients & Allergens
            html += '<div style="margin-top:10px; background:white; border-radius:8px; padding:12px; border:1px solid #e5e7eb;">';
            html += '<div style="font-weight:600; color:#374151; margin-bottom:4px;">📝 Ingredients:</div>';
            html += '<div style="font-size:0.8rem; color:#4b5563; max-height:60px; overflow-y:auto;">' + (ingredients ? escapeHtml(ingredients) : '<span style="color:#dc2626;">Data unavailable</span>') + '</div>';
            html += '</div>';
            
            if (allergens) {
                html += '<div style="margin-top:8px; padding:8px 12px; background:#fef2f2; border-radius:6px; font-size:0.85rem; color:#b91c1c;">';
                html += '⚠️ Allergens: ' + escapeHtml(allergens.replace(/,/g, ', '));
                html += '</div>';
            }
            
            if (additives) {
                html += '<div style="margin-top:6px; padding:8px 12px; background:#fffbeb; border-radius:6px; font-size:0.85rem; color:#92400e;">';
                html += '🧪 Additives: ' + escapeHtml(additives.replace(/,/g, ', '));
                html += '</div>';
            }
            
            // Barcode safety notice
            html += '<div style="margin-top:12px; padding:10px 14px; background:#eff6ff; border-radius:6px; font-size:0.8rem; color:#1e40af; border-left:3px solid #3b82f6;">';
            html += '<i class="fas fa-info-circle"></i> <strong>Note:</strong> Barcode scanning identifies the product and retrieves available product information. It does not verify laboratory safety.';
            html += '</div>';

            // Auto-fill button
            html += '<div style="margin-top:15px; text-align:center;">';
            html += '<button id="autoFillBarcodeBtn" type="button" class="btn" style="background:#16a34a; color:white; padding:12px 30px; font-size:1rem; border-radius:8px; border:none; cursor:pointer;">';
            html += '<i class="fas fa-magic"></i> Auto-Fill Form with This Data</button>';
            html += '</div>';
            
            // Data source
            html += '<div style="margin-top:10px; text-align:center; font-size:0.75rem; color:#6b7280; font-weight:600;">';
            html += 'Data Source: Open Food Facts (openfoodfacts.org) — Open Database';
            html += '</div>';
            
            html += '</div>';
            
            resultDiv.innerHTML = html;

            // Store product data securely in a global object
            window.lastBarcodeProduct = {
                name: name,
                category: ourCategory,
                ingredients: ingredients,
                origin: origin,
                kcal: kcal || 0,
                sugar: sugar || 0,
                sodium: (sodium ? sodium * 1000 : 0),
                sat: sat || 0,
                trans: trans || 0,
                expDate: (expDateFormatted !== 'Data unavailable' ? expDateFormatted : '')
            };

            // Attach robust click listener without inline HTML string arguments
            var autoFillBtn = el('autoFillBarcodeBtn');
            if (autoFillBtn) {
                autoFillBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    if (window.lastBarcodeProduct) {
                        window.autoFillFromBarcode(window.lastBarcodeProduct);
                    }
                });
            }
            return data;
        })
        .catch(function (err) {
            console.error("API Error:", err);
            resultDiv.innerHTML = '<div style="padding:15px; background:#fffbeb; border:2px solid #f59e0b; border-radius:8px; color:#92400e; text-align:center;"><strong>⚠️ Product information could not be retrieved from the barcode database.</strong><br><small>You can enter the product details manually below or upload a product label photo.</small></div>';
        });
}


// --- Unified Auto-fill form from barcode data ---
// Accepts either an object (e.g. window.lastBarcodeProduct) or individual parameters
window.autoFillFromBarcode = function(pData, category, ingredients, origin, kcal, sugar, sodium, sat, trans, expDate) {
    var data = (pData && typeof pData === 'object') ? pData : {
        name: pData,
        category: category,
        ingredients: ingredients,
        origin: origin,
        kcal: kcal,
        sugar: sugar,
        sodium: sodium,
        sat: sat,
        trans: trans,
        expDate: expDate
    };

    window.lastDataOrigin = 'Retrieved from Open Food Facts API';

    if (el('p_name')) el('p_name').value = data.name || '';
    if (el('p_cat')) el('p_cat').value = data.category || 'Packaged Snack';
    if (el('p_ing')) el('p_ing').value = data.ingredients || '';
    if (el('p_origin')) el('p_origin').value = data.origin || 'India';

    if (el('p_exp')) {
        var formattedDate = '';
        var exp = data.expDate;
        if (exp) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(exp)) {
                formattedDate = exp;
            } else {
                var parsedDate = new Date(exp);
                if (!isNaN(parsedDate.getTime())) {
                    formattedDate = parsedDate.toISOString().split('T')[0];
                } else {
                    formattedDate = exp;
                }
            }
        }
        el('p_exp').value = formattedDate;
    }
    
    if (data.kcal && el('n_kcal')) el('n_kcal').value = Math.round(data.kcal);
    if (data.sugar && el('n_sugar')) el('n_sugar').value = parseFloat(data.sugar).toFixed(1);
    if (data.sodium && el('n_sodium')) el('n_sodium').value = Math.round(data.sodium);
    if (data.sat && el('n_sat')) el('n_sat').value = parseFloat(data.sat).toFixed(1);
    if (data.trans && el('n_trans')) el('n_trans').value = parseFloat(data.trans).toFixed(1);
    
    // Check missing fields for explicit warning
    var missing = [];
    if (!data.expDate) missing.push('Expiry Date');
    if (!data.ingredients) missing.push('Ingredients List');
    if (!data.sugar && !data.sodium) missing.push('Nutrition Details');

    var barcodeStepBanner = el('barcodeStepBanner');
    if (!barcodeStepBanner) {
        barcodeStepBanner = document.createElement('div');
        barcodeStepBanner.id = 'barcodeStepBanner';
        var form = el('analyzerForm');
        if (form && form.parentNode) form.parentNode.insertBefore(barcodeStepBanner, form);
    }
    
    var stepHtml = '<div style="margin-bottom:20px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:16px;">';
    stepHtml += '<h4 style="color:#15803d; font-size:0.95rem; margin-bottom:10px;"><i class="fas fa-barcode"></i> Barcode Retrieval Flow Status</h4>';
    stepHtml += '<div style="display:flex; flex-wrap:wrap; gap:8px; font-size:0.82rem; margin-bottom:10px;">';
    stepHtml += '<span class="badge" style="background:#dcfce7; color:#15803d;">✓ STEP 1: Product Found</span>';
    stepHtml += '<span class="badge" style="background:#dcfce7; color:#15803d;">✓ STEP 2: Details Loaded</span>';
    stepHtml += '<span class="badge" style="background:#dcfce7; color:#15803d;">✓ STEP 3: Form Updated</span>';
    stepHtml += '<span class="badge" style="background:#e0f2fe; color:#0369a1;">STEP 4: Ready for Safety Check</span>';
    stepHtml += '<span class="badge" style="background:' + (missing.length ? '#fef3c7' : '#dcfce7') + '; color:' + (missing.length ? '#92400e' : '#15803d') + ';">STEP 5: ' + (missing.length ? 'Missing Info Identified' : 'Info Complete') + '</span>';
    stepHtml += '<span class="badge" style="background:#faf5ff; color:#6d28d9;">STEP 6: Lab Parameters Mapped</span>';
    stepHtml += '</div>';
    
    if (missing.length > 0) {
        stepHtml += '<div style="font-size:0.85rem; color:#92400e; background:#fffbeb; padding:10px; border-radius:6px; border-left:4px solid #f59e0b;">';
        stepHtml += '⚠️ <strong>Some product information was unavailable in the Open Food Facts database</strong> (' + escapeHtml(missing.join(', ')) + '). Missing data is not treated as proof of safety. Please fill in missing details before running screening.';
        stepHtml += '</div>';
    } else {
        stepHtml += '<div style="font-size:0.85rem; color:#15803d; background:#ffffff; padding:8px 12px; border-radius:6px;">';
        stepHtml += '✅ Available product metadata loaded successfully. Click "Run Safety Checks" below to perform consumer screening.';
        stepHtml += '</div>';
    }
    stepHtml += '</div>';
    barcodeStepBanner.innerHTML = stepHtml;
    barcodeStepBanner.style.display = 'block';

    // Set temperature range
    if (typeof tempRanges !== 'undefined' && tempRanges[data.category]) {
        var range = tempRanges[data.category];
        if (el('t_min')) el('t_min').value = range[0];
        if (el('t_max')) el('t_max').value = range[1];
    }
    
    if (el('fssai')) el('fssai').value = '';
    if (el('barcodeResult')) el('barcodeResult').style.display = 'none';
    
    // In Consumer Mode, trigger proxy questionnaire for detected category directly
    if (window.currentMode === 'consumer') {
        var resCard = el('consumerResultCard');
        if (resCard) resCard.style.display = 'none';
        if (typeof renderDynamicQuestions === 'function') {
            renderDynamicQuestions(data.category);
        }
    }

    // Scroll to the form
    var targetEl = el('analyzerForm') || el('p_name');
    if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Show success toast
    if (typeof showToast === 'function') {
        showToast('Form auto-filled with product data (' + (data.name || 'Product') + ')!', 'success');
    }
};

// --- CAMERA SCANNING ---
function startCameraScan() {
    if (cameraRunning) return;
    
    var container = el('cameraContainer');
    var view = el('cameraView');
    if (!container || !view) return;
    
    container.style.display = 'block';
    
    Quagga.init({
        inputStream: {
            name: "Live",
            type: "LiveStream",
            target: view,
            constraints: {
                facingMode: "environment",
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        },
        decoder: {
            readers: [
                "ean_reader",       // EAN-13 (most common on food)
                "ean_8_reader",     // EAN-8
                "upc_reader",       // UPC-A
                "upc_e_reader",     // UPC-E
                "code_128_reader",  // Code 128
                "code_39_reader"    // Code 39
            ],
            multiple: false
        },
        locate: true,
        frequency: 10
    }, function(err) {
        if (err) {
            console.error("Camera Error:", err);
            container.style.display = 'none';
            
            // Fallback message
            var resultDiv = el('barcodeResult');
            if (resultDiv) {
                resultDiv.style.display = 'block';
                resultDiv.innerHTML = '<div style="padding:15px; background:#fffbeb; border:2px solid #f59e0b; border-radius:8px; color:#92400e; text-align:center;"><strong>📷 Camera not available</strong><br><small>Error: ' + err.message + '</small><br><br><strong>Alternatives:</strong><br>• Upload barcode image<br>• Type barcode number manually</div>';
            }
            return;
        }
        
        cameraRunning = true;
        Quagga.start();
    });
    
    // When barcode detected
    Quagga.onDetected(function(result) {
        if (result.codeResult && result.codeResult.code) {
            var barcode = result.codeResult.code;
            
            // Stop camera
            stopCameraScan();
            
            // Show what we found
            var resultDiv = el('barcodeResult');
            if (resultDiv) {
                resultDiv.style.display = 'block';
                resultDiv.innerHTML = '<div style="padding:15px; background:#dbeafe; border-radius:8px; text-align:center;">✅ Barcode Detected: <strong style="font-size:1.2rem; color:#1e40af;">' + barcode + '</strong><br>Format: ' + result.codeResult.format + '</div>';
            }
            
            // Fetch product data
            setTimeout(function() {
                fetchProductFromAPI(barcode);
            }, 500);
        }
    });
}

function stopCameraScan() {
    if (!cameraRunning) return;
    Quagga.stop();
    cameraRunning = false;
    
    var container = el('cameraContainer');
    if (container) container.style.display = 'none';
}


// --- IMAGE FILE BARCODE SCAN ---
function scanBarcodeFromFile(file) {
    if (!file) return;
    
    var resultDiv = el('barcodeResult');
    if (resultDiv) {
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<div style="padding:15px; background:#dbeafe; border-radius:8px; text-align:center;"><i class="fas fa-spinner fa-spin"></i> Scanning barcode from image...</div>';
    }
    
    var reader = new FileReader();
    reader.onload = function(ev) {
        var imageDataUrl = ev.target.result;
        
        Quagga.decodeSingle({
            decoder: {
                readers: ["ean_reader", "ean_8_reader", "upc_reader", "upc_e_reader", "code_128_reader", "code_39_reader"]
            },
            locate: true,
            src: imageDataUrl
        }, function(result) {
            if (result && result.codeResult && result.codeResult.code) {
                var barcode = result.codeResult.code;
                
                if (resultDiv) {
                    resultDiv.innerHTML = '<div style="padding:15px; background:#dbeafe; border-radius:8px; text-align:center;">✅ Barcode Found: <strong style="font-size:1.2rem; color:#1e40af;">' + barcode + '</strong><br>Format: ' + result.codeResult.format + '</div>';
                }
                
                setTimeout(function() {
                    fetchProductFromAPI(barcode);
                }, 500);
            } else {
                if (resultDiv) {
                    resultDiv.innerHTML = '<div style="padding:15px; background:#fef2f2; border:2px solid #dc2626; border-radius:8px; color:#b91c1c; text-align:center;"><strong>âŒ No Barcode Found</strong><br><small>Make sure the barcode is clear and centered in the image.</small><br><br>Supported: EAN-13, EAN-8, UPC-A, UPC-E, Code-128, Code-39</div>';
                }
            }
        }, function(err) {
            console.error("Scan Error:", err);
            if (resultDiv) {
                resultDiv.innerHTML = '<div style="padding:15px; background:#fef2f2; border:2px solid #dc2626; border-radius:8px; color:#b91c1c; text-align:center;"><strong>âŒ Scan Failed</strong><br><small>' + (err.message || 'Could not read barcode from image') + '</small></div>';
            }
        });
    };
    reader.readAsDataURL(file);
}


// --- BARCODE EVENT LISTENERS ---
if (el('startCameraBtn')) {
    el('startCameraBtn').addEventListener('click', startCameraScan);
}

if (el('stopCameraBtn')) {
    el('stopCameraBtn').addEventListener('click', stopCameraScan);
}

if (el('barcodeFileInput')) {
    el('barcodeFileInput').addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (file) scanBarcodeFromFile(file);
        // Reset so same file can be scanned again
        this.value = '';
    });
}

if (el('lookupBarcodeBtn')) {
    el('lookupBarcodeBtn').addEventListener('click', async function() {
        var barcode = el('manualBarcode') ? el('manualBarcode').value.trim() : '';
        if (!barcode) {
            showToast("Please enter a barcode number", "warning");
            return;
        }
        // Validate - should be 8, 12, or 13 digits
        if (!/^\d{8,14}$/.test(barcode)) {
            showToast("Invalid barcode format. Expected 8-14 digits (EAN-8, EAN-13, UPC-A)", "error");
            return;
        }
        var btn = el('lookupBarcodeBtn');
        setButtonLoading(btn, true, 'Looking up...');
        try {
            await fetchProductFromAPI(barcode);
        } catch (err) {
            console.error('Barcode lookup error:', err);
        } finally {
            setButtonLoading(btn, false);
        }
    });
}

// Allow Enter key to trigger lookup
if (el('manualBarcode')) {
    el('manualBarcode').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            if (el('lookupBarcodeBtn')) el('lookupBarcodeBtn').click();
        }
    });
}

// Stop camera when page is hidden (battery save)
document.addEventListener('visibilitychange', function() {
    if (document.hidden && cameraRunning) {
        stopCameraScan();
    }
});

// ==========================================
// CSV BATCH ANALYSIS & PROCESSING (ML k-NN)
// ==========================================

function parseCSVFile(text) {
    var rawLines = text.split(/\r?\n/).map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });
    if (rawLines.length === 0) return { headers: [], rows: [] };

    function parseLine(line) {
        var res = [];
        var cur = '';
        var inQuotes = false;
        for (var i = 0; i < line.length; i++) {
            var ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch === ',' && !inQuotes) {
                res.push(cur.trim());
                cur = '';
            } else {
                cur += ch;
            }
        }
        res.push(cur.trim());
        return res;
    }

    var headerRow = parseLine(rawLines[0]).map(function(h) { return h.replace(/^["']|["']$/g, '').trim(); });
    var rows = [];

    for (var i = 1; i < rawLines.length; i++) {
        var cols = parseLine(rawLines[i]);
        if (cols.length === 0 || (cols.length === 1 && !cols[0])) continue;
        var rowObj = {};
        for (var j = 0; j < headerRow.length; j++) {
            var h = headerRow[j];
            rowObj[h] = (cols[j] !== undefined ? cols[j].replace(/^["']|["']$/g, '').trim() : '');
        }
        rows.push(rowObj);
    }

    return { headers: headerRow, rows: rows };
}

// 1. CSV File Processor (Triggered on file upload or button click)
async function processCSV(file, callback) {
    if (!file) {
        if (typeof callback === 'function') callback();
        return;
    }

    var outDiv = el('csv-batch-results');
    if (outDiv) {
        outDiv.innerHTML = '<div style="padding:15px; background:#f8fafc; border-radius:8px; border:1px solid var(--border); color:var(--text-dark);">' +
            '<i class="fas fa-spinner fa-spin" style="margin-right:8px; color:var(--primary);"></i> Sending batch to ML service for prediction using the trained model...' +
            '</div>';
    }

    var reader = new FileReader();
    reader.onload = async function (e) {
        try {
            var text = e.target.result;
            var parsed = parseCSVFile(text);
            var rows = parsed.rows;

            if (rows.length < 1) {
                if (outDiv) {
                    outDiv.innerHTML = '<div style="color:#dc2626; padding:12px; background:#fef2f2; border:1px solid #fecaca; border-radius:8px;">❌ CSV file is empty or has only headers.</div>';
                }
                showToast('CSV file contains no data rows', 'warning');
                return;
            }

            if (rows.length > 500) {
                if (outDiv) {
                    outDiv.innerHTML = '<div style="color:#dc2626; padding:12px; background:#fef2f2; border:1px solid #fecaca; border-radius:8px;">❌ CSV batch exceeds maximum limit of 500 rows.</div>';
                }
                showToast('Batch exceeds maximum limit of 500 rows', 'error');
                return;
            }

            // Determine category:
            // 1. From CSV row's Category/category column if present and non-empty
            // 2. Fallback to UI selection (p_cat, mlCategorySelect, etc.)
            var detectedCategory = null;
            for (var r = 0; r < rows.length; r++) {
                var rowCat = rows[r].Category || rows[r].category || rows[r].cat || rows[r].Food_Category;
                if (rowCat && String(rowCat).trim()) {
                    detectedCategory = String(rowCat).trim();
                    break;
                }
            }

            var uiCat = (el('p_cat') && el('p_cat').value) ||
                        (el('mlCategorySelect') && el('mlCategorySelect').value) ||
                        'Dairy';

            var finalCategory = detectedCategory || uiCat;

            showToast("Sending " + rows.length + " rows (" + finalCategory + ") for ML prediction...", "info");

            var apiBase = window.API_BASE || 'http://localhost:5000';
            var response = await fetch(apiBase + '/api/ml/predict-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    category: finalCategory,
                    rows: rows
                })
            });

            if (!response.ok) {
                var errJson = await response.json().catch(function() { return {}; });
                var errMsg = errJson.message || response.statusText || 'Server error';
                if (response.status === 503) {
                    errMsg = 'ML Service is currently offline. Please ensure Python service (port 8000) and Node server are running.';
                }
                if (outDiv) {
                    outDiv.innerHTML = '<div style="color:#dc2626; padding:16px; background:#fef2f2; border:1px solid #fecaca; border-radius:8px;">' +
                        '<h4>❌ Batch Prediction Request Failed (' + response.status + ')</h4>' +
                        '<p style="margin:6px 0 0; font-size:0.9rem;">' + escapeHtml(errMsg) + '</p>' +
                        '</div>';
                }
                showToast('Batch prediction failed: ' + errMsg, 'error');
                return;
            }

            var resultData = await response.json();
            showCSVBatchAnalysis(resultData, file.name);
            showToast("Batch prediction completed successfully!", "success");

        } catch (err) {
            console.error('Error processing CSV batch:', err);
            if (outDiv) {
                outDiv.innerHTML = '<div style="color:#dc2626; padding:16px; background:#fef2f2; border:1px solid #fecaca; border-radius:8px;">' +
                    '<h4>❌ Error processing batch</h4>' +
                    '<p style="margin:6px 0 0; font-size:0.9rem;">' + escapeHtml(err.message || 'Network error or service unreachable') + '</p>' +
                    '</div>';
            }
            showToast('Error processing CSV batch', 'error');
        } finally {
            if (typeof callback === 'function') callback();
        }
    };

    reader.onerror = function () {
        showToast('Error reading CSV file', 'error');
        if (typeof callback === 'function') callback();
    };
    reader.readAsText(file);
}

// 2. Batch Analysis Presentation (Renders KPIs, Confidence, Table, and CSV Export)
function showCSVBatchAnalysis(data, filename) {
    var outDiv = el('csv-batch-results');
    if (!outDiv) return;

    var total = data.total || (data.results ? data.results.length : 0);
    var safeCount = data.safe_count || 0;
    var unsafeCount = data.unsafe_count || 0;
    var errorCount = data.error_count || 0;
    var avgConfidence = (data.avg_confidence !== undefined && data.avg_confidence !== null)
        ? (Number(data.avg_confidence) * 100).toFixed(1) + '%'
        : 'N/A';
    var cat = data.category || 'Food';
    var kVal = data.k || 5;
    var trainedOn = data.trained_on || 0;
    var results = data.results || [];

    var html = '';

    // Card Container
    html += '<div style="background:#fff; padding:20px; border-radius:12px; box-shadow:var(--shadow); margin-top:20px; border:1px solid var(--border);">';

    // Header & Download Button
    html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px;">';
    html += '<div>';
    html += '<h3 style="margin:0; color:var(--text-dark); display:flex; align-items:center; gap:8px;"><i class="fas fa-layer-group" style="color:var(--primary);"></i> Batch ML Safety Prediction Report</h3>';
    html += '<small style="color:var(--text-light); font-size:0.85rem;">Category: <strong>' + escapeHtml(cat) + '</strong> | Model: k-NN (k=' + kVal + ', trained on ' + trainedOn + ' samples)</small>';
    html += '</div>';
    html += '<button id="btn-download-batch" class="btn btn-primary" style="padding:8px 16px; font-size:0.9rem;"><i class="fas fa-download"></i> Export Results CSV</button>';
    html += '</div>';

    // IMPORTANT Honesty Rule Disclaimer Box
    html += '<div style="margin:12px 0 16px; font-size:0.85rem; color:#0369a1; background:#f0f9ff; padding:12px 14px; border-radius:8px; border-left:4px solid #0284c7; line-height:1.45;">';
    html += '<strong>📌 Prediction using the trained model:</strong> Predictions come from a model trained on the synthetic dataset. ';
    html += 'Uploaded batch rows have no ground-truth laboratory labels; therefore, model confidence is presented (not accuracy). ';
    html += 'This inference report is for decision support and does not replace official laboratory certification.';
    html += '</div>';

    // Summary KPIs (Total, Safe, Unsafe, Errors, Confidence) - NO ACCURACY!
    html += '<div class="kpi-grid" style="grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); margin-bottom:20px;">';
    html += '<div class="kpi-card"><div class="kpi-title">Total Rows</div><div class="kpi-value">' + total + '</div></div>';
    html += '<div class="kpi-card" style="border-color:#16a34a;"><div class="kpi-title">Safe (Low Risk)</div><div class="kpi-value" style="color:#16a34a;">' + safeCount + '</div></div>';
    html += '<div class="kpi-card" style="border-color:#dc2626;"><div class="kpi-title">Unsafe (High Risk)</div><div class="kpi-value" style="color:#dc2626;">' + unsafeCount + '</div></div>';
    html += '<div class="kpi-card" style="border-color:#f59e0b;"><div class="kpi-title">Rows with Errors</div><div class="kpi-value" style="color:#f59e0b;">' + errorCount + '</div></div>';
    html += '<div class="kpi-card" style="border-color:#0284c7;"><div class="kpi-title">Avg Confidence</div><div class="kpi-value" style="color:#0284c7;">' + avgConfidence + '</div></div>';
    html += '</div>';

    // Results Table
    html += '<div style="border:1px solid var(--border); border-radius:8px; overflow:hidden;">';
    html += '<div style="overflow-x:auto;"><table class="table" style="font-size:0.88rem; width:100%; border-collapse:collapse; margin:0;">';
    html += '<thead><tr style="background:#f8fafc; border-bottom:1px solid var(--border);">';
    html += '<th style="padding:10px 12px; text-align:left;">#</th>';
    html += '<th style="padding:10px 12px; text-align:left;">Sample / Product Name</th>';
    html += '<th style="padding:10px 12px; text-align:center;">Verdict</th>';
    html += '<th style="padding:10px 12px; text-align:center;">Confidence</th>';
    html += '<th style="padding:10px 12px; text-align:center;">Nearest Neighbor Distance</th>';
    html += '<th style="padding:10px 12px; text-align:left;">Status & Diagnostics</th>';
    html += '</tr></thead><tbody>';

    for (var i = 0; i < results.length; i++) {
        var item = results[i];
        var isOk = item.status === 'ok';
        var isSafe = item.verdict === 'SAFE';

        var verdictBadge = '';
        if (isOk) {
            verdictBadge = isSafe
                ? '<span class="badge badge-safe" style="background:#dcfce7; color:#15803d; padding:4px 8px; border-radius:4px; font-weight:600;"><i class="fas fa-check-circle"></i> SAFE</span>'
                : '<span class="badge badge-risk" style="background:#fee2e2; color:#b91c1c; padding:4px 8px; border-radius:4px; font-weight:600;"><i class="fas fa-exclamation-triangle"></i> UNSAFE</span>';
        } else {
            verdictBadge = '<span class="badge badge-warn" style="background:#fef3c7; color:#b45309; padding:4px 8px; border-radius:4px; font-weight:600;"><i class="fas fa-times-circle"></i> ERROR</span>';
        }

        var confText = (item.confidence !== null && item.confidence !== undefined)
            ? (Number(item.confidence) * 100).toFixed(1) + '%'
            : '<span style="color:#9ca3af;">—</span>';

        var distText = (item.nearest_distance !== null && item.nearest_distance !== undefined)
            ? Number(item.nearest_distance).toFixed(3)
            : '<span style="color:#9ca3af;">—</span>';

        var noteText = '';
        if (isOk) {
            noteText = '<span style="color:#16a34a; font-size:0.83rem;">Valid feature vector (unsafe prob: ' + ((item.unsafe_probability || 0) * 100).toFixed(1) + '%)</span>';
        } else {
            noteText = '<span style="color:#dc2626; font-size:0.83rem; font-weight:500;"><i class="fas fa-info-circle"></i> ' + escapeHtml(item.error || 'Row data missing or invalid') + '</span>';
        }

        html += '<tr style="border-bottom:1px solid #f1f5f9;">';
        html += '<td style="padding:9px 12px;">' + (item.row_index || (i + 1)) + '</td>';
        html += '<td style="padding:9px 12px; font-weight:500;">' + escapeHtml(item.name || 'Sample #' + (i + 1)) + '</td>';
        html += '<td style="padding:9px 12px; text-align:center;">' + verdictBadge + '</td>';
        html += '<td style="padding:9px 12px; text-align:center; font-weight:600;">' + confText + '</td>';
        html += '<td style="padding:9px 12px; text-align:center;">' + distText + '</td>';
        html += '<td style="padding:9px 12px;">' + noteText + '</td>';
        html += '</tr>';
    }

    html += '</tbody></table></div>';
    html += '</div>'; // End table card
    html += '</div>'; // End outer card

    outDiv.innerHTML = html;

    // Generate CSV for download
    var csvHeader = 'Row,Sample Name,Category,Verdict,Confidence,Nearest Neighbor Distance,Status,Diagnostics\n';
    var csvLines = results.map(function(r) {
        var rName = (r.name || '').replace(/"/g, '""');
        var rVerdict = r.verdict || 'ERROR';
        var rConf = (r.confidence !== null && r.confidence !== undefined) ? (Number(r.confidence) * 100).toFixed(1) + '%' : '';
        var rDist = (r.nearest_distance !== null && r.nearest_distance !== undefined) ? r.nearest_distance : '';
        var rDiag = (r.error || (r.status === 'ok' ? 'OK' : 'Error')).replace(/"/g, '""');
        return '"' + (r.row_index || '') + '","' + rName + '","' + cat + '","' + rVerdict + '","' + rConf + '","' + rDist + '","' + r.status + '","' + rDiag + '"';
    }).join('\n');

    window.lastBatchCSV = csvHeader + csvLines;

    var dlBtn = document.getElementById('btn-download-batch');
    if (dlBtn) {
        dlBtn.addEventListener('click', function(e) {
            e.preventDefault();
            window.downloadBatchCSV();
        });
    }

    outDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ==========================================
// CUSTOM CSV MODEL TRAINING & PREDICTION
// ==========================================

var currentCustomModel = null;
var customCsvData = null;

function onCsvFileSelected(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        var text = e.target.result;
        var parsed = parseCSVFile(text);
        customCsvData = parsed;

        var catCol = null;
        for (var i = 0; i < parsed.headers.length; i++) {
            if (parsed.headers[i].trim().toLowerCase() === 'category') {
                catCol = parsed.headers[i];
                break;
            }
        }

        var wrapper = el('customCsvCategoryWrapper');
        var select = el('customCsvCategorySelect');
        if (catCol) {
            var catSet = {};
            parsed.rows.forEach(function(r) {
                var c = r[catCol];
                if (c && String(c).trim() && String(c).trim().toLowerCase() !== 'nan') {
                    catSet[String(c).trim()] = true;
                }
            });
            var catList = Object.keys(catSet).sort();
            if (select) {
                select.innerHTML = '<option value="">-- Choose Category --</option>' +
                    catList.map(function(c) {
                        return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>';
                    }).join('');
            }
            if (wrapper) wrapper.style.display = 'block';
        } else {
            if (wrapper) wrapper.style.display = 'none';
            if (select) select.innerHTML = '<option value="">-- No Category Column in CSV --</option>';
        }
    };
    reader.readAsText(file);
}

if (el('csvFile')) {
    el('csvFile').addEventListener('change', function() {
        if (this.files && this.files[0]) {
            onCsvFileSelected(this.files[0]);
        }
    });
}

function downloadCsvTemplate() {
    var templateCsv = "Temperature_C,Moisture_percent,Storage_Days,pH,Safety_Label\n" +
        "3.5,82.0,2,6.65,Safe\n4.0,84.5,1,6.70,Safe\n3.8,81.0,3,6.60,Safe\n2.5,78.0,2,6.72,Safe\n4.2,85.0,2,6.58,Safe\n" +
        "3.0,80.5,4,6.62,Safe\n2.8,79.0,1,6.68,Safe\n3.2,83.0,3,6.64,Safe\n4.5,86.0,2,6.55,Safe\n3.6,82.5,1,6.69,Safe\n" +
        "3.9,81.5,4,6.59,Safe\n2.7,77.5,2,6.71,Safe\n4.1,84.0,3,6.61,Safe\n3.4,80.0,1,6.67,Safe\n3.1,82.0,2,6.63,Safe\n" +
        "4.3,85.5,3,6.57,Safe\n2.9,78.5,1,6.70,Safe\n3.7,83.5,4,6.58,Safe\n3.3,81.0,2,6.65,Safe\n4.0,82.0,2,6.66,Safe\n" +
        "18.5,91.0,8,5.40,Unsafe\n22.0,93.5,10,4.80,Unsafe\n25.0,94.0,12,4.50,Unsafe\n19.0,89.5,7,5.55,Unsafe\n24.5,92.0,11,4.70,Unsafe\n" +
        "26.0,95.0,14,4.20,Unsafe\n20.5,90.0,9,5.20,Unsafe\n23.0,92.5,10,4.90,Unsafe\n27.5,96.0,15,4.10,Unsafe\n18.0,88.5,8,5.60,Unsafe\n" +
        "21.5,91.5,9,5.10,Unsafe\n25.5,94.5,13,4.40,Unsafe\n22.5,93.0,11,4.75,Unsafe\n28.0,95.5,16,4.00,Unsafe\n19.5,90.5,7,5.30,Unsafe\n" +
        "23.5,92.0,10,4.85,Unsafe\n26.5,94.0,14,4.30,Unsafe\n21.0,89.0,8,5.25,Unsafe\n24.0,93.0,12,4.60,Unsafe\n29.0,97.0,18,3.90,Unsafe\n";

    var blob = new Blob([templateCsv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'food_safety_template_40rows.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

if (el('downloadCsvTemplateBtn')) {
    el('downloadCsvTemplateBtn').addEventListener('click', downloadCsvTemplate);
}

async function trainCustomCsvModel() {
    var token = localStorage.getItem('fs_token');
    if (!token) {
        showToast('Please login first to train custom models', 'warning');
        return;
    }

    var fileInput = el('csvFile');
    var file = fileInput && fileInput.files && fileInput.files[0];
    if (!file && (!customCsvData || !customCsvData.rows || customCsvData.rows.length === 0)) {
        showToast('Please upload a CSV file first', 'warning');
        return;
    }

    var catWrapper = el('customCsvCategoryWrapper');
    var catSelect = el('customCsvCategorySelect');
    var categoryVal = null;
    if (catWrapper && catWrapper.style.display !== 'none') {
        categoryVal = catSelect ? catSelect.value : '';
        if (!categoryVal) {
            showToast('Please select a category from the dropdown', 'warning');
            return;
        }
    }

    var btn = el('trainCustomCsvBtn');
    setButtonLoading(btn, true, 'Training...');

    var resultsDiv = el('customTrainResults');
    var predictContainer = el('customPredictContainer');
    if (resultsDiv) {
        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = '<div style="padding:12px; background:#eff6ff; border-radius:6px; color:#1e40af;"><i class="fas fa-spinner fa-spin"></i> Training custom Logistic Regression model on CSV rows...</div>';
    }
    if (predictContainer) predictContainer.style.display = 'none';

    try {
        if (!customCsvData || !customCsvData.rows || customCsvData.rows.length === 0) {
            var fileText = await file.text();
            customCsvData = parseCSVFile(fileText);
        }

        var res = await fetch((window.API_BASE || 'http://localhost:5000') + '/api/ml/train-custom', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({
                rows: customCsvData.rows,
                category: categoryVal || null,
                target: 'Safety_Label'
            })
        });

        var data = await res.json();
        if (!res.ok) {
            var msg = data.message || 'Training failed';
            if (resultsDiv) {
                resultsDiv.innerHTML = '<div style="padding:12px; background:#fef2f2; border:1px solid #fecaca; border-radius:6px; color:#dc2626;"><strong>❌ Training Error:</strong> ' + escapeHtml(msg) + '</div>';
            }
            showToast(msg, 'error');
            return;
        }

        currentCustomModel = data;

        var testAccPct = (data.test_accuracy * 100).toFixed(1) + '%';
        var trainAccPct = (data.train_accuracy * 100).toFixed(1) + '%';
        var precPct = (data.precision * 100).toFixed(1) + '%';
        var recPct = (data.recall * 100).toFixed(1) + '%';
        var f1Pct = (data.f1 * 100).toFixed(1) + '%';

        var smallDatasetWarning = '';
        if (data.n_total < 100) {
            smallDatasetWarning = '<div style="margin-top:10px; padding:10px 14px; background:#fffbeb; border-left:4px solid #f59e0b; border-radius:6px; color:#b45309; font-size:0.85rem;">' +
                '<i class="fas fa-exclamation-triangle"></i> <strong>Small dataset (' + data.n_total + ' usable rows):</strong> Model accuracy may be unreliable. Datasets with 100+ validated samples produce more generalized decision boundaries.' +
                '</div>';
        }

        var featuresBadges = data.features.map(function(f) {
            return '<span style="display:inline-block; padding:3px 8px; margin:2px 4px 2px 0; background:#e0f2fe; color:#0369a1; border-radius:4px; font-size:0.8rem; font-weight:600;">' + escapeHtml(f) + '</span>';
        }).join('');

        var excludedHtml = '';
        if (data.excluded_columns && data.excluded_columns.length) {
            excludedHtml = '<div style="margin-top:10px; font-size:0.82rem; color:#475569;">' +
                '<strong>Excluded columns (' + data.excluded_columns.length + '):</strong> ' +
                data.excluded_columns.map(function(e) {
                    return '<span style="display:inline-block; margin:2px 4px; padding:2px 6px; background:#f1f5f9; border-radius:4px; border:1px solid #cbd5e1;"><code>' + escapeHtml(e.column) + '</code> (' + escapeHtml(e.reason) + ')</span>';
                }).join(' ') +
                '</div>';
        }

        var cm = data.confusion_matrix || [[0, 0], [0, 0]];
        var cmTable = '<table style="margin-top:8px; border-collapse:collapse; font-size:0.82rem; text-align:center;">' +
            '<tr><th style="padding:4px 8px; border-bottom:1px solid #cbd5e1;"></th><th style="padding:4px 8px; border-bottom:1px solid #cbd5e1; color:#059669;">Pred Safe</th><th style="padding:4px 8px; border-bottom:1px solid #cbd5e1; color:#dc2626;">Pred Unsafe</th></tr>' +
            '<tr><th style="padding:4px 8px; text-align:left; border-right:1px solid #cbd5e1; color:#059669;">Actual Safe</th><td style="padding:4px 10px; background:#dcfce7; font-weight:700;">' + cm[0][0] + '</td><td style="padding:4px 10px; background:#fee2e2; font-weight:700;">' + cm[0][1] + '</td></tr>' +
            '<tr><th style="padding:4px 8px; text-align:left; border-right:1px solid #cbd5e1; color:#dc2626;">Actual Unsafe</th><td style="padding:4px 10px; background:#fee2e2; font-weight:700;">' + cm[1][0] + '</td><td style="padding:4px 10px; background:#dcfce7; font-weight:700;">' + cm[1][1] + '</td></tr>' +
            '</table>';

        resultsDiv.innerHTML = '<div style="background:#ffffff; border:1px solid #bbf7d0; border-radius:8px; padding:16px;">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">' +
            '<h5 style="margin:0; color:#15803d; font-size:1rem;"><i class="fas fa-check-circle"></i> Custom Model Trained Successfully' + (data.category ? ' (' + escapeHtml(data.category) + ')' : '') + '</h5>' +
            '<span style="font-size:0.75rem; color:#64748b; font-family:monospace;">ID: ' + escapeHtml(data.model_id.substring(0, 8)) + '...</span>' +
            '</div>' +
            smallDatasetWarning +
            '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; margin-top:14px;">' +
            '<div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:10px; text-align:center;"><div style="font-size:0.75rem; color:#166534; font-weight:600;">Test Accuracy</div><div style="font-size:1.25rem; font-weight:700; color:#15803d;">' + testAccPct + '</div></div>' +
            '<div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px; text-align:center;"><div style="font-size:0.75rem; color:#475569; font-weight:600;">Train Accuracy</div><div style="font-size:1.1rem; font-weight:600; color:#1e293b;">' + trainAccPct + '</div></div>' +
            '<div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px; text-align:center;"><div style="font-size:0.75rem; color:#475569; font-weight:600;">Precision / Recall</div><div style="font-size:0.95rem; font-weight:600; color:#1e293b;">' + precPct + ' / ' + recPct + '</div></div>' +
            '<div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px; text-align:center;"><div style="font-size:0.75rem; color:#475569; font-weight:600;">F1 Score</div><div style="font-size:1.1rem; font-weight:600; color:#1e293b;">' + f1Pct + '</div></div>' +
            '</div>' +
            '<div style="margin-top:12px; font-size:0.85rem; color:#334155;">' +
            '<strong>Rows:</strong> ' + data.n_total + ' usable (' + data.n_train + ' train / ' + data.n_test + ' test), ' + data.rows_dropped + ' dropped for missing values. ' +
            '<strong>Class breakdown:</strong> ' + data.class_counts.Safe + ' Safe, ' + data.class_counts.Unsafe + ' Unsafe.' +
            '</div>' +
            '<div style="margin-top:10px;"><strong>Features used (' + data.features.length + '):</strong> ' + featuresBadges + '</div>' +
            excludedHtml +
            '<div style="margin-top:14px;"><strong style="font-size:0.85rem; color:#1e293b;">Test Confusion Matrix:</strong>' + cmTable + '</div>' +
            '</div>';

        if (predictContainer) {
            var featInputsHtml = data.features.map(function(f, idx) {
                return '<div class="col" style="min-width:180px;"><div class="form-group" style="margin-bottom:8px;">' +
                    '<label class="form-label" style="font-size:0.8rem; margin-bottom:2px;">' + escapeHtml(f) + '</label>' +
                    '<input type="number" step="any" class="form-control custom-feat-field" id="cpf_' + idx + '" data-key="' + escapeHtml(f) + '" placeholder="e.g. 0.0" style="padding:6px 10px; font-size:0.85rem;">' +
                    '</div></div>';
            }).join('');

            predictContainer.innerHTML = '<h5 style="color:#1e3a8a; margin:0 0 10px 0; font-size:0.95rem;"><i class="fas fa-play-circle"></i> Predict with Your Trained Model</h5>' +
                '<p style="font-size:0.82rem; color:#64748b; margin-bottom:10px;">Enter values for the model features to get an immediate prediction:</p>' +
                '<div class="row" style="margin:0 -5px;">' + featInputsHtml + '</div>' +
                '<div style="margin-top:10px;">' +
                '<button type="button" class="btn btn-secondary" id="customPredictBtn" style="padding:7px 14px; font-size:0.85rem;"><i class="fas fa-brain"></i> Predict Sample</button>' +
                '<span id="customPredictOutput" style="margin-left:14px; font-size:0.9rem; font-weight:600;"></span>' +
                '</div>';
            predictContainer.style.display = 'block';

            var predBtn = el('customPredictBtn');
            if (predBtn) {
                predBtn.addEventListener('click', executeCustomPrediction);
            }
        }

        showToast('Custom model trained! Test accuracy: ' + testAccPct, 'success');
    } catch (err) {
        if (resultsDiv) {
            resultsDiv.innerHTML = '<div style="padding:12px; background:#fef2f2; border:1px solid #fecaca; border-radius:6px; color:#dc2626;"><strong>❌ Network Error:</strong> ' + escapeHtml(err.message || 'Server error') + '</div>';
        }
        showToast('Server error while training model', 'error');
    } finally {
        setButtonLoading(btn, false);
    }
}

async function executeCustomPrediction() {
    if (!currentCustomModel || !currentCustomModel.model_id) {
        showToast('No active custom model. Please train a model first.', 'warning');
        return;
    }

    var token = localStorage.getItem('fs_token');
    var featInputs = document.querySelectorAll('.custom-feat-field');
    var features = {};
    var missing = [];

    featInputs.forEach(function(inp) {
        var key = inp.getAttribute('data-key');
        var val = inp.value.trim();
        if (val === '' || isNaN(parseFloat(val))) {
            missing.push(key);
        } else {
            features[key] = parseFloat(val);
        }
    });

    if (missing.length > 0) {
        showToast('Please enter required value for: ' + missing.join(', '), 'warning');
        return;
    }

    var outSpan = el('customPredictOutput');
    var btn = el('customPredictBtn');
    if (outSpan) outSpan.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Predicting...';
    setButtonLoading(btn, true, 'Predicting...');

    try {
        var res = await fetch((window.API_BASE || 'http://localhost:5000') + '/api/ml/predict-custom', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + (token || '')
            },
            body: JSON.stringify({
                model_id: currentCustomModel.model_id,
                features: features
            })
        });

        if (res.status === 404) {
            if (outSpan) outSpan.innerHTML = '<span style="color:#dc2626;">❌ Model expired, please train again</span>';
            showToast('Model expired, please train again', 'error');
            return;
        }

        var data = await res.json();
        if (!res.ok) {
            if (outSpan) outSpan.innerHTML = '<span style="color:#dc2626;">❌ ' + escapeHtml(data.message || 'Prediction failed') + '</span>';
            showToast(data.message || 'Prediction failed', 'error');
            return;
        }

        var isSafe = data.verdict === 'Safe';
        var badgeBg = isSafe ? '#dcfce7' : '#fee2e2';
        var badgeColor = isSafe ? '#15803d' : '#b91c1c';
        var icon = isSafe ? 'fa-check-circle' : 'fa-exclamation-triangle';
        var probPct = (data.unsafe_probability * 100).toFixed(1) + '%';

        if (outSpan) {
            outSpan.innerHTML = '<span style="display:inline-flex; align-items:center; gap:6px; padding:4px 10px; background:' + badgeBg + '; color:' + badgeColor + '; border-radius:6px; border:1px solid ' + badgeColor + ';">' +
                '<i class="fas ' + icon + '"></i> <strong>' + escapeHtml(data.verdict) + '</strong> (Unsafe Probability: ' + probPct + ')' +
                '</span>';
        }
        showToast('Prediction: ' + data.verdict + ' (' + probPct + ' unsafe prob)', isSafe ? 'success' : 'warning');
    } catch (err) {
        if (outSpan) outSpan.innerHTML = '<span style="color:#dc2626;">❌ Server error</span>';
        showToast('Server error during prediction', 'error');
    } finally {
        setButtonLoading(btn, false);
    }
}

if (el('trainCustomCsvBtn')) {
    el('trainCustomCsvBtn').addEventListener('click', trainCustomCsvModel);
}

    // ========== EVENT LISTENERS ==========
    if (el('contactForm')) el('contactForm').addEventListener('submit', function (e) { e.preventDefault(); showToast('Thank you! Your message has been sent (Demo)', 'success'); this.reset(); });
    if (el('runBtn')) el('runBtn').addEventListener('click', runChecks);
    if (el('saveReview')) el('saveReview').addEventListener('click', saveReview);
    if (el('downloadHtml')) el('downloadHtml').addEventListener('click', downloadHTML);
    if (el('printReport')) el('printReport').addEventListener('click', function() {
    window.print();
});
if (el('p_ing')) {
    el('p_ing').addEventListener('input', function() {
        var text = this.value.toLowerCase();
        var alertDiv = el('liveIngredientAlert');
        if (!alertDiv) return;
        
        var foundAllergens = commonAllergens.filter(function(a) { return text.includes(a); });
        var foundHarmful = harmfulWords.filter(function(w) { return text.includes(w); });
        var foundE = (text.match(/e\s?\d{3}/gi) || []).map(function(x) { return x.toUpperCase().replace(/\s/g, ''); });
        
        if (foundAllergens.length === 0 && foundHarmful.length === 0 && foundE.length === 0) {
            alertDiv.innerHTML = '<span style="color:#059669;">✅ No immediate risks found in typed ingredients.</span>';
        } else {
            var html = '';
            if (foundAllergens.length) html += '<span style="color:#d97706;">⚠️ Allergens: ' + foundAllergens.join(', ') + '</span><br>';
            if (foundHarmful.length) html += '<span style="color:#dc2626;">🚨 Harmful: ' + foundHarmful.join(', ') + '</span><br>';
            if (foundE.length) html += '<span style="color:#7c3aed;">🧪 Additives (E-Numbers): ' + foundE.join(', ') + '</span>';
            alertDiv.innerHTML = html;
        }
    });
}
    if (el('downloadPdf')) el('downloadPdf').addEventListener('click', downloadPDF);

    if (el('demoBtn')) el('demoBtn').addEventListener('click', function () {
        var btn = el('demoBtn');
        setButtonLoading(btn, true, 'Loading Demo...');
        showToast('Loading demo product data...', 'info', 2000);
        try {
        if (el('p_name')) el('p_name').value = 'Classic Salted Chips';
        if (el('p_cat')) el('p_cat').value = 'Packaged Snack';
        if (el('p_exp')) el('p_exp').value = todayISO();
        if (el('p_ing')) el('p_ing').value = 'Potatoes, Edible Vegetable Oil, Salt, Flavour Enhancer (E621)';
        if (el('p_origin')) el('p_origin').value = 'India';
        if (el('n_kcal')) el('n_kcal').value = 540;
        if (el('n_sugar')) el('n_sugar').value = 1.2;
        if (el('n_sodium')) el('n_sodium').value = 580;
        if (el('fssai')) el('fssai').value = '12345678901234';
        validateInputs(); runChecks();
        showToast('Demo product loaded & safety check complete!', 'success');
        } catch (err) {
            showToast('Demo loading failed: ' + (err.message || err), 'error');
        } finally {
            setButtonLoading(btn, false);
        }
    });

    if (el('clearBtn')) el('clearBtn').addEventListener('click', function () {
        ['p_name', 'p_exp', 'p_ing', 'p_origin', 'n_kcal', 'n_sugar', 'n_sodium', 'n_sat', 'n_trans', 't_min', 't_max', 'fssai', 'lab_data', 'lab_limit', 'lab_sigma'].forEach(function (id) { if (el(id)) { el(id).value = ''; el(id).classList.remove('invalid'); } });
        ['k_overall', 'k_exp', 'k_add', 'k_all', 'k_origin', 'knn_out', 'lab_n', 'lab_mean', 'lab_sd'].forEach(function (id) { if (el(id)) el(id).textContent = '—'; });
        if (el('bullets')) el('bullets').innerHTML = '';
        if (el('verdict')) { el('verdict').textContent = '—'; el('verdict').className = 'badge'; }
        if (el('lab_summary')) { el('lab_summary').textContent = '—'; el('lab_summary').className = 'badge'; }
        if (el('lab_out')) el('lab_out').innerHTML = '';
        if (el('fopWarnings')) el('fopWarnings').style.display = 'none';
        if (el('imagePreview')) el('imagePreview').innerHTML = '';
        if (el('imageResult')) el('imageResult').style.display = 'none';
        initRiskChart(); initLabChart(); clearMLResults();
        if (el('barcodeResult')) el('barcodeResult').style.display = 'none';
if (el('manualBarcode')) el('manualBarcode').value = '';
    });

    
async function executeKnnPrediction(triggerBtn) {
    if (window.currentMode === 'consumer') {
        showToast('k-NN Prediction requires laboratory instrument measurements. Please switch to Lab / Inspector Mode.', 'warning');
        return;
    }

    var cat = el('p_cat') ? el('p_cat').value : (el('mlCategorySelect') ? el('mlCategorySelect').value : 'Dairy');
    if (!cat || cat === 'All') cat = 'Dairy';

    var schema = CATEGORY_SCHEMAS[cat] || CATEGORY_SCHEMAS['Dairy'];
    var allFields = schema.common.concat(schema.specific);

    // Ensure matching fields are rendered in DOM
    var firstFieldElem = allFields.length > 0 ? el(allFields[0].id) : null;
    if (!firstFieldElem && typeof renderDynamicLabFields === 'function') {
        renderDynamicLabFields(cat);
    }

    var features = {};
    var missingFields = [];

    allFields.forEach(function (f) {
        var val = numVal(f.id);
        if (val === null || isNaN(val)) {
            missingFields.push(f.label);
        } else {
            features[f.key] = val;
        }
    });

    if (missingFields.length > 0) {
        showToast('Please enter required field: ' + missingFields.join(', '), 'warning');
        return;
    }

    var btn = triggerBtn || el('runKnBtnLab');
    if (el('knn_out')) el('knn_out').innerText = 'Predicting...';
    setButtonLoading(btn, true, 'Predicting...');
    try {
        var token = localStorage.getItem('fs_token');
        var headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;

        var res = await fetch((window.API_BASE || 'http://localhost:5000') + '/api/ml/predict', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                category: cat,
                features: features
            })
        });
        var data = await res.json();
        if (!res.ok) {
            if (el('knn_out')) el('knn_out').innerText = data.message || 'Prediction failed';
            showToast(data.message || 'Prediction failed', 'error');
            return;
        }

        var sampleNote = data.trainedOnSamples < 20 ? ' ⚠️ Experimental' : '';
        var probPct = (typeof data.unsafeProbability === 'number') ? (data.unsafeProbability * 100).toFixed(1) + '%' : 'N/A';
        var testAccPct = (data.evaluation && typeof data.evaluation.test_accuracy === 'number') ? (data.evaluation.test_accuracy * 100).toFixed(1) + '%' : 'N/A';

        // 1. Update k-NN badge with verdict, unsafe prob, test accuracy, k, sample count
        if (el('knn_out')) {
            el('knn_out').innerText = data.prediction + ' | Unsafe Prob: ' + probPct + ' | Test Acc: ' + testAccPct + ' (k=' + data.k + ', trained on ' + data.trainedOnSamples + ' samples)' + sampleNote;
        }

        // 2. Render nearest neighbors list if layout allows
        var nnContainer = el('knn_neighbors_box');
        if (!nnContainer && el('knn_out') && el('knn_out').parentNode) {
            nnContainer = document.createElement('div');
            nnContainer.id = 'knn_neighbors_box';
            nnContainer.style.marginTop = '8px';
            nnContainer.style.fontSize = '0.82rem';
            nnContainer.style.color = '#334155';
            el('knn_out').parentNode.appendChild(nnContainer);
        }
        if (nnContainer) {
            if (data.neighbors && data.neighbors.length) {
                var nnHtml = '<strong>Nearest Neighbors:</strong> ';
                nnHtml += data.neighbors.map(function (n, i) {
                    var dist = (typeof n.distance === 'number') ? n.distance.toFixed(3) : n.distance;
                    var badgeColor = n.label === 'SAFE' ? '#16a34a' : '#dc2626';
                    return '<span style="display:inline-block; margin:2px 4px 2px 0; padding:2px 6px; background:#fff; border-radius:4px; border:1px solid #cbd5e1;">#' + (i + 1) + ' <strong style="color:' + badgeColor + '">' + n.label + '</strong> (d=' + dist + ')</span>';
                }).join(' ');
                nnContainer.innerHTML = nnHtml;
                nnContainer.style.display = 'block';
            } else {
                nnContainer.style.display = 'none';
            }
        }

        // 3. Render rich breakdown in ML Lab results panel
        if (typeof clearMLResults === 'function') clearMLResults();
        if (typeof showMLResult === 'function') {
            showMLResult("🧠 k-NN PREDICTION — Category: " + (data.category || cat), true);
            showMLResult("✅ VERDICT: " + String(data.prediction).toUpperCase(), true);
            showMLResult("  Unsafe probability: " + probPct);
            showMLResult("  Trained on: " + data.trainedOnSamples + " category dataset samples (k=" + data.k + ")");
            showMLResult("  Features evaluated: " + (data.featuresUsed ? data.featuresUsed.join(', ') : Object.keys(features).join(', ')));

            if (data.neighbors && data.neighbors.length) {
                showMLResult("\n👥 NEAREST NEIGHBORS:", true);
                data.neighbors.forEach(function (n, i) {
                    var dist = (typeof n.distance === 'number') ? n.distance.toFixed(3) : n.distance;
                    showMLResult("  #" + (i + 1) + ": label = " + n.label + ", distance = " + dist);
                });
            }

            if (data.evaluation) {
                var ev = data.evaluation;
                showMLResult("\n🎯 MODEL EVALUATION (k-NN, " + ev.n_train + " train / " + ev.n_test + " test):", true);
                if (typeof ev.train_accuracy === 'number') {
                    showMLResult("  Train Accuracy: " + (ev.train_accuracy * 100).toFixed(1) + "%");
                }
                showMLResult("  Held-out Test Accuracy: " + testAccPct);
            }
        }

        var disc = el('mlSampleDisclaimer');
        if (disc) {
            if (data.trainedOnSamples < 20) {
                disc.innerHTML = '<i class="fas fa-exclamation-triangle"></i> <strong>Experimental:</strong> models are trained on a synthetic 800-sample dataset (80 samples per category, 80/20 train/test split). Results are screening estimates only. ML predictions are supplementary decision-support tools and do not replace official food safety standards or laboratory certification.';
                disc.style.display = 'block';
            } else {
                disc.style.display = 'none';
            }
        }
        showToast('k-NN: ' + data.prediction + ' (' + probPct + ' unsafe prob)', 'success');
    } catch (err) {
        if (el('knn_out')) el('knn_out').innerText = 'Server error. Is the backend running?';
        showToast('Server error. Is the backend running?', 'error');
    } finally {
        setButtonLoading(btn, false);
    }
}

if (el('labDemo')) el('labDemo').addEventListener('click', function () { 
    if (el('lab_report_id')) el('lab_report_id').value = generateLabReportId();
    if (el('lab_sample_id')) el('lab_sample_id').value = 'SMP-2026-0841';
    if (el('lab_sample_name')) el('lab_sample_name').value = 'Skimmed Milk Powder';
    if (el('lab_batch_no')) el('lab_batch_no').value = 'BATCH-9021';
    if (el('lab_collection_date')) el('lab_collection_date').value = '2026-09-10';
    if (el('lab_received_date')) el('lab_received_date').value = '2026-09-11';
    if (el('lab_testing_date')) el('lab_testing_date').value = todayISO();
    if (el('lab_test_method')) el('lab_test_method').value = 'ISO / FSSAI Titrimetric Method';
    if (el('lab_analyst')) el('lab_analyst').value = 'Lead Chemist';
    if (el('lab_reviewer')) el('lab_reviewer').value = 'QA Supervisor';

    if (el('lab_param')) el('lab_param').value = 'Sodium';
    if (el('lab_unit')) el('lab_unit').value = 'mg/kg';
    if (el('lab_data')) el('lab_data').value = '480,510,495,505'; 
    if (el('lab_limit')) el('lab_limit').value = 600; 
    if (el('lab_limit_source_type')) el('lab_limit_source_type').value = 'Regulatory/reference standard';
    if (el('lab_limit_source_desc')) el('lab_limit_source_desc').value = 'FSSAI Reference Standard 2023';
    if (el('lab_sigma')) el('lab_sigma').value = ''; 
    if (el('lab_alpha')) el('lab_alpha').value = '0.05'; 
    validateInputs(); 
    runLabTest(); 
});

if (el('labRun')) el('labRun').addEventListener('click', runLabTest);
if (el('labSave')) el('labSave').addEventListener('click', saveLabAssessment);
if (el('labExportPdf')) el('labExportPdf').addEventListener('click', downloadLabPDF);

if (el('labSavedSelect')) {
    renderLabSavedSelect();
    el('labSavedSelect').addEventListener('change', function() {
        loadSavedLabAssessment(this.value);
    });
}

// ============================================================
//  CATEGORY-SPECIFIC LABORATORY PARAMETER REFERENCE GUIDE
// ============================================================
var categoryLabParameters = {
  "Milk & Dairy": [
    { group: "Microbiological Testing", items: ["Total Plate Count", "Coliforms", "E. coli", "Listeria monocytogenes", "Yeast & Mould"] },
    { group: "Chemical & Heavy Metals", items: ["Lead", "Arsenic", "Chemical Contaminants", "Veterinary Drug Residues"] },
    { group: "Residue Testing", items: ["Antibiotic Residues", "Pesticide Residues"] },
    { group: "Toxin Testing", items: ["Aflatoxin M1"] },
    { group: "Physical & Quality", items: ["Moisture / Total Solids", "Titratable Acidity", "Specific Gravity", "Odour / Appearance"] },
    { group: "Composition / Nutrition", items: ["Milk Fat (%)", "Protein / SNF (%)", "Added Water", "Lactose"] },
    { group: "Adulteration Testing", items: ["Water Dilution Check", "Starch / Flour Adulteration", "Detergent / Urea Check", "Neutralizer Check"] }
  ],
  "Edible Oils & Fats": [
    { group: "Microbiological Testing", items: ["Moisture-associated Moulds (if water present)"] },
    { group: "Chemical & Heavy Metals", items: ["Lead", "Arsenic", "Cadmium", "Hexane Residues", "PAHs"] },
    { group: "Residue Testing", items: ["Pesticide Residues"] },
    { group: "Toxin Testing", items: ["Aflatoxins (in unrefined seed oils)"] },
    { group: "Physical & Quality", items: ["Refractive Index", "Specific Gravity", "Color Value (Lovibond)", "Odour / Clarity"] },
    { group: "Composition / Nutrition", items: ["Free Fatty Acids (FFA)", "Peroxide Value", "Iodine Value", "Trans Fat (%)"] },
    { group: "Adulteration Testing", items: ["Argemone Oil Check", "Mineral Oil Adulteration", "Castor Oil Check", "Sesame Oil Check"] }
  ],
  "Spices": [
    { group: "Microbiological Testing", items: ["Salmonella spp.", "Bacillus cereus", "Clostridium perfringens", "Yeast & Mould"] },
    { group: "Chemical & Heavy Metals", items: ["Lead", "Arsenic", "Cadmium", "Non-permitted Dyes (Metanil Yellow, Sudan Dyes)"] },
    { group: "Residue Testing", items: ["Ethylene Oxide (EtO) Residues", "Pesticide Residues"] },
    { group: "Toxin Testing", items: ["Aflatoxins (B1, B2, G1, G2)", "Ochratoxin A"] },
    { group: "Physical & Quality", items: ["Moisture Content (%)", "Total Ash / Acid Insoluble Ash", "Extraneous Foreign Matter"] },
    { group: "Composition / Nutrition", items: ["Curcumin / Piperine / Capsaicin Content", "Volatile Oil Content", "Total Protein"] },
    { group: "Adulteration Testing", items: ["Starch / Sawdust Adulteration", "Lead Chromate Dye Check", "Brick Dust / Sand Check"] }
  ],
  "Cereals & Grains": [
    { group: "Microbiological Testing", items: ["Total Viable Count", "Yeast & Mould (Aspergillus, Penicillium)"] },
    { group: "Chemical & Heavy Metals", items: ["Lead", "Cadmium", "Inorganic Arsenic"] },
    { group: "Residue Testing", items: ["Organophosphorus & Synthetic Pyrethroid Pesticides", "Fumigant Residues"] },
    { group: "Toxin Testing", items: ["Deoxynivalenol (DON)", "T-2 Toxin", "Fumonisin", "Aflatoxins"] },
    { group: "Physical & Quality", items: ["Moisture Content (%)", "Foreign Matter / Weeviled Grains", "Broken / Damaged Kernels", "Uric Acid Level"] },
    { group: "Composition / Nutrition", items: ["Crude Protein", "Carbohydrates", "Dietary Fiber", "Gluten Content"] },
    { group: "Adulteration Testing", items: ["Chalk / Marble Dust Check", "Ergot Fungus Contamination", "Clay / Pebble Check"] }
  ],
  "Meat & Poultry": [
    { group: "Microbiological Testing", items: ["Salmonella spp.", "Campylobacter jejuni", "E. coli O157:H7", "Listeria monocytogenes", "Staphylococcus aureus"] },
    { group: "Chemical & Heavy Metals", items: ["Lead", "Cadmium", "Nitrites & Nitrates"] },
    { group: "Residue Testing", items: ["Veterinary Antibiotic Residues", "Hormone Residues"] },
    { group: "Toxin Testing", items: ["Bacterial Enterotoxins"] },
    { group: "Physical & Quality", items: ["pH Value", "Water Holding Capacity", "Drip Loss", "Color (L*, a*, b*)", "Odour"] },
    { group: "Composition / Nutrition", items: ["Total Protein", "Intramuscular Fat", "Moisture Content"] },
    { group: "Adulteration Testing", items: ["Species Substitution (Meat Speciation PCR)", "Added Water / Polyphosphates", "TVB-N Spoilage Indicator"] }
  ],
  "Fish & Seafood": [
    { group: "Microbiological Testing", items: ["Vibrio cholerae / Vibrio parahaemolyticus", "Salmonella spp.", "Listeria monocytogenes", "Histamine Formers"] },
    { group: "Chemical & Heavy Metals", items: ["Methylmercury", "Lead", "Cadmium", "Formaldehyde / Formalin Adulteration"] },
    { group: "Residue Testing", items: ["Antibiotic Residues (Nitrofurans, Chloramphenicol)", "Pesticide Residues"] },
    { group: "Toxin Testing", items: ["Ciguatoxins", "Scombroid Histamine Toxin"] },
    { group: "Physical & Quality", items: ["Core Temperature", "Total Volatile Basic Nitrogen (TVB-N)", "Organoleptic Score"] },
    { group: "Composition / Nutrition", items: ["Moisture Content", "Crude Protein", "Omega-3 Fatty Acids"] },
    { group: "Adulteration Testing", items: ["Formalin Preserved Fish Check", "STPP Excess Water Retention Check", "Species Fraud"] }
  ],
  "Fruits & Vegetables": [
    { group: "Microbiological Testing", items: ["E. coli", "Salmonella spp.", "Listeria monocytogenes", "Norovirus / Parasite Cysts"] },
    { group: "Chemical & Heavy Metals", items: ["Calcium Carbide / Acetylene Ripening Residues", "Lead", "Cadmium"] },
    { group: "Residue Testing", items: ["Multi-residue Pesticides", "Fungicide Residues", "Herbicides"] },
    { group: "Toxin Testing", items: ["Patulin (in apple products)", "Solanine (in damaged potatoes)"] },
    { group: "Physical & Quality", items: ["Moisture Content", "Brix (°Bx) / Total Soluble Solids", "Physical Defects / Rot", "Foreign Matter"] },
    { group: "Composition / Nutrition", items: ["Vitamin C / Ascorbic Acid", "Sugars", "Acidity"] },
    { group: "Adulteration Testing", items: ["Malachite Green Dye Check", "Copper Sulphate Brightening Check", "Wax Coating Verification"] }
  ],
  "Bakery Products": [
    { group: "Microbiological Testing", items: ["Rope Spore Count (Bacillus subtilis)", "Yeast & Mould", "Staphylococcus aureus"] },
    { group: "Chemical & Heavy Metals", items: ["Potassium Bromate / Iodate Residues", "Heavy Metals"] },
    { group: "Residue Testing", items: ["Pesticide Residues in Flour"] },
    { group: "Toxin Testing", items: ["Mycotoxins in Grain Flour"] },
    { group: "Physical & Quality", items: ["Moisture Content (%)", "Crumb Structure / Texture", "Volume / Density", "pH"] },
    { group: "Composition / Nutrition", items: ["Fat Content", "Total Sugar", "Sodium / Salt", "Trans Fat (%)"] },
    { group: "Adulteration Testing", items: ["Non-permitted Colors Check", "Chalk Powder in Flour Check", "Excessive Preservative Level"] }
  ],
  "Packaged Foods": [
    { group: "Microbiological Testing", items: ["Total Commercial Sterility (Canned Foods)", "Enterobacteriaceae", "Yeast & Mould"] },
    { group: "Chemical & Heavy Metals", items: ["Packaging Migrants (BPA, Phthalates)", "Heavy Metals (Lead, Cadmium)", "Non-permitted Synthetic Additives"] },
    { group: "Residue Testing", items: ["Pesticide Residues"] },
    { group: "Toxin Testing", items: ["Aflatoxins / Mycotoxins"] },
    { group: "Physical & Quality", items: ["Net Weight / Fill Volume", "Headspace Oxygen", "Moisture Content", "pH / Water Activity"] },
    { group: "Composition / Nutrition", items: ["Saturated Fat", "Trans Fat", "Added Sugar", "Sodium", "Energy (kcal)"] },
    { group: "Adulteration Testing", items: ["Substandard Ingredient Substitution", "Synthetic Color / Flavor Enhancement Check"] }
  ],
  "Beverages": [
    { group: "Microbiological Testing", items: ["Coliform Bacteria", "Pseudomonas aeruginosa", "Yeast & Mould", "Fecal Streptococci"] },
    { group: "Chemical & Heavy Metals", items: ["Arsenic", "Lead", "Cadmium", "BPA Migration", "Bromated Vegetable Oil"] },
    { group: "Residue Testing", items: ["Pesticide Residues"] },
    { group: "Toxin Testing", items: ["Patulin (Fruit Juices)"] },
    { group: "Physical & Quality", items: ["Brix (°Bx) / Sugar Content", "pH / Acidity", "Turbidity / Clarity", "Carbonation Level"] },
    { group: "Composition / Nutrition", items: ["Fruit Juice Content (%)", "Added Sugar", "Caffeine Content", "Sodium / Potassium"] },
    { group: "Adulteration Testing", items: ["Synthetic Sweetener Adulteration", "Artificial Dye Check", "Diluted Juice Ratio Check"] }
  ],
  "Sweets & Confectionery": [
    { group: "Microbiological Testing", items: ["Salmonella spp.", "Staphylococcus aureus", "Yeast & Mould"] },
    { group: "Chemical & Heavy Metals", items: ["Non-permitted Dyes (Rhodamine B, Metanil Yellow)", "Silver Leaf (Vark) Purity (Aluminum Adulteration)"] },
    { group: "Residue Testing", items: ["Pesticide Residues"] },
    { group: "Toxin Testing", items: ["Aflatoxins in Nut Sweets"] },
    { group: "Physical & Quality", items: ["Moisture Content (%)", "Texture / Hardness", "Visual Appearance"] },
    { group: "Composition / Nutrition", items: ["Total Sugar", "Fat Content", "Milk Solids Content"] },
    { group: "Adulteration Testing", items: ["Aluminum Vark Substitution for Silver Vark", "Adulterated Mawa / Khoya Base Check", "Non-edible Dye Check"] }
  ],
  "Pulses": [
    { group: "Quality & Composition", items: ["Moisture", "Foreign matter", "Adulteration"] },
    { group: "Residue Testing", items: ["Pesticide residues where applicable"] },
    { group: "Microbiological Testing", items: ["Microbiological parameters where applicable"] }
  ],
  "Other": [
    { group: "General Testing", items: ["Product-specific parameters"] }
  ]
};

function renderCategoryLabParamsGuide(category) {
    var container = el('categoryLabParamsDisplay');
    if (!container) return;
    category = category || 'Packaged Foods';
    var list = categoryLabParameters[category] || categoryLabParameters['Packaged Foods'];

    var html = '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:14px;">';
    list.forEach(function(grp) {
        html += '<div style="background:#ffffff; border:1px solid #e9d5ff; border-radius:8px; padding:12px 14px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">';
        html += '<h5 style="color:#6d28d9; font-size:0.88rem; margin-bottom:8px; display:flex; align-items:center; gap:6px;">';
        var icon = 'fa-vial';
        if (grp.group.includes('Microbiological')) icon = 'fa-bacteria';
        else if (grp.group.includes('Chemical')) icon = 'fa-flask';
        else if (grp.group.includes('Residue')) icon = 'fa-seedling';
        else if (grp.group.includes('Toxin')) icon = 'fa-biohazard';
        else if (grp.group.includes('Physical')) icon = 'fa-ruler-combined';
        else if (grp.group.includes('Composition')) icon = 'fa-chart-pie';
        else if (grp.group.includes('Adulteration')) icon = 'fa-search-minus';
        html += '<i class="fas ' + icon + '" style="color:#7c3aed;"></i> ' + escapeHtml(grp.group);
        html += '</h5>';
        html += '<ul style="list-style:none; padding:0; margin:0; font-size:0.83rem; color:#475569; line-height:1.6;">';
        grp.items.forEach(function(item) {
            html += '<li style="padding:2px 0;">• ' + escapeHtml(item) + '</li>';
        });
        html += '</ul>';
        html += '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
}

if (el('labCategoryGuideSelect')) {
    renderCategoryLabParamsGuide(el('labCategoryGuideSelect').value);
    el('labCategoryGuideSelect').addEventListener('change', function() {
        renderCategoryLabParamsGuide(this.value);
    });
}
if (el('processCsvBtn')) el('processCsvBtn').addEventListener('click', function () {
    var f = el('csvFile') ? el('csvFile').files[0] : null;
    if (f) {
        var btn = el('processCsvBtn');
        setButtonLoading(btn, true, 'Processing...');
        processCSV(f, function() {
            setButtonLoading(btn, false);
        });
    } else {
        showToast('Please select a CSV file first', 'warning');
    }
});
    
    if (el('exportCSV')) el('exportCSV').addEventListener('click', exportHistoryCSV);
    if (el('clearHistory')) el('clearHistory').addEventListener('click', clearHistory);
    if (el('runEDA')) el('runEDA').addEventListener('click', ml.runEDA);
    if (el('runLinear')) el('runLinear').addEventListener('click', ml.runLinearRegression);
    if (el('runLogistic')) el('runLogistic').addEventListener('click', ml.runLogistic);
    if (el('runRidge')) el('runRidge').addEventListener('click', ml.runRidge);
    if (el('runLasso')) el('runLasso').addEventListener('click', ml.runLasso);
    if (el('runHist')) el('runHist').addEventListener('click', ml.showHistograms);
    if (el('runKnBtnLab')) el('runKnBtnLab').addEventListener('click', function () { executeKnnPrediction(el('runKnBtnLab')); });

    if (el('verifyFssai')) el('verifyFssai').addEventListener('click', function () {
        var n = el('fssai') ? el('fssai').value.trim() : '', s = el('fssaiStatus'); if (!s) return;
        if (!n) s.innerHTML = '<span style="color:#dc2626;">âŒ Enter FSSAI number</span>';
        else if (!/^\d{14}$/.test(n)) s.innerHTML = '<span style="color:#dc2626;">âŒ 14 numeric digits required</span>';
        else s.innerHTML = '<span style="color:#16a34a;">✅ Valid 14-digit format (Format check only — not official FSSAI registry verification)</span>';
    });

    document.querySelectorAll('a[href^="#"]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); var t = document.querySelector(this.getAttribute('href')); if (t) t.scrollIntoView({ behavior: 'smooth' }); }); });
    ['p_name', 'p_exp', 'fssai', 'lab_data', 'lab_limit'].forEach(function (id) { if (el(id)) el(id).addEventListener('input', validateInputs); });
    ['p_name', 'p_exp', 'p_ing', 'p_cat', 'n_kcal', 'n_sugar', 'n_sodium', 'n_sat', 'n_trans'].forEach(function (id) {
        if (el(id)) el(id).addEventListener('input', function() { window.lastDataOrigin = 'Manually Entered by User'; });
    });
    var mm = document.querySelector('.mobile-menu'); if (mm) mm.addEventListener('click', function () { var u = document.querySelector('nav ul'); if (u) u.classList.toggle('show'); });
    // ========== NEW SCROLL & UI FEATURES ==========
    
    // 1. Scroll Progress Bar
    window.addEventListener('scroll', function() {
        var winScroll = document.body.scrollTop || document.documentElement.scrollTop;
        var height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        var scrolled = (winScroll / height) * 100;
        if(el('progressBar')) el('progressBar').style.width = scrolled + "%";
    });

    // 2. Scroll Reveal Animation
    function revealOnScroll() {
        var reveals = document.querySelectorAll(".reveal");
        reveals.forEach(function(div) {
            var windowHeight = window.innerHeight;
            var revealTop = div.getBoundingClientRect().top;
            if (revealTop < windowHeight - 100) div.classList.add("active");
        });
    }
    window.addEventListener("scroll", revealOnScroll);

    // 3. Active Nav Link on Scroll
    window.addEventListener('scroll', function() {
        var sections = document.querySelectorAll('section');
        var navLinks = document.querySelectorAll('nav a');
        var current = "";
        sections.forEach(function(section) {
            var sectionTop = section.offsetTop - 100;
            if (window.pageYOffset >= sectionTop) current = section.getAttribute('id');
        });
        navLinks.forEach(function(link) {
            link.classList.remove('active');
            if (link.getAttribute('href') == '#' + current) link.classList.add('active');
        });
    });

    // 4. Back to Top Button
    var topBtn = el('backToTop');
    if(topBtn) {
        window.addEventListener('scroll', function() {
            if (document.body.scrollTop > 500 || document.documentElement.scrollTop > 500) topBtn.style.display = "block";
            else topBtn.style.display = "none";
        });
        topBtn.addEventListener('click', function() { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    }
    // Disease Warning on Category Select & Consumer Proxy Update
    var diseaseInfo = {
        "Meat & Poultry": "⚠️ High risk of Salmonella, E. coli if not cooked above 75°C.",
        "Seafood": "⚠️ Risk of Mercury, Vibrio bacteria. Ensure proper refrigeration.",
        "Dairy": "⚠️ Listeria & E. coli risk if kept above 5°C.",
        "Street Food": "⚠️ High risk of food poisoning, unhygienic water usage.",
        "Baby Food": "⚠️ Strictly check for added preservatives and heavy metals."
    };
    if (el('p_cat')) {
        el('p_cat').addEventListener('change', function() {
            var catVal = this.value;
            var warningDiv = el('catWarning');
            if (warningDiv) {
                if (diseaseInfo[catVal]) {
                    warningDiv.innerHTML = diseaseInfo[catVal];
                    warningDiv.style.display = 'block';
                } else {
                    warningDiv.style.display = 'none';
                }
            }
            if (el('mlCategorySelect') && el('mlCategorySelect').value !== catVal) {
                el('mlCategorySelect').value = catVal;
            }
            renderDynamicLabFields(catVal);
            if (window.currentMode === 'consumer') {
                var resCard = el('consumerResultCard');
                if (resCard) resCard.style.display = 'none';
                renderDynamicQuestions(catVal);
            }
        });
    }

    if (el('mlCategorySelect')) {
        el('mlCategorySelect').addEventListener('change', function() {
            var catVal = this.value;
            if (catVal !== 'All' && el('p_cat') && el('p_cat').value !== catVal) {
                el('p_cat').value = catVal;
            }
            if (catVal !== 'All') {
                renderDynamicLabFields(catVal);
            }
        });
    }

    // Initial render of dynamic lab fields
    renderDynamicLabFields(el('p_cat') ? el('p_cat').value : 'Dairy');

    var dt = el('darkToggle');
    if (dt) {
        if (localStorage.getItem('theme') === 'dark') { document.documentElement.setAttribute('data-theme', 'dark'); dt.innerHTML = '<i class="fas fa-sun"></i>'; }
        dt.addEventListener('click', function () { if (document.documentElement.getAttribute('data-theme') === 'dark') { document.documentElement.removeAttribute('data-theme'); dt.innerHTML = '<i class="fas fa-moon"></i>'; localStorage.setItem('theme', 'light'); } else { document.documentElement.setAttribute('data-theme', 'dark'); dt.innerHTML = '<i class="fas fa-sun"></i>'; localStorage.setItem('theme', 'dark'); } });
    }

    initRiskChart();
    initLabChart();
    var adulterantData = {
    "milk_water": { name: "Milk - Water Check", method: "Put a drop of milk on a polished slanted surface. Pure milk flows slowly leaving a white trail. Adulterated milk flows immediately without leaving a mark.", warning: "⚠️ If it flows fast, water is mixed." },
    "milk_starch": { name: "Milk - Starch Check", method: "Boil 2-3 ml of milk, cool it, and add 2-3 drops of Iodine solution.", warning: "⚠️ If it turns Blue-Black, starch is present." },
    "oil_argemone": { name: "Oil - Argemone Oil Check", method: "Take oil in a test tube, add concentrated Nitric Acid (HNO3) and shake gently.", warning: "⚠️ If reddish/brown color appears, Argemone oil (highly toxic) is present." },
    "honey_water": { name: "Honey - Water/Sugar Check", method: "Drop honey in a glass of water. Pure honey settles at the bottom forming a lump. Adulterated honey dissolves instantly.", warning: "⚠️ If it dissolves immediately, it has added water or sugar syrup." },
    "spice_wood": { name: "Spices - Wood Dust/Dye Check", method: "Take a small amount of spice in water. Artificial colored spices will immediately release color into the water.", warning: "⚠️ If water turns colored quickly, artificial dyes or sawdust is present." }
};

if(el('adulterant_test')) {
    el('adulterant_test').addEventListener('change', function() {
        var resDiv = el('adulterant_result');
        if(!this.value) { resDiv.style.display = 'none'; return; }
        var d = adulterantData[this.value];
        resDiv.style.display = 'block';
        // Parse method into steps (split on periods)
        var methodSteps = d.method.split(/(?<=\.\s)/).map(function(s){ return s.trim(); }).filter(Boolean);
        var warnSteps = d.warning.replace(/^⚠️?\s*/,'').split(/(?<=\.\s)/).map(function(s){ return s.trim(); }).filter(Boolean);
        resDiv.innerHTML = '<div class="adulteration-result-card">'
            + '<div class="adulterant-header"><i class="fas fa-vial" style="color:var(--primary);"></i><strong>🧪 ' + escapeHtml(d.name) + '</strong></div>'
            + '<div class="adulterant-section"><div class="adulterant-section-title procedure-title"><i class="fas fa-list-ol"></i> Procedure</div>'
            + '<ul class="adulterant-steps procedure-steps">'
            + methodSteps.map(function(s){ return '<li>' + escapeHtml(s) + '</li>'; }).join('')
            + '</ul></div>'
            + '<div class="adulterant-section"><div class="adulterant-section-title warning-title"><i class="fas fa-exclamation-triangle"></i> What to Look For</div>'
            + '<ul class="adulterant-steps warning-steps">'
            + warnSteps.map(function(s){ return '<li>' + escapeHtml(s) + '</li>'; }).join('')
            + '<li>This is a home screening test only. Results should be confirmed by an accredited food laboratory.</li>'
            + '</ul></div>'
            + '</div>';
    });
}
    renderHistory();

    // ============================================================
    //  CONSUMER / LAB MODE SWITCHING
    // ============================================================
    window.currentMode = 'consumer'; // default

    function switchMode(mode) {
        window.currentMode = mode;
        var consumerBtn = el('consumerModeBtn');
        var labBtn = el('labModeBtn');
        var labExtras = el('lab-mode-extras');
        var modeDesc = el('modeDesc');

        if (mode === 'consumer') {
            if (consumerBtn) consumerBtn.classList.add('active');
            if (labBtn) labBtn.classList.remove('active');
            if (labExtras) labExtras.style.display = 'none';
            if (modeDesc) modeDesc.textContent = 'Consumer Mode — Barcode scanning, nutrition label analysis & observable safety questionnaire. No lab instruments required.';
            var currentCat = el('p_cat') ? el('p_cat').value : 'Packaged Snack';
            renderDynamicQuestions(currentCat);
        } else {
            if (labBtn) labBtn.classList.add('active');
            if (consumerBtn) consumerBtn.classList.remove('active');
            if (labExtras) labExtras.style.display = 'block';
            if (modeDesc) modeDesc.textContent = 'Lab / Inspector Mode — Enter measured pH, moisture, and temperature values obtained with appropriate instruments.';
            var pSection = el('proxyQuestionnaireSection');
            if (pSection) pSection.style.display = 'none';
            var cCard = el('consumerResultCard');
            if (cCard) cCard.style.display = 'none';
        }
    }

    if (el('consumerModeBtn')) el('consumerModeBtn').addEventListener('click', function() { switchMode('consumer'); });
    if (el('labModeBtn')) el('labModeBtn').addEventListener('click', function() { switchMode('lab'); });

    // Initialize in consumer mode
    switchMode('consumer');

    // ============================================================
    //  CONSUMER PROXY QUESTIONNAIRE (renderDynamicQuestions)
    // ============================================================

    function renderDynamicQuestions(category) {
        if (!category || typeof category !== 'string') {
            var catEl = el('p_cat');
            category = catEl ? catEl.value : 'Packaged Snack';
        }
        var section = el('proxyQuestionnaireSection');
        if (!section) return;

        // categoryProxyConfig loaded from categoryProxyConfig.js (script tag in HTML)
        if (typeof categoryProxyConfig === 'undefined') {
            section.innerHTML = '<div style="padding:12px; background:#fef2f2; border-radius:8px; color:#b91c1c; margin-top:16px;">⚠️ Category proxy config not loaded. Check that categoryProxyConfig.js is included.</div>';
            section.style.display = 'block';
            return;
        }

        var config = categoryProxyConfig[category];
        if (!config) {
            section.style.display = 'none';
            return;
        }

        var html = '<div class="proxy-question-card">';
        html += '<div class="card-header"><i class="fas fa-clipboard-list" style="color:var(--primary);"></i><h3>Consumer Safety Questionnaire — ' + escapeHtml(category) + '</h3></div>';
        html += '<p style="font-size:0.85rem; color:var(--text-light); margin-bottom:16px;">Answer based on what you can observe or know. No instruments needed.</p>';

        config.questions.forEach(function(q) {
            html += '<div class="proxy-q-item" id="pqi-' + q.id + '">';
            html += '<label class="proxy-q-label" for="pq-' + q.id + '">';
            html += escapeHtml(q.label);
            if (q.optional) html += ' <span class="optional-tag">(optional)</span>';
            html += '</label>';

            if (q.type === 'yesno') {
                html += '<div class="proxy-yesno-group">';
                html += '<button type="button" class="proxy-yesno-btn" id="pq-' + q.id + '-yes" data-qid="' + q.id + '" data-val="yes" onclick="proxyYesNoSelect(this)"><i class="fas fa-check"></i> Yes</button>';
                html += '<button type="button" class="proxy-yesno-btn" id="pq-' + q.id + '-no" data-qid="' + q.id + '" data-val="no" onclick="proxyYesNoSelect(this)">âŒ No</button>';
                html += '<input type="hidden" id="pq-' + q.id + '" data-qid="' + q.id + '" value="">';
                html += '</div>';
            } else if (q.type === 'date') {
                html += '<input type="date" class="form-control" id="pq-' + q.id + '" data-qtype="date" style="max-width:220px;">';
            } else if (q.type === 'days' || q.type === 'hours') {
                var unit = q.type === 'hours' ? 'hours' : 'days';
                html += '<div style="display:flex; align-items:center; gap:10px;">';
                html += '<input type="number" class="form-control" id="pq-' + q.id + '" min="0" step="1" placeholder="Enter number of ' + unit + '" style="max-width:220px;">';
                html += '<span style="font-size:0.9rem; color:var(--text-light);">' + unit + '</span>';
                html += '</div>';
            }
            html += '</div>';
        });

        html += '<div class="btn-group" style="margin-top:20px;">';
        html += '<button type="button" class="btn btn-primary" id="submitProxyCheck"><i class="fas fa-shield-alt"></i> Submit Safety Check</button>';
        html += '</div>';
        html += '</div>'; // end proxy-question-card

        section.innerHTML = html;
        section.style.display = 'block';

        // Attach submit handler
        var submitBtn = el('submitProxyCheck');
        if (submitBtn) {
            submitBtn.addEventListener('click', function() {
                submitConsumerSafetyCheck(category);
            });
        }
    }

    var renderConsumerProxyQuestions = renderDynamicQuestions;
    window.renderDynamicQuestions = renderDynamicQuestions;
    window.renderConsumerProxyQuestions = renderDynamicQuestions;

    // Global helper for yes/no button selection
    window.proxyYesNoSelect = function(btn) {
        var qid = btn.getAttribute('data-qid');
        var val = btn.getAttribute('data-val');
        // Deselect siblings
        document.querySelectorAll('[data-qid="' + qid + '"].proxy-yesno-btn').forEach(function(b) {
            b.classList.remove('selected-yes', 'selected-no');
        });
        btn.classList.add(val === 'yes' ? 'selected-yes' : 'selected-no');
        var hidden = document.getElementById('pq-' + qid);
        if (hidden) hidden.value = val;
    };

    function collectProxyAnswers(category) {
        if (!category || typeof category !== 'string') {
            var catEl = el('p_cat');
            category = catEl ? catEl.value : 'Packaged Snack';
        }
        var config = typeof categoryProxyConfig !== 'undefined' ? categoryProxyConfig[category] : null;
        if (!config) return null;

        var answers = {};
        var allRequired = true;
        config.questions.forEach(function(q) {
            var inputEl = document.getElementById('pq-' + q.id);
            if (!inputEl) return;
            var rawVal = inputEl.value;

            if (!rawVal && !q.optional) {
                allRequired = false;
                inputEl.style.borderColor = '#dc2626';
                inputEl.style.boxShadow = '0 0 0 2px rgba(220,38,38,0.2)';
            } else {
                inputEl.style.borderColor = '';
                inputEl.style.boxShadow = '';
            }

            if (q.type === 'date') {
                if (rawVal) answers[q.id] = daysUntil(rawVal);
            } else if (q.type === 'days' || q.type === 'hours') {
                if (rawVal !== '') answers[q.id] = parseFloat(rawVal) || 0;
            } else {
                answers[q.id] = rawVal; // yesno
            }
        });

        return { answers: answers, valid: allRequired };
    }
    window.collectProxyAnswers = collectProxyAnswers;

    function submitConsumerSafetyCheck(category) {
        if (!category || typeof category !== 'string') {
            var catEl = el('p_cat');
            category = catEl ? catEl.value : 'Packaged Snack';
        }
        if (typeof computeProxyRiskScore === 'undefined' || typeof categoryProxyConfig === 'undefined') {
            showToast('Proxy scoring module not loaded. Ensure categoryProxyConfig.js is included.', 'error');
            return;
        }
        var collected = collectProxyAnswers(category);
        if (!collected) { showToast('No questionnaire config for ' + category, 'error'); return; }
        if (!collected.valid) {
            showToast('Please answer all required questions.', 'warning');
            return;
        }

        var btn = el('submitProxyCheck');
        setButtonLoading(btn, true, 'Evaluating...');
        showToast('Evaluating consumer safety screening...', 'info', 2000);
        try {
        var result = computeProxyRiskScore(category, collected.answers);
        displayConsumerResultCard(category, result);
        showToast('Consumer Safety Screening completed: ' + result.verdict, result.verdict.includes('High') ? 'error' : (result.verdict.includes('Moderate') ? 'warning' : 'success'));
        return result;
        } catch (err) {
            showToast('Consumer safety check failed: ' + (err.message || err), 'error');
        } finally {
            setButtonLoading(btn, false);
        }
    }
    window.submitConsumerSafetyCheck = submitConsumerSafetyCheck;


    function displayConsumerResultCard(category, result) {
        var cardDiv = el('consumerResultCard');
        if (!cardDiv) return;

        var score = result.score;
        var verdict = result.verdict; // 'Safe', 'Caution', 'Unsafe'
        var breakdown = result.breakdown || {};

        // Determine risk class
        var riskClass, verdictClass, verdictLabel, verdictIcon;
        if (verdict === 'Safe' || score < 30) {
            riskClass = 'risk-low'; verdictClass = 'verdict-low';
            verdictLabel = 'LOW RISK';
            verdictIcon = '<i class="fas fa-check-circle" style="color:#16a34a;"></i>';
        } else if (verdict === 'Caution' || score < 60) {
            riskClass = 'risk-medium'; verdictClass = 'verdict-medium';
            verdictLabel = 'MODERATE RISK';
            verdictIcon = '<i class="fas fa-exclamation-circle" style="color:#d97706;"></i>';
        } else {
            riskClass = 'risk-high'; verdictClass = 'verdict-high';
            verdictLabel = 'HIGH RISK';
            verdictIcon = '<i class="fas fa-times-circle" style="color:#dc2626;"></i>';
        }

        // Build breakdown HTML
        var axisLabels = { time: 'Time / Expiry', coldChain: 'Cold Chain / Storage', physical: 'Physical Condition' };
        var axisClasses = { time: 'axis-time', coldChain: 'axis-coldchain', physical: 'axis-physical' };
        var breakdownHtml = '<div class="proxy-breakdown">';
        Object.keys(breakdown).forEach(function(qid) {
            var config = typeof categoryProxyConfig !== 'undefined' ? categoryProxyConfig[category] : null;
            if (!config) return;
            var q = config.questions.find(function(q) { return q.id === qid; });
            if (!q) return;
            var axisKey = q.axis;
            var axisLabel = axisLabels[axisKey] || axisKey;
            var axisClass = axisClasses[axisKey] || '';
            breakdownHtml += '<div class="proxy-breakdown-item ' + axisClass + '">';
            breakdownHtml += '<div class="axis-name">' + escapeHtml(axisLabel) + '</div>';
            breakdownHtml += '<div class="axis-value">' + (breakdown[qid] > 0 ? '⚠️ Risk: ' + breakdown[qid] : '✓ OK') + '</div>';
            breakdownHtml += '</div>';
        });
        breakdownHtml += '</div>';

        var html = '<div class="consumer-result-card">';

        // Header
        html += '<div class="consumer-result-header">';
        html += verdictIcon;
        html += '<div><h3>Consumer Screening Result</h3><p>Category: <strong>' + escapeHtml(category) + '</strong></p></div>';
        html += '</div>';

        // Score + verdict
        html += '<div class="consumer-score-display">';
        html += '<div class="consumer-score-circle ' + riskClass + '">';
        html += '<span class="score-num">' + score + '</span>';
        html += '<span class="score-label">/ 100</span>';
        html += '</div>';
        html += '<div>';
        html += '<div class="consumer-verdict-label ' + verdictClass + '">' + verdictLabel + '</div>';
        html += '<div style="font-size:0.85rem; color:var(--text-light); margin-top:6px;">Based on ' + Object.keys(breakdown).length + ' answered questionnaire items</div>';
        html += '</div>';
        html += '</div>';

        // Breakdown
        if (Object.keys(breakdown).length > 0) html += breakdownHtml;

        // Procedure (what was checked)
        html += '<div class="consumer-procedure">';
        html += '<h5><i class="fas fa-clipboard-check"></i> Checks Performed</h5>';
        html += '<ul>';
        var checkedItems = [];
        if (typeof categoryProxyConfig !== 'undefined' && categoryProxyConfig[category]) {
            categoryProxyConfig[category].questions.forEach(function(q) {
                if (breakdown[q.id] !== undefined || !q.optional) {
                    checkedItems.push(q.label);
                }
            });
        }
        checkedItems.forEach(function(item) {
            html += '<li>' + escapeHtml(item) + '</li>';
        });
        html += '</ul></div>';

        // Warning disclaimer
        html += '<div class="consumer-warning">';
        html += '<h5><i class="fas fa-exclamation-triangle"></i> Important Limitations</h5>';
        html += '<ul>';
        html += '<li>This is a consumer-level screening result based on provided information only.</li>';
        html += '<li>It does not replace laboratory testing or official food-safety inspection.</li>';
        html += '<li>If the product shows spoilage, damaged packaging, or unusual smell / appearance — do not consume it regardless of the score.</li>';
        html += '<li>Laboratory testing is recommended for regulatory compliance or when in doubt.</li>';
        html += '</ul></div>';

        html += '</div>'; // end consumer-result-card

        cardDiv.innerHTML = html;
        cardDiv.style.display = 'block';
        cardDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }



    // ======================
// DOWNLOAD BATCH RESULTS
// ======================

window.downloadBatchCSV = function() {
    if (!window.lastBatchCSV) {
        showToast("No analysis data available to download.", "warning");
        return;
    }
    
    try {
        var blob = new Blob([window.lastBatchCSV], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement('a');
        var url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', 'batch_analysis_results.csv');
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showToast("Batch CSV exported successfully!", "success");
    } catch (err) {
        console.error("Download failed:", err);
        showToast("Download failed. Please check console.", "error");
    }
};

}); // END
// ==================== AUTH MODAL LOGIC ====================
(function () {
  const API_BASE = (window.API_BASE || 'http://localhost:5000') + '/api';

  const authModal = document.getElementById('authModal');
  const loginBtn = document.getElementById('loginBtn');
  const closeAuthModal = document.getElementById('closeAuthModal');
  const tabLogin = document.getElementById('tabLogin');
  const tabSignup = document.getElementById('tabSignup');
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const loginError = document.getElementById('loginError');
  const signupError = document.getElementById('signupError');

  if (!authModal || !loginBtn || !closeAuthModal || !tabLogin || !tabSignup || !loginForm || !signupForm) {
    return;
  }

  // Login button: opens modal if logged out, logs out if logged in
if (loginBtn) {
  loginBtn.addEventListener('click', function () {
    const token = localStorage.getItem('fs_token');
    if (token) {
      if (confirm('Logout?')) {
        localStorage.removeItem('fs_token');
        localStorage.removeItem('fs_username');
        loginBtn.innerHTML = '<i class="fas fa-user"></i> Login';
      }
    } else {
      authModal.classList.add('show');
    }
  });
}

  // Close modal
  if (closeAuthModal) {
    closeAuthModal.addEventListener('click', function () {
      authModal.classList.remove('show');
    });
  }

  // Close modal if clicked outside the card
  authModal.addEventListener('click', function (e) {
    if (e.target === authModal) {
      authModal.classList.remove('show');
    }
  });

  // Tab switching
  tabLogin.addEventListener('click', function () {
    loginForm.style.display = 'block';
    signupForm.style.display = 'none';
    tabLogin.style.borderBottom = '3px solid var(--primary)';
    tabLogin.style.color = 'var(--primary)';
    tabSignup.style.borderBottom = 'none';
    tabSignup.style.color = 'var(--text-light)';
  });

  tabSignup.addEventListener('click', function () {
    signupForm.style.display = 'block';
    loginForm.style.display = 'none';
    tabSignup.style.borderBottom = '3px solid var(--primary)';
    tabSignup.style.color = 'var(--primary)';
    tabLogin.style.borderBottom = 'none';
    tabLogin.style.color = 'var(--text-light)';
  });

  // Update login button text if already logged in
  function updateLoginButtonUI() {
    const token = localStorage.getItem('fs_token');
    const username = localStorage.getItem('fs_username');
    if (token && loginBtn) {
      loginBtn.innerHTML = '<i class="fas fa-user-check"></i> ' + username + ' (Logout)';
    }
  }

  // Login form submit
  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    loginError.textContent = '';

    const email = document.getElementById('login_email').value;
    const password = document.getElementById('login_password').value;
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    if (typeof setButtonLoading === 'function') setButtonLoading(submitBtn, true, 'Logging in...');

    try {
      const res = await fetch(API_BASE + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();

      if (!res.ok) {
        loginError.textContent = data.message || 'Login failed';
        return;
      }

      localStorage.setItem('fs_token', data.token);
      localStorage.setItem('fs_username', data.user.username);
      updateLoginButtonUI();
      authModal.classList.remove('show');
      showToast('Login successful! Welcome ' + data.user.username, 'success');
    } catch (err) {
      loginError.textContent = 'Server error. Is the backend running?';
    } finally {
      if (typeof setButtonLoading === 'function') setButtonLoading(submitBtn, false);
    }
  });

  // Signup form submit
  signupForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    signupError.textContent = '';

    const username = document.getElementById('signup_username').value;
    const email = document.getElementById('signup_email').value;
    const password = document.getElementById('signup_password').value;
    const submitBtn = signupForm.querySelector('button[type="submit"]');
    if (typeof setButtonLoading === 'function') setButtonLoading(submitBtn, true, 'Signing up...');

    try {
      const res = await fetch(API_BASE + '/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });
      const data = await res.json();

      if (!res.ok) {
        signupError.textContent = data.message || 'Signup failed';
        return;
      }

      localStorage.setItem('fs_token', data.token);
      localStorage.setItem('fs_username', data.user.username);
      updateLoginButtonUI();
      authModal.classList.remove('show');
      showToast('Signup successful! Welcome ' + data.user.username, 'success');
    } catch (err) {
      signupError.textContent = 'Server error. Is the backend running?';
    } finally {
      if (typeof setButtonLoading === 'function') setButtonLoading(submitBtn, false);
    }
  });



  updateLoginButtonUI();
})();
