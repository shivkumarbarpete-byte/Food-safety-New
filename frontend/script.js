

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
        var verdict = 'Moderate Risk Based on Available Information', badge = 'badge-warn';
        if (score <= 30) { verdict = 'Low Risk Based on Available Information'; badge = 'badge-safe'; } 
        else if (score >= 70) { verdict = 'Higher Risk Based on Available Information'; badge = 'badge-risk'; }

        var breakdown = {
            Nutrition: nutScorePenalty,
            Additives: additiveCount * 6,
            Expiry: exp ? (expStatus.startsWith('Expired') ? 40 : (expStatus.startsWith('Near') ? 15 : 0)) : 5,
            Temp: tempStatus === 'Out of Range' ? 18 : 0,
            Origin: origin === 'India' ? 0 : 5
        };

        if (score > 70) notes.push("⚠️ Higher risk based on available information"); 
        else if (score > 40) notes.push("⚠️ Moderate risk based on available information"); 
        else notes.push("✅ Low risk based on available information");

        return {
            name: name, cat: cat, expStatus: expStatus, allergenCount: allergenCount,
            additiveCount: additiveCount, notes: notes, score: score, badge: badge,
            verdict: verdict, breakdown: breakdown, originStatus: originStatus,
            tempStatus: tempStatus, fopWarnings: fopW, pH: pH, moisture: moisture,
            temperature: temperature, dataOrigin: dataOrigin, missingFields: missingFields
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
        var r = analyze();
        if (el('k_overall')) el('k_overall').textContent = r.score + ' / 100';
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
        var v = el('verdict'); if (v) { v.textContent = r.verdict + ' (' + r.score + ')'; v.className = 'badge ' + r.badge; }
        var fd = el('fopWarnings'); if (fd) { if (r.fopWarnings.length) { fd.innerHTML = '🚨 ' + r.fopWarnings.join(' • '); fd.style.display = 'block'; } else fd.style.display = 'none'; }
        if (riskChart) { riskChart.data.labels = Object.keys(r.breakdown); riskChart.data.datasets[0].data = Object.values(r.breakdown); riskChart.update(); }
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
        var res = await fetch('http://localhost:5000/api/reviews', {
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
            safe: r.verdict === 'Safe' ? 1 : 0,
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
        if (!window.jspdf) { showToast('jsPDF library not loaded', 'error'); return; } 
        var r = analyze(); 
        var doc = new window.jspdf.jsPDF(); 
        doc.setFontSize(14); 
        doc.text('Preliminary Risk Assessment Report', 14, 20); 
        doc.setFontSize(10); 
        doc.text('Product: ' + (r.name || '?'), 14, 30); 
        doc.text('Category: ' + (r.cat || '?'), 14, 37); 
        doc.text('Data Origin: ' + (r.dataOrigin || 'User Input'), 14, 44); 
        doc.text('Verdict: ' + r.verdict + ' (' + r.score + '/100)', 14, 51); 
        
        doc.text('Analysis Findings:', 14, 62); 
        var y = 70; 
        r.notes.forEach(function (n) { 
            if (y > 260) { doc.addPage(); y = 20; } 
            doc.text('- ' + n, 18, y); 
            y += 7; 
        }); 
        
        y += 10; 
        if (y > 250) { doc.addPage(); y = 20; } 
        doc.setFontSize(8); 
        doc.setTextColor(100); 
        doc.text('DISCLAIMER: This is a preliminary screening assessment based on available product information.', 14, y); 
        doc.text('It is not a laboratory test or regulatory certification.', 14, y + 5); 
        doc.text('Assessment accuracy depends on the quality and completeness of the input data.', 14, y + 10); 
        
        doc.save('preliminary_risk_report.pdf'); 
    }

    function stdNormCDF(x) { var t = 1 / (1 + 0.2316419 * Math.abs(x)); var d = 0.3989423 * Math.exp(-x * x / 2); var p = 1 - d * t * (1.330274429 + t * (-1.821255978 + t * (1.781477937 + t * (-0.356563782 + t * 0.319381530)))); return x >= 0 ? p : 1 - p; }

    function studentTCDF(x, v) {
        function betacf(x, a, b) { var MAXIT = 100, EPS = 3e-7, FPMIN = 1e-30, qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; var h = d; for (var m = 1, m2 = 2; m <= MAXIT; m++, m2 += 2) { var aa = m * (b - m) * x / ((qam + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c; aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2)); d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c; if (Math.abs(d * c - 1) < EPS) break; } return h; }
        function gammaln(z) { var cof = [76.18, -86.5, 24.01, -1.23, 0.0012, -5.3e-6]; var x = z, y = z, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp); var ser = 1.000000000190015; for (var j = 0; j < 6; j++) { y += 1; ser += cof[j] / y; } return -tmp + Math.log(2.5066 * ser / x); }
        function betai(x, a, b) { var bt = (x === 0 || x === 1) ? 0 : Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x)); if (x < (a + 1) / (a + b + 2)) return bt * betacf(x, a, b) / a; else return 1 - bt * betacf(1 - x, b, a) / b; }
        return 0.5 * betai(v / (v + x * x), v / 2, 0.5);
    }

    function runLabTest() {
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
        if (!data.length || isNaN(L)) { 
            out.innerHTML = '<li>Enter valid numeric measurements and reference limit.</li>'; 
            if (summary) { summary.textContent = 'Invalid Data'; summary.className = 'badge badge-risk'; } 
            return; 
        }
        if (data.length < 2) { out.innerHTML = '<li>Need at least 2 numeric measurements for statistical analysis.</li>'; return; }

        var n = data.length, mean = data.reduce(function (a, b) { return a + b; }, 0) / n;
        var sd = isNaN(sigma) ? Math.sqrt(data.reduce(function (a, x) { return a + (x - mean) * (x - mean); }, 0) / (n - 1)) : sigma;
        var se = sd / Math.sqrt(n);
        var z = (mean - L) / se;
        var useZ = !isNaN(sigma);
        var p = useZ ? (1 - stdNormCDF(z)) : (1 - studentTCDF(z, n - 1));

        if (el('lab_n')) el('lab_n').textContent = n;
        if (el('lab_mean')) el('lab_mean').textContent = mean.toFixed(2) + ' ' + unit;
        if (el('lab_sd')) el('lab_sd').textContent = sd.toFixed(2) + ' ' + unit;

        var dec = p < alpha ? 'Exceeds Reference Limit (p < α)' : 'Within Reference Limit (p ≥ α)';
        if (summary) { 
            summary.textContent = dec; 
            summary.className = 'badge ' + (p < alpha ? 'badge-risk' : 'badge-safe'); 
        }

        var sourceText = sourceType + (sourceDesc ? ' (' + escapeHtml(sourceDesc) + ')' : '');
        var interpretation = p < alpha ? 
            'Statistically significant evidence that sample mean exceeds reference limit (' + escapeHtml(param) + ' > ' + L + ' ' + escapeHtml(unit) + ', p = ' + p.toFixed(4) + ' < α = ' + alpha + ').' :
            'No statistically significant evidence that sample mean exceeds reference limit (' + escapeHtml(param) + ' ≤ ' + L + ' ' + escapeHtml(unit) + ', p = ' + p.toFixed(4) + ' ≥ α = ' + alpha + ').';

        [
            '<strong>Parameter Name:</strong> ' + escapeHtml(param) + ' (' + escapeHtml(unit) + ')',
            '<strong>Sample Measurements:</strong> ' + data.join(', ') + ' ' + escapeHtml(unit),
            '<strong>Sample Size (n):</strong> ' + n + ' | <strong>Sample Mean (x̄):</strong> ' + mean.toFixed(2) + ' ' + escapeHtml(unit),
            '<strong>Reference Limit (L):</strong> ' + L + ' ' + escapeHtml(unit) + ' <small style="color:#6b7280;">[' + escapeHtml(sourceText) + ']</small>',
            '<strong>Statistical Test:</strong> ' + (useZ ? 'Z-Test (known σ = ' + sigma + ')' : 'T-Test (sample s = ' + sd.toFixed(2) + ')'),
            '<strong>Standard Error (SE):</strong> ' + se.toFixed(2) + ' | <strong>Test Statistic (' + (useZ ? 'z' : 't') + '):</strong> ' + z.toFixed(2),
            '<strong>p-value:</strong> ' + p.toFixed(4) + ' (Alpha level α = ' + alpha + ', Confidence Level = ' + Math.round((1 - alpha) * 100) + '%)',
            '<strong>Statistical Interpretation:</strong> ' + interpretation
        ].forEach(function (s) { 
            var li = document.createElement('li'); 
            li.innerHTML = s; 
            out.appendChild(li); 
        });

        initLabChart(mean, L);
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
        var res = await fetch('http://localhost:5000/api/reviews', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        var arr = await res.json();
        if (!res.ok) return;

        var safe = arr.filter(function (r) { return r.verdict === 'Safe'; }).length;
        var unsafe = arr.filter(function (r) { return r.verdict === 'Unsafe'; }).length;
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
        var res = await fetch('http://localhost:5000/api/reviews', {
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
        var res = await fetch('http://localhost:5000/api/reviews', {
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

    function clearMLResults() {
        var mlOutput = el('ml-output');
        var mlResultsDiv = el('ml-results');
        if (mlOutput) mlOutput.innerHTML = '';
        if (mlResultsDiv) mlResultsDiv.style.display = 'none';
        if (mlChart) { mlChart.destroy(); mlChart = null; }
        if (el('currentExplain')) el('currentExplain').textContent = '';
    }

  async function getRealDataset() {
    var token = localStorage.getItem('fs_token');
    if (!token) { showToast('Please login to use real data for ML!', 'warning'); return []; }

    try {
        var res = await fetch('http://localhost:5000/api/reviews', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        var reviews = await res.json();
        if (!res.ok) return [];

        var validData = reviews.filter(function (r) {
            return r.pH != null && r.moisture != null && r.temperature != null && r.safe != null;
        }).map(function (r) {
            return { pH: r.pH, moisture: r.moisture, temperature: r.temperature, safe: r.safe, score: r.score };
        });

        return validData;
    } catch (err) {
        console.error('Failed to fetch real dataset', err);
        return [];
    }
}
    function normalizeFeatures(data) {
        var keys = ['pH', 'moisture', 'temperature'];
        var means = {}, stds = {};
        keys.forEach(function (key) {
            var vals = data.map(function (d) { return d[key]; });
            var mean = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
            var std = Math.sqrt(vals.reduce(function (a, x) { return a + (x - mean) * (x - mean); }, 0) / vals.length) || 1;
            means[key] = mean;
            stds[key] = std;
        });
        return data.map(function (d) {
            return {
                pH: (d.pH - means.pH) / stds.pH,
                moisture: (d.moisture - means.moisture) / stds.moisture,
                temperature: (d.temperature - means.temperature) / stds.temperature,
                safe: d.safe,
                score: d.score
            };
        });
    }

    // ===== EDA - Full Calculation Visible =====
  async function runEDA() {
    clearMLResults();
    if (el('currentExplain')) el('currentExplain').textContent = 'Exploratory Data Analysis: A quick summary of your saved products before running any prediction model.';
    showMLResult("📊 DATA SUMMARY", true);
    var btn = el('runEDA');
    setButtonLoading(btn, true, 'Running EDA...');
    try {
    var data = await getRealDataset();
    // Show sample count disclaimer if N < 15
    if (el('mlSampleDisclaimer')) {
        el('mlSampleDisclaimer').style.display = data.length < 15 ? 'block' : 'none';
        if (data.length < 15) el('mlSampleDisclaimer').innerHTML = '<i class="fas fa-exclamation-triangle"></i> <strong>Experimental:</strong> k-NN and ML results are based on only <strong>' + data.length + ' stored laboratory samples</strong>. Reliability may be limited until more measured samples are collected (recommended: ≥ 15).';
    }
    if (data.length < 3) {
        showMLResult('⚠️ Not enough saved reviews. Save at least 3 reviews with pH/moisture/temperature first.', true);
        return;
    }

    var safeCount = data.filter(function (d) { return d.safe === 1; }).length;
    var unsafeCount = data.filter(function (d) { return d.safe === 0; }).length;

    showMLResult("You have " + data.length + " saved products with ML data: " + safeCount + " marked Safe, " + unsafeCount + " marked Unsafe.\n");

    showMLResult("━━━━━━━━━━━━━━━━━━━━━━━━━━", false);
    showMLResult("\n📈 AVERAGE VALUES:", true);

    ['pH', 'moisture', 'temperature'].forEach(function (key) {
        var vals = data.map(function (d) { return d[key]; });
        var mean = (vals.reduce(function (a, b) { return a + b; }, 0) / vals.length).toFixed(2);
        var min = Math.min.apply(null, vals).toFixed(1);
        var max = Math.max.apply(null, vals).toFixed(1);
        var label = key === 'pH' ? 'pH' : (key === 'moisture' ? 'Moisture (%)' : 'Temperature (°C)');
        showMLResult(label + ":  Average = " + mean + "  |  Range = " + min + " to " + max);
    });

    showMLResult("\n💡 This gives you a quick picture of your data before running the prediction models below.", false);

    // Chart
    var ctx = el('mlChart');
    if (!ctx) return;
    ctx = ctx.getContext('2d');
    if (mlChart) mlChart.destroy();

    mlChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Safe Products',
                    data: data.filter(function (d) { return d.safe === 1; }).map(function (d) { return { x: d.pH, y: d.moisture }; }),
                    backgroundColor: '#16a34a',
                    pointRadius: 8
                },
                {
                    label: 'Unsafe Products',
                    data: data.filter(function (d) { return d.safe === 0; }).map(function (d) { return { x: d.pH, y: d.moisture }; }),
                    backgroundColor: '#dc2626',
                    pointRadius: 8
                }
            ]
        },
        options: {
            scales: {
                x: { title: { display: true, text: 'pH Value' } },
                y: { title: { display: true, text: 'Moisture (%)' } }
            },
            plugins: {
                legend: { position: 'top' },
                title: { display: true, text: 'Your Products: pH vs Moisture' }
            }
        }
    });
    } finally { setButtonLoading(el('runEDA'), false); }
}

    // ===== LINEAR REGRESSION - Full Calculation =====
async function runLinearRegression() {
    if (typeof tf === 'undefined') { showToast('TensorFlow.js not loaded', 'error'); return; }
    clearMLResults();
    if (el('currentExplain')) el('currentExplain').textContent = 'Linear Regression: Learns a formula to estimate the risk SCORE (0-100) from pH, Moisture, and Temperature.';
    showMLResult("📈 LINEAR REGRESSION — Predicting Risk Score", true);
    var btn = el('runLinear');
    setButtonLoading(btn, true, 'Training...');
    try {
    var data = await getRealDataset();
    if (data.length < 3) {
        showMLResult('⚠️ Not enough saved reviews. Save at least 3 reviews with pH/moisture/temperature first.', true);
        return;
    }

    showMLResult("Training on " + data.length + " of your saved products to learn how pH, Moisture, and Temperature relate to your risk score.\n");

    var normalizedData = normalizeFeatures(data);
    var xs = tf.tensor2d(normalizedData.map(function (d) { return [d.pH, d.moisture, d.temperature]; }));
    var ys = tf.tensor2d(normalizedData.map(function (d) { return [d.score]; }));

    var model = tf.sequential();
    model.add(tf.layers.dense({ units: 1, inputShape: [3], activation: 'linear' }));
    model.compile({ loss: 'meanSquaredError', optimizer: tf.train.adam(0.1) });

    showMLResult("Training model...", false);
    var finalLoss = 0;
    await model.fit(xs, ys, {
        epochs: 200,
        shuffle: true,
        callbacks: { onEpochEnd: function (epoch, logs) { finalLoss = logs.loss; } }
    });

    showMLResult("\n━━━━━━━━━━━━━━━━━━━━━━━━━━", false);
    showMLResult("\n✅ RESULT:", true);
    showMLResult("Average prediction error: ±" + Math.sqrt(finalLoss).toFixed(1) + " points (out of 100)");

    var weights = model.layers[0].getWeights()[0].arraySync().flat();

    showMLResult("\n📌 WHAT INFLUENCES THE RISK SCORE MOST (based on your data):", true);
    var influences = [
        { name: 'pH', w: weights[0] },
        { name: 'Moisture', w: weights[1] },
        { name: 'Temperature', w: weights[2] }
    ].sort(function (a, b) { return Math.abs(b.w) - Math.abs(a.w); });

    influences.forEach(function (inf) {
        var direction = inf.w > 0 ? 'increases risk' : 'decreases risk';
        showMLResult("  " + inf.name + " — " + direction + " (strength: " + Math.abs(inf.w).toFixed(2) + ")");
    });

    showMLResult("\n💡 Note: this is based on only " + data.length + " samples — save more reviews for a more reliable formula.", false);

    xs.dispose();
    ys.dispose();
    model.dispose();
    } finally { setButtonLoading(el('runLinear'), false); }
}

    // ===== LOGISTIC REGRESSION - Full Calculation =====
  async function runLogisticBase(title, l2, l1, btnId) {
    if (typeof tf === 'undefined') { showToast('TensorFlow.js not loaded', 'error'); return; }
    clearMLResults();
    if (el('currentExplain')) {
        if (l2) el('currentExplain').textContent = 'Ridge Regression (L2): Classifies Safe/Unsafe with a penalty that keeps the model from relying too heavily on any one feature.';
        else if (l1) el('currentExplain').textContent = 'Lasso Regression (L1): Classifies Safe/Unsafe with a penalty that can shrink less-useful features toward zero.';
        else el('currentExplain').textContent = 'Logistic Regression: Classifies each product as Safe or Unsafe based on pH, Moisture, and Temperature.';
    }
    showMLResult("🧠 " + title, true);
    var btn = btnId ? el(btnId) : null;
    setButtonLoading(btn, true, 'Training...');
    try {
    var data = await getRealDataset();
    if (data.length < 3) {
        showMLResult('⚠️ Not enough saved reviews. Save at least 3 reviews with pH/moisture/temperature first.', true);
        return;
    }

    var safeCount = data.filter(function (d) { return d.safe === 1; }).length;
    var unsafeCount = data.filter(function (d) { return d.safe === 0; }).length;

    if (safeCount === 0 || unsafeCount === 0) {
        showMLResult('⚠️ You need at least 1 Safe AND 1 Unsafe saved product to train a classifier. Currently: ' + safeCount + ' Safe, ' + unsafeCount + ' Unsafe.', true);
        return;
    }

    showMLResult("Training on " + data.length + " products (" + safeCount + " Safe, " + unsafeCount + " Unsafe)\n");

    var normalizedData = normalizeFeatures(data);
    var xs = tf.tensor2d(normalizedData.map(function (d) { return [d.pH, d.moisture, d.temperature]; }));
    var ys = tf.tensor2d(normalizedData.map(function (d) { return [d.safe]; }));

    var reg = l2 ? tf.regularizers.l2({ l2: l2 }) : (l1 ? tf.regularizers.l1({ l1: l1 }) : null);
    var model = tf.sequential();
    model.add(tf.layers.dense({ units: 1, inputShape: [3], activation: 'sigmoid', kernelRegularizer: reg }));
    model.compile({ loss: 'binaryCrossentropy', optimizer: tf.train.adam(0.08), metrics: ['accuracy'] });

    showMLResult("Training model...", false);
    var finalAcc = 0;
    await model.fit(xs, ys, {
        epochs: 150,
        shuffle: true,
        callbacks: { onEpochEnd: function (epoch, logs) { finalAcc = logs.acc; } }
    });

    showMLResult("\n━━━━━━━━━━━━━━━━━━━━━━━━━━", false);
    showMLResult("\n✅ RESULT:", true);
    showMLResult("Accuracy on your own data: " + (finalAcc * 100).toFixed(0) + "%");

    var weights = model.layers[0].getWeights()[0].arraySync().flat();
    showMLResult("\n📌 WHAT INFLUENCES SAFE vs UNSAFE MOST:", true);
    var influences = [
        { name: 'pH', w: weights[0] },
        { name: 'Moisture', w: weights[1] },
        { name: 'Temperature', w: weights[2] }
    ].sort(function (a, b) { return Math.abs(b.w) - Math.abs(a.w); });

    influences.forEach(function (inf) {
        var direction = inf.w > 0 ? 'higher value → more likely Safe' : 'higher value → more likely Unsafe';
        showMLResult("  " + inf.name + " — " + direction);
    });

    if (l2) showMLResult("\n💡 L2 penalty keeps all features balanced, reducing overfitting risk.", false);
    if (l1) showMLResult("\n💡 L1 penalty can shrink weak features toward zero, highlighting only the strongest signals.", false);
    showMLResult("\nNote: with only " + data.length + " samples, treat this accuracy as a rough indicator, not a final measure.", false);

    xs.dispose();
    ys.dispose();
    model.dispose();
    } finally { setButtonLoading(btn, false); }
}

    async function runLogistic() { await runLogisticBase("LOGISTIC REGRESSION", 0, 0, 'runLogistic'); }
    async function runRidge() { await runLogisticBase("RIDGE REGRESSION (L2)", 0.01, 0, 'runRidge'); }
    async function runLasso() { await runLogisticBase("LASSO REGRESSION (L1)", 0, 0.01, 'runLasso'); }

    // ===== HISTOGRAMS  =====
  async function showHistograms() {
    clearMLResults();
    if (el('currentExplain')) el('currentExplain').textContent = 'Feature Histograms: Comparing average pH, moisture, and temperature between your Safe and Unsafe saved products.';
    showMLResult("📊 FEATURE COMPARISON — Safe vs Unsafe Products", true);
    var btn = el('runHist');
    setButtonLoading(btn, true, 'Analyzing...');
    try {
    var data = await getRealDataset();
    if (data.length < 3) {
        showMLResult('⚠️ Not enough saved reviews. Save at least 3 reviews with pH/moisture/temperature first (mix of Safe and Unsafe).', true);
        return;
    }

    var safe = data.filter(function (d) { return d.safe === 1; });
    var unsafe = data.filter(function (d) { return d.safe === 0; });

    showMLResult("Based on " + data.length + " of your saved products (" + safe.length + " marked Safe, " + unsafe.length + " marked Unsafe)\n");

    if (safe.length === 0 || unsafe.length === 0) {
        showMLResult("⚠️ You need at least 1 Safe AND 1 Unsafe saved product to compare groups. Right now you only have one type.", true);
        return;
    }

    showMLResult("━━━━━━━━━━━━━━━━━━━━━━━━━━", false);
    showMLResult("\n📋 WHAT THIS MEANS:", true);
    showMLResult("For each measurement (pH, Moisture, Temperature), we take the AVERAGE value across your Safe products and compare it to the average across your Unsafe products.");
    showMLResult("A bigger difference between the two averages means that measurement is a stronger clue for telling Safe and Unsafe products apart.\n");

    showMLResult("━━━━━━━━━━━━━━━━━━━━━━━━━━", false);
    showMLResult("\n📈 YOUR RESULTS:", true);

    var diffs = {};
    ['pH', 'moisture', 'temperature'].forEach(function (key) {
        var safeVals = safe.map(function (d) { return d[key]; });
        var unsafeVals = unsafe.map(function (d) { return d[key]; });
        var safeAvg = safeVals.reduce(function (a, b) { return a + b; }, 0) / safeVals.length;
        var unsafeAvg = unsafeVals.reduce(function (a, b) { return a + b; }, 0) / unsafeVals.length;
        var diff = Math.abs(safeAvg - unsafeAvg);
        diffs[key] = diff;

        var label = key === 'pH' ? 'pH' : (key === 'moisture' ? 'Moisture (%)' : 'Temperature (°C)');
        showMLResult("\n" + label + ":");
        showMLResult("  Your Safe products average:   " + safeAvg.toFixed(2));
        showMLResult("  Your Unsafe products average: " + unsafeAvg.toFixed(2));
        showMLResult("  Difference: " + diff.toFixed(2) + (diff > (safeAvg + unsafeAvg) / 2 * 0.1 ? "  → Noticeable difference" : "  → Small difference"));
    });

    var strongest = Object.keys(diffs).reduce(function (a, b) { return diffs[a] > diffs[b] ? a : b; });
    var strongestLabel = strongest === 'pH' ? 'pH' : (strongest === 'moisture' ? 'Moisture' : 'Temperature');

    showMLResult("\n━━━━━━━━━━━━━━━━━━━━━━━━━━", false);
    showMLResult("\n🔍 TAKEAWAY:", true);
    showMLResult("Based on your saved data so far, " + strongestLabel + " shows the biggest difference between Safe and Unsafe products — meaning it's currently your strongest signal for prediction.");
    showMLResult("(Note: with only " + data.length + " saved samples, this is a rough signal, not a statistically proven result. It will get more reliable as you save more reviews.)");

    // Chart
    var ctx = el('mlChart');
    if (!ctx) return;
    ctx = ctx.getContext('2d');
    if (mlChart) mlChart.destroy();

    mlChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['pH', 'Moisture (%)', 'Temperature (°C)'],
            datasets: [
                {
                    label: 'Safe Products (n=' + safe.length + ')',
                    data: [
                        safe.reduce(function (a, b) { return a + b.pH; }, 0) / safe.length,
                        safe.reduce(function (a, b) { return a + b.moisture; }, 0) / safe.length,
                        safe.reduce(function (a, b) { return a + b.temperature; }, 0) / safe.length
                    ],
                    backgroundColor: '#16a34a',
                    borderColor: '#15803d',
                    borderWidth: 2
                },
                {
                    label: 'Unsafe Products (n=' + unsafe.length + ')',
                    data: [
                        unsafe.reduce(function (a, b) { return a + b.pH; }, 0) / unsafe.length,
                        unsafe.reduce(function (a, b) { return a + b.moisture; }, 0) / unsafe.length,
                        unsafe.reduce(function (a, b) { return a + b.temperature; }, 0) / unsafe.length
                    ],
                    backgroundColor: '#dc2626',
                    borderColor: '#b91c1c',
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { font: { size: 13 } } },
                title: {
                    display: true,
                    text: 'Your Saved Products: Safe vs Unsafe Averages',
                    font: { size: 15, weight: 'bold' }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Average Value', font: { size: 12 } }
                }
            }
        }
    });

    showMLResult("\n✅ Chart generated above — bars closer together mean less distinction, further apart means clearer separation.", false);
    } finally { setButtonLoading(el('runHist'), false); }
}

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
                if (dark > 5 || white > 2) checks.push("✓ Text detected"); else checks.push("⚠ Little text");
                if (canvas.width > 150) checks.push("✓ Resolution " + canvas.width + "x" + canvas.height); else checks.push("✗ Low resolution");

                resolve({ isFood: isFood, topCat: topCat, secondCat: secondCat, confidence: confidence, veg: veg, checks: checks });
            };
            img.onerror = function () { resolve({ isFood: false, topCat: "Unknown", secondCat: "Unknown", confidence: 0, veg: "Unknown", checks: ["✗ Invalid image"] }); };
            img.src = imageDataUrl;
        });
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

                                realImageAnalysis(imageDataUrl).then(function (r) {
                    var imgRes = el('imageResult');

                    if (!r.isFood) {
                    
                        if(imgRes) {
                            imgRes.style.display = 'block';
                            imgRes.style.background = '#fef2f2';
                            imgRes.style.borderColor = '#dc2626';
                            imgRes.innerHTML = '<strong style="color:#dc2626;">❌ Not a Food Label</strong><br><small>' + r.checks.join(' | ') + '</small><br><small>💡 Upload front of food package with clear label</small>';
                        }
                        previewDiv.innerHTML = '<div style="padding:20px; background:#fef2f2; border:2px solid #dc2626; border-radius:8px; color:#b91c1c; text-align:center;">❌ Not a food label. Try again.</div>';
                        return;
                    }

                
                    if(imgRes) {
                        imgRes.style.display = 'block';
                        imgRes.style.background = '#f0fdf4';
                        imgRes.style.borderColor = '#16a34a';
                        imgRes.innerHTML = '<strong style="color:#16a34a;">✅ Food Label Detected</strong><br>🏷️ Category: <strong>'+r.topCat+'</strong> (2nd: '+r.secondCat+')<br>📊 Confidence: '+r.confidence+'% | 🌿 '+r.veg+'<br>🔍 ' + r.checks.join(' | ') + '<br><br><em style="color:#6b7280;">✏️ Form auto-filled below! (Enter Product Name manually)</em>';
                    }

                
                    if (el('p_cat')) el('p_cat').value = r.topCat;
                    var range = tempRanges[r.topCat];
                    if (range) { if (el('t_min')) el('t_min').value = range[0]; if (el('t_max')) el('t_max').value = range[1]; }
                    if (el('p_origin')) el('p_origin').value = 'India';
                    if (el('p_name')) { el('p_name').value = ''; el('p_name').focus(); }

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
                resultDiv.innerHTML = '<div style="padding:15px; background:#fef2f2; border:2px solid #dc2626; border-radius:8px; color:#b91c1c; text-align:center;"><strong>❌ Product Not Found</strong><br><small>Barcode ' + barcode + ' not in database. Try another or enter manually.</small></div>';
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
            html += '<button onclick="autoFillFromBarcode(\'' + escapeHtml(name).replace(/'/g, "\\'") + '\',\'' + ourCategory + '\',\'' + escapeHtml(ingredients).replace(/'/g, "\\'") + '\',\'' + origin + '\',' + (kcal || 0) + ',' + (sugar || 0) + ',' + (sodium ? sodium * 1000 : 0) + ',' + (sat || 0) + ',' + (trans || 0) + ',\'' + (expDateFormatted !== 'Data unavailable' ? expDateFormatted : '') + '\')" class="btn" style="background:#16a34a; color:white; padding:12px 30px; font-size:1rem; border-radius:8px; border:none; cursor:pointer;">';
            html += '<i class="fas fa-magic"></i> Auto-Fill Form with This Data</button>';
            html += '</div>';
            
            // Data source
            html += '<div style="margin-top:10px; text-align:center; font-size:0.75rem; color:#6b7280; font-weight:600;">';
            html += 'Data Source: Open Food Facts (openfoodfacts.org) — Open Database';
            html += '</div>';
            
            html += '</div>';
            
            resultDiv.innerHTML = html;
            return data;
        })
        .catch(function (err) {
            console.error("API Error:", err);
            resultDiv.innerHTML = '<div style="padding:15px; background:#fef2f2; border:2px solid #dc2626; border-radius:8px; color:#b91c1c; text-align:center;"><strong>❌ Product Lookup Failed</strong><br><small>' + escapeHtml(err.message || 'Check network connection') + '<br>You can still select a category and fill in product details manually below.</small></div>';
        });
}


// --- Auto-fill form from barcode data ---
// This function needs to be global for onclick to work
window.autoFillFromBarcode = function(name, category, ingredients, origin, kcal, sugar, sodium, sat, trans, expDate) {
    window.lastDataOrigin = 'Retrieved from Open Food Facts API';
    if (el('p_name')) el('p_name').value = name;
    if (el('p_cat')) el('p_cat').value = category;
    if (el('p_ing')) el('p_ing').value = ingredients;
    if (el('p_origin')) el('p_origin').value = origin;
    if (el('p_exp')) el('p_exp').value = expDate || '';
    
    if (kcal && el('n_kcal')) el('n_kcal').value = Math.round(kcal);
    if (sugar && el('n_sugar')) el('n_sugar').value = parseFloat(sugar).toFixed(1);
    if (sodium && el('n_sodium')) el('n_sodium').value = Math.round(sodium);
    if (sat && el('n_sat')) el('n_sat').value = parseFloat(sat).toFixed(1);
    if (trans && el('n_trans')) el('n_trans').value = parseFloat(trans).toFixed(1);
    
    // Set temperature
    var range = tempRanges[category];
    if (range) {
        if (el('t_min')) el('t_min').value = range[0];
        if (el('t_max')) el('t_max').value = range[1];
    }
    
    if (el('fssai')) el('fssai').value = '';
    
    // Scroll to form top
    if (el('p_name')) el('p_name').scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Highlight the name field
    if (el('p_name')) {
        el('p_name').style.borderColor = '#16a34a';
        el('p_name').style.boxShadow = '0 0 0 3px rgba(22,163,74,0.2)';
        setTimeout(function() {
            el('p_name').style.borderColor = '';
            el('p_name').style.boxShadow = '';
        }, 3000);
    }
    
       // Hide barcode result for clean UI
    if (el('barcodeResult')) el('barcodeResult').style.display = 'none';
    
    // Smooth scroll to the Product Name field
    if (el('p_name')) {
        el('p_name').scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        resultDiv.innerHTML = '<div style="padding:15px; background:#dbeafe; border-radius:8px; text-align:center;">⏳ Scanning barcode from image...</div>';
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
                    resultDiv.innerHTML = '<div style="padding:15px; background:#fef2f2; border:2px solid #dc2626; border-radius:8px; color:#b91c1c; text-align:center;"><strong>❌ No Barcode Found</strong><br><small>Make sure the barcode is clear and centered in the image.</small><br><br>Supported: EAN-13, EAN-8, UPC-A, UPC-E, Code-128, Code-39</div>';
                }
            }
        }, function(err) {
            console.error("Scan Error:", err);
            if (resultDiv) {
                resultDiv.innerHTML = '<div style="padding:15px; background:#fef2f2; border:2px solid #dc2626; border-radius:8px; color:#b91c1c; text-align:center;"><strong>❌ Scan Failed</strong><br><small>' + (err.message || 'Could not read barcode from image') + '</small></div>';
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
// UPDATED: CSV BATCH ANALYSIS & PROCESSING
// ==========================================

// 1. CSV File Processor (Triggered on file upload)
function processCSV(file, callback) {
    if (!file) {
        if (typeof callback === 'function') callback();
        return;
    }

    var reader = new FileReader();
    reader.onload = function (e) {
        try {
            var text = e.target.result;
            var rows = text.split('\n').map(function (r) { return r.split(','); });
            
            // Remove empty rows
            rows = rows.filter(function (r) { return r.length > 1 && r[0].trim() !== ''; });

           if (rows.length < 1) {
    if (el('csv-batch-results')) {
        el('csv-batch-results').innerHTML =
            '<div style="color:red; padding:10px;">CSV file is empty.</div>';
    }
    if (typeof callback === 'function') callback();
    return;
}
            var startIndex = 0;
            var firstRowStr = rows[0].join(' ').toLowerCase();
            if (firstRowStr.includes('name') || firstRowStr.includes('product')) {
                startIndex = 1;
            }

            var dataRows = rows.slice(startIndex);
            
            // Show Toast Feedback
            showToast("Loaded " + dataRows.length + " products. Analyzing...", "info");

            // RUN BATCH ANALYSIS
            showCSVBatchAnalysis(dataRows);
        } catch (err) {
            console.error('Error processing CSV:', err);
            showToast('Error processing CSV file', 'error');
        } finally {
            if (typeof callback === 'function') callback();
        }
    };
    reader.onerror = function() {
        showToast('Error reading CSV file', 'error');
        if (typeof callback === 'function') callback();
    };
    reader.readAsText(file);
}

// 2. Batch Analysis Logic (Calculates Risk & Generates Report)
// 2. Batch Analysis Logic (Updated with Allergen Names & Download)
// 2. Batch Analysis Logic (Updated with Allergen Names & Download FIX)
// 2. Batch Analysis Logic (Fixed Download Logic)
function showCSVBatchAnalysis(rows) {
    var outDiv = el('csv-batch-results');
    if (!outDiv) return;

    // Initialize Counters
    var total = rows.length;
    var safeCount = 0;
    var unsafeCount = 0;
    var moderateCount = 0;
    var allergenCountTotal = 0;
    var additiveCountTotal = 0;
    var avgRiskScore = 0;

    var processedData = [];
    var html = '';

    // --- ANALYSIS LOOP ---
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        
        // Map CSV columns
        var name = r[0] ? r[0].trim() : 'Unknown Product';
        var cat = r[1] ? r[1].trim() : 'Packaged Snack';
        var exp = r[2] ? r[2].trim() : '';
        var ing = r[3] ? r[3].trim().toLowerCase() : '';
        var origin = r[4] ? r[4].trim() : 'India';
        var tmin = parseFloat(r[5]) || 0;
        var tmax = parseFloat(r[6]) || 0;
        var sugar = parseFloat(r[7]) || 0;
        var sodium = parseFloat(r[8]) || 0;
        var sat = parseFloat(r[9]) || 0;
        var trans = parseFloat(r[10]) || 0;
        var kcal = parseFloat(r[11]) || 0;
        var fssai = r[12] ? r[12].trim() : '';

        // CALCULATE SCORE
        var score = baseRiskByCategory(cat);
        var notes = [];
        var allergensFound = [];

        // Name Check
        if (!validFoodKeywords.some(function (k) { return name.toLowerCase().includes(k); })) { score += 5; }

        // Expiry Check
        if (exp) {
            var d = new Date(exp), now = new Date(), days = Math.floor((d - now) / (1000 * 3600 * 24));
            if (days < 0) { score += 40; } else if (days <= 3) { score += 15; }
        }

        // Allergens & Additives
        var currentAllergens = 0;
        var currentAdditives = 0;
        
        if (ing) {
            for (var j = 0; j < commonAllergens.length; j++) {
                if (ing.includes(commonAllergens[j])) {
                    currentAllergens++;
                    allergensFound.push(commonAllergens[j]);
                }
            }
            var em = (ing.match(/e\s?\d{3}/gi) || []).map(function (x) { return x.toUpperCase().replace(/\s/g, ''); });
            for (var k = 0; k < em.length; k++) {
                if (additiveWatchlist[em[k]]) {
                    currentAdditives++;
                }
            }
        }

        if (currentAllergens > 0) { score += (currentAllergens * 5); }
        if (currentAdditives > 0) { score += (currentAdditives * 5); }

        // FSSAI, Origin, Nutrition
        if (!fssai) score += 5; else if (!/^\d{14}$/.test(fssai)) score += 10;
        if (origin !== 'India') score += 5;
        if (sugar > 22.5) score += 8;
        if (sodium > 800) score += 8;
        if (tempRanges[cat]) {
            if (tmin < tempRanges[cat][0] || tmax > tempRanges[cat][1]) score += 15;
        }

        score = clamp(Math.round(score), 0, 100);
        avgRiskScore += score;

        // Categorize Result
        var status = 'Moderate';
        var colorClass = 'badge-warn';
        if (score <= 30) { 
            status = 'Safe'; 
            colorClass = 'badge-safe';
            safeCount++; 
        } else if (score >= 70) { 
            status = 'Unsafe'; 
            colorClass = 'badge-risk';
            unsafeCount++; 
        } else {
            moderateCount++;
        }

        if (currentAllergens > 0) allergenCountTotal++;
        if (currentAdditives > 0) additiveCountTotal++;

        processedData.push({
            name: name,
            cat: cat,
            score: score,
            status: status,
            badge: colorClass,
            allergens: allergensFound.length,
            allergenNames: allergensFound.join(', ')
        });
    }

    avgRiskScore = Math.round(avgRiskScore / (total || 1));

    // --- GENERATE REPORT HTML ---
    
    // 1. Summary Dashboard (KPIs)
    html += '<div style="background:#fff; padding:20px; border-radius:12px; box-shadow:var(--shadow); margin-bottom:20px; border:1px solid var(--border);">';
    html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">';
    html += '<h3 style="margin:0; color:var(--text-dark);">📊 Batch Analysis Report</h3>';
    
    // CHANGED: Added ID to button, removed onclick
    html += '<button id="btn-download-batch" class="btn btn-primary" style="padding:8px 16px; font-size:0.9rem;"><i class="fas fa-download"></i> Download Results CSV</button>';
    
    html += '</div>';
    
    html += '<div class="kpi-grid" style="grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));">';
    html += '<div class="kpi-card"><div class="kpi-title">Total Products</div><div class="kpi-value">' + total + '</div></div>';
    html += '<div class="kpi-card" style="border-color:#16a34a;"><div class="kpi-title">Safe</div><div class="kpi-value" style="color:#16a34a;">' + safeCount + '</div></div>';
    html += '<div class="kpi-card" style="border-color:#dc2626;"><div class="kpi-title">Unsafe</div><div class="kpi-value" style="color:#dc2626;">' + unsafeCount + '</div></div>';
    html += '<div class="kpi-card" style="border-color:#f59e0b;"><div class="kpi-title">Allergens</div><div class="kpi-value" style="color:#f59e0b;">' + allergenCountTotal + '</div></div>';
    html += '</div>';
    
    html += '<div style="margin-top:15px; font-size:0.9rem; color:var(--text-light);">Average Risk Score: ' + avgRiskScore + '/100</div>';
    html += '</div>';

    // 2. Detailed Table
    html += '<div class="card">';
    html += '<div class="card-header"><i class="fas fa-list"></i><h3>Detailed Results</h3></div>';
    html += '<div style="overflow-x:auto;"><table class="table" style="font-size:0.9rem;">';
    html += '<thead><tr><th>#</th><th>Product Name</th><th>Category</th><th>Score</th><th>Status</th><th>Allergens Found</th></tr></thead><tbody>';

    for (var i = 0; i < processedData.length; i++) {
        var item = processedData[i];
        html += '<tr>';
        html += '<td>' + (i + 1) + '</td>';
        html += '<td>' + escapeHtml(item.name) + '</td>';
        html += '<td>' + escapeHtml(item.cat) + '</td>';
        html += '<td>' + item.score + '</td>';
        html += '<td><span class="badge ' + item.badge + '">' + item.status + '</span></td>';
        
        if (item.allergenNames && item.allergenNames.trim() !== '') {
            html += '<td style="color:#d97706; font-weight:500;"><i class="fas fa-exclamation-triangle"></i> ' + escapeHtml(item.allergenNames) + '</td>';
        } else {
            html += '<td style="color:#059669;">None</td>';
        }
        html += '</tr>';
    }
    html += '</tbody></table></div>';
    html += '</div>';

    // Render to Page
    outDiv.innerHTML = html;
    
    // 3. Generate CSV String for Download
    var csvHeader = 'Name,Category,Score,Status,Allergens\n';
    var csvBody = processedData.map(function(row) {
        var safeName = (row.name || '').replace(/"/g, '""');
        var safeAllergens = (row.allergenNames || 'None').replace(/"/g, '""');
        return `"${safeName}","${row.cat}",${row.score},"${row.status}","${safeAllergens}"`;
    }).join('\n');
    
    window.lastBatchCSV = csvHeader + csvBody;

    // 4. EVENT LISTENER ATTACHMENT (The Fix)
    var dlBtn = document.getElementById('btn-download-batch');
    if(dlBtn) {
        dlBtn.addEventListener('click', function(e) {
            e.preventDefault(); // Stop form submit
            window.downloadBatchCSV(); // Call global function
        });
    }
    
    // Scroll to results
    outDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    var token = localStorage.getItem('fs_token');
    if (!token) { showToast('Please login first to use ML prediction!', 'warning'); return; }

    if (window.currentMode === 'consumer') {
        showToast('k-NN Prediction requires laboratory instrument measurements. Please switch to Lab / Inspector Mode.', 'warning');
        return;
    }

    var cat = el('p_cat') ? el('p_cat').value : 'Packaged Snack';
    var pH = numVal('p_ph');
    var moisture = numVal('p_moisture');
    var temp = numVal('p_temp');

    if (pH === null || moisture === null || temp === null) {
        showToast('Please enter measured pH, moisture, and temperature in Lab Mode before running k-NN prediction.', 'warning');
        return;
    }

    var btn = triggerBtn || el('runKnBtnLab') || el('runKnBtn');
    if (el('knn_out')) el('knn_out').innerText = 'Predicting...';
    setButtonLoading(btn, true, 'Predicting...');
    try {
        var res = await fetch('http://localhost:5000/api/ml/predict', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({
                pH: pH,
                moisture: moisture,
                temperature: temp,
                catCode: categoryEncode[cat] || 0
            })
        });
        var data = await res.json();
        if (!res.ok) {
            if (el('knn_out')) el('knn_out').innerText = data.message || 'Prediction failed';
            showToast(data.message || 'Prediction failed', 'error');
            return;
        }

        var sampleNote = data.trainedOnSamples < 20 ? ' ⚠ Experimental' : '';
        if (el('knn_out')) {
            el('knn_out').innerText = data.prediction + ' (trained on ' + data.trainedOnSamples + ' real samples, k=' + data.k + ')' + sampleNote;
        }

        var disc = el('mlSampleDisclaimer');
        if (disc) {
            if (data.trainedOnSamples < 20) {
                disc.innerHTML = '<i class="fas fa-exclamation-triangle"></i> <strong>Experimental result based on ' + data.trainedOnSamples + ' laboratory samples.</strong> More validated samples are required for reliable model performance. ML predictions are supplementary decision-support tools and do not replace official food safety standards or laboratory certification.';
                disc.style.display = 'block';
            } else {
                disc.style.display = 'none';
            }
        }
        showToast('k-NN Prediction: ' + data.prediction, 'success');
    } catch (err) {
        if (el('knn_out')) el('knn_out').innerText = 'Server error. Is the backend running?';
        showToast('Server error. Is the backend running?', 'error');
    } finally {
        setButtonLoading(btn, false);
    }
}

if (el('runKnBtn')) el('runKnBtn').onclick = function() { executeKnnPrediction(el('runKnBtn')); };
if (el('runKnBtnLab')) el('runKnBtnLab').onclick = function() { executeKnnPrediction(el('runKnBtnLab')); };

if (el('labDemo')) el('labDemo').addEventListener('click', function () { 
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
    if (el('runEDA')) el('runEDA').addEventListener('click', runEDA);
    if (el('runLinear')) el('runLinear').addEventListener('click', runLinearRegression);
    if (el('runLogistic')) el('runLogistic').addEventListener('click', runLogistic);
    if (el('runRidge')) el('runRidge').addEventListener('click', runRidge);
    if (el('runLasso')) el('runLasso').addEventListener('click', runLasso);
    if (el('runHist')) el('runHist').addEventListener('click', showHistograms);

    if (el('verifyFssai')) el('verifyFssai').addEventListener('click', function () {
        var n = el('fssai') ? el('fssai').value.trim() : '', s = el('fssaiStatus'); if (!s) return;
        if (!n) s.innerHTML = '<span style="color:#dc2626;">❌ Enter FSSAI number</span>';
        else if (!/^\d{14}$/.test(n)) s.innerHTML = '<span style="color:#dc2626;">❌ 14 numeric digits required</span>';
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
            var warningDiv = el('catWarning');
            if (warningDiv) {
                if (diseaseInfo[this.value]) {
                    warningDiv.innerHTML = diseaseInfo[this.value];
                    warningDiv.style.display = 'block';
                } else {
                    warningDiv.style.display = 'none';
                }
            }
            if (window.currentMode === 'consumer') {
                var resCard = el('consumerResultCard');
                if (resCard) resCard.style.display = 'none';
                renderDynamicQuestions(this.value);
            }
        });
    }

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
        var knnBtn = el('runKnBtn');
        var modeDesc = el('modeDesc');

        if (mode === 'consumer') {
            if (consumerBtn) consumerBtn.classList.add('active');
            if (labBtn) labBtn.classList.remove('active');
            if (labExtras) labExtras.style.display = 'none';
            if (knnBtn) knnBtn.style.display = 'none';
            if (modeDesc) modeDesc.textContent = 'Consumer Mode — Barcode scanning, nutrition label analysis & observable safety questionnaire. No lab instruments required.';
            var currentCat = el('p_cat') ? el('p_cat').value : 'Packaged Snack';
            renderDynamicQuestions(currentCat);
        } else {
            if (labBtn) labBtn.classList.add('active');
            if (consumerBtn) consumerBtn.classList.remove('active');
            if (labExtras) labExtras.style.display = 'block';
            if (knnBtn) knnBtn.style.display = '';
            if (modeDesc) modeDesc.textContent = 'Lab / Inspector Mode — Enter measured pH, moisture, and temperature values obtained with appropriate instruments.';
            var pSection = el('proxyQuestionnaireSection');
            if (pSection) pSection.style.display = 'none';
            var cCard = el('consumerResultCard');
            if (cCard) cCard.style.display = 'none';
        }
    }

    if (el('consumerModeBtn')) el('consumerModeBtn').addEventListener('click', function() { switchMode('consumer'); });
    if (el('labModeBtn')) el('labModeBtn').addEventListener('click', function() { switchMode('lab'); });

    // Initialize in consumer mode (runKnBtn already hidden via HTML inline style)
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
            section.innerHTML = '<div style="padding:12px; background:#fef2f2; border-radius:8px; color:#b91c1c; margin-top:16px;">⚠ Category proxy config not loaded. Check that categoryProxyConfig.js is included.</div>';
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
                html += '<button type="button" class="proxy-yesno-btn" id="pq-' + q.id + '-yes" data-qid="' + q.id + '" data-val="yes" onclick="proxyYesNoSelect(this)">✅ Yes</button>';
                html += '<button type="button" class="proxy-yesno-btn" id="pq-' + q.id + '-no" data-qid="' + q.id + '" data-val="no" onclick="proxyYesNoSelect(this)">❌ No</button>';
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

        var result = computeProxyRiskScore(category, collected.answers);
        displayConsumerResultCard(category, result);
        showToast('Consumer Safety Screening completed: ' + result.verdict, 'success');
        return result;
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
            breakdownHtml += '<div class="axis-value">' + (breakdown[qid] > 0 ? '⚠ Risk: ' + breakdown[qid] : '✓ OK') + '</div>';
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

    // ============================================================
    //  BARCODE → CATEGORY → QUESTIONNAIRE TRIGGER
    //  After autoFillFromBarcode() sets the category, show questionnaire
    // ============================================================
    var _origAutoFill = window.autoFillFromBarcode;
    window.autoFillFromBarcode = function(name, category, ingredients, origin, kcal, sugar, sodium, sat, trans) {
        if (typeof _origAutoFill === 'function') {
            _origAutoFill(name, category, ingredients, origin, kcal, sugar, sodium, sat, trans);
        }
        // In Consumer Mode, trigger proxy questionnaire for detected category
        if (window.currentMode === 'consumer') {
            var resCard = el('consumerResultCard');
            if (resCard) resCard.style.display = 'none';
            renderDynamicQuestions(category);
        }
    };


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
  const API_BASE = 'http://localhost:5000/api';

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