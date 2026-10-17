/* ============================================================
   mlAnalysis.js  (thin client version)
   ------------------------------------------------------------
   Saara ML (split, scaling, training, metrics) Python backend
   mein hota hai. Ye file sirf /api/ml/* ko call karti hai aur
   result dikhati hai.
   ============================================================ */

if (typeof window === 'undefined') {
  global.window = {};
}

window.FSML = {
  init: function (helpers) {
    helpers = helpers || {};
    var el = helpers.el;
    var showToast = helpers.showToast;
    var setButtonLoading = helpers.setButtonLoading;
    var clearMLResults = helpers.clearMLResults;
    var showMLResult = helpers.showMLResult;
    var CATEGORY_SCHEMAS = helpers.CATEGORY_SCHEMAS;
    var numVal = helpers.numVal;
    var getMlChart = helpers.getMlChart;
    var setMlChart = helpers.setMlChart;

    var API_BASE = 'http://localhost:5000/api/ml';
    var LINE = "━━━━━━━━━━━━━━━━━━━━━━━━━━";

    // ---------- Chhote helpers ----------

    function selectedCategory() {
      return el('mlCategorySelect') ? el('mlCategorySelect').value : 'All';
    }

    function setExplain(text) {
      if (el('currentExplain')) el('currentExplain').textContent = text;
    }

    // Number ko safely format karta hai (null/undefined par '-')
    function num(v, digits) {
      return (typeof v === 'number' && isFinite(v)) ? v.toFixed(digits === undefined ? 2 : digits) : '-';
    }

    // 0-1 fraction ko % mein badalta hai (agar backend pehle se % de to bhi chalega)
    function pct(v, digits) {
      if (typeof v !== 'number' || !isFinite(v)) return '-';
      var p = v <= 1 ? v * 100 : v;
      return p.toFixed(digits === undefined ? 1 : digits) + '%';
    }

    // Backend ko call: token lagata hai, error ko readable Error banata hai
    async function callApi(method, path, opts) {
      opts = opts || {};
      var headers = {};
      var token = localStorage.getItem('fs_token');
      if (token) headers['Authorization'] = 'Bearer ' + token;

      var url = API_BASE + path;
      if (opts.query) {
        url += '?' + Object.keys(opts.query).map(function (k) {
          return encodeURIComponent(k) + '=' + encodeURIComponent(opts.query[k]);
        }).join('&');
      }

      var init = { method: method, headers: headers };
      if (opts.body) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(opts.body);
      }

      var res;
      try {
        res = await fetch(url, init);
      } catch (netErr) {
        throw new Error('Backend (port 5000) se connect nahi ho paya. Node server chal raha hai?');
      }

      var json = null;
      try { json = await res.json(); } catch (e) { /* body JSON nahi tha */ }

      if (!res.ok) {
        throw new Error((json && json.message) || ('Server error (HTTP ' + res.status + ')'));
      }
      return json;
    }

    // Purana chart hatao, naya banao, store karo
    function renderChart(config) {
      var canvas = el('mlChart');
      if (!canvas) return;
      if (getMlChart && getMlChart()) getMlChart().destroy();
      var chart = new Chart(canvas.getContext('2d'), config);
      if (setMlChart) setMlChart(chart);
    }

    function showSyntheticNote() {
      showMLResult("\nℹ️ Note: dataset synthetic (nakli) hai, isliye accuracy bahut high aa sakti hai. Ye ML pipeline ka demo hai.", false);
    }

    function showInfluence(list) {
      (list || []).slice().sort(function (a, b) {
        return Math.abs(b.weight) - Math.abs(a.weight);
      }).forEach(function (f) {
        showMLResult("  " + f.feature + " — " + f.effect + " (weight: " + num(f.weight) + ")");
      });
    }

    // ===== EDA =====
    async function runEDA() {
      clearMLResults();
      var cat = selectedCategory();
      setExplain('Exploratory Data Analysis (' + cat + '): Summary statistics & scatter distribution of dataset samples for selected category.');
      showMLResult("📊 DATA SUMMARY — Category: " + cat, true);
      var btn = el('runEDA');
      setButtonLoading(btn, true, 'Running EDA...');
      try {
        var r = await callApi('GET', '/eda', { query: { category: cat } });

        showMLResult("Category '" + r.category + "' has " + r.n_rows + " rows: " + r.n_safe + " Safe, " + r.n_unsafe + " Unsafe.\n");
        showMLResult(LINE, false);
        showMLResult("\n📈 FEATURE STATISTICS:", true);
        r.feature_stats.forEach(function (s) {
          showMLResult(s.feature + ": Mean = " + num(s.mean) + " | Std = " + num(s.std) +
            " | Range = " + num(s.min, 1) + " to " + num(s.max, 1));
        });
        showMLResult("\n💡 Summary gives quick parameter insight before running ML prediction models.", false);

        var sc = r.scatter;
        if (sc && sc.safe_points) {
          renderChart({
            type: 'scatter',
            data: {
              datasets: [
                { label: 'Safe Samples (Label=0)', data: sc.safe_points, backgroundColor: '#16a34a', pointRadius: 6 },
                { label: 'Unsafe Samples (Label=1)', data: sc.unsafe_points, backgroundColor: '#dc2626', pointRadius: 6 }
              ]
            },
            options: {
              scales: {
                x: { title: { display: true, text: sc.x_feature } },
                y: { title: { display: true, text: sc.y_feature } }
              },
              plugins: {
                legend: { position: 'top' },
                title: { display: true, text: r.category + ' Dataset: ' + sc.x_feature + ' vs ' + sc.y_feature }
              }
            }
          });
        }
      } catch (err) {
        showMLResult('❌ EDA failed: ' + (err.message || err), true);
        showToast('EDA failed. Check that the backend is running.', 'error');
      } finally { setButtonLoading(btn, false); }
    }

    // ===== LINEAR REGRESSION =====
    async function runLinearRegression() {
      clearMLResults();
      var cat = selectedCategory();
      setExplain('Linear Regression (' + cat + '): Learns weights to estimate continuous Risk_Score (0-100) from parameters. Test metrics unseen 20% data par naape jaate hain.');
      showMLResult("📈 LINEAR REGRESSION — Category: " + cat, true);
      var btn = el('runLinear');
      setButtonLoading(btn, true, 'Training...');
      try {
        var r = await callApi('POST', '/linear', { body: { category: cat } });

        showMLResult("Features: [" + r.features.join(', ') + "]");
        showMLResult("Total " + r.n_total + " rows → Train: " + r.n_train + ", Test: " + r.n_test + "\n");
        showMLResult(LINE, false);
        showMLResult("\n✅ RESULT (error points mein, out of 100):", true);
        showMLResult("Train RMSE: ±" + num(r.metrics.train_rmse));
        showMLResult("Test RMSE:  ±" + num(r.metrics.test_rmse));
        showMLResult("Test MAE:   ±" + num(r.metrics.test_mae));
        showMLResult("Test R²:    " + num(r.metrics.test_r2, 3), true);

        var sp = r.sample_prediction;
        if (sp) {
          showMLResult("\n🔎 Sample (test set): actual risk " + num(sp.actual_risk, 1) +
            " → predicted " + num(sp.predicted_risk, 1) + "/100 (" + sp.level + ")");
        }

        showMLResult("\n📌 FEATURE INFLUENCE ON RISK SCORE:", true);
        showInfluence(r.feature_influence);
        showSyntheticNote();
      } catch (err) {
        showMLResult('❌ Linear Regression failed: ' + (err.message || err), true);
        showToast('Linear Regression failed.', 'error');
      } finally { setButtonLoading(btn, false); }
    }

    // ===== LOGISTIC / RIDGE / LASSO =====
    async function runLogisticBase(title, kind, btnId) {
      clearMLResults();
      var cat = selectedCategory();
      if (kind === 'ridge') setExplain('Ridge Regression (L2) [' + cat + ']: Classifies Safe/Unsafe with L2 weight regularization.');
      else if (kind === 'lasso') setExplain('Lasso Regression (L1) [' + cat + ']: Classifies Safe/Unsafe with L1 sparsity regularization.');
      else setExplain('Logistic Regression [' + cat + ']: Classifies Safe vs Unsafe food samples.');

      showMLResult("🧠 " + title + " — Category: " + cat, true);
      var btn = btnId ? el(btnId) : null;
      setButtonLoading(btn, true, 'Training...');
      try {
        var r = await callApi('POST', '/logistic', { body: { category: cat, kind: kind } });

        showMLResult("Features: [" + r.features.join(', ') + "]");
        showMLResult("Total " + r.n_total + " samples (" + r.n_safe + " Safe, " + r.n_unsafe + " Unsafe)");
        showMLResult("Train: " + r.n_train + ", Test: " + r.n_test + "\n");
        showMLResult(LINE, false);

        var m = r.metrics;
        showMLResult("\n✅ RESULT:", true);
        showMLResult("Train Accuracy: " + pct(m.train_accuracy));
        showMLResult("Test Accuracy:  " + pct(m.test_accuracy), true);
        showMLResult("Precision: " + pct(m.precision) + " | Recall: " + pct(m.recall) + " | F1: " + pct(m.f1));

        var cm = r.confusion_matrix;
        showMLResult("\n🧮 CONFUSION MATRIX (test set):", true);
        showMLResult("  Safe ko Safe bola (TN):     " + cm.tn);
        showMLResult("  Safe ko Unsafe bola (FP):   " + cm.fp);
        showMLResult("  Unsafe ko Safe bola (FN):   " + cm.fn + "   ← sabse khatarnak galti");
        showMLResult("  Unsafe ko Unsafe bola (TP): " + cm.tp);

        var sp = r.sample_prediction;
        if (sp) {
          showMLResult("\n🔎 Sample (test set): actual = " + sp.actual + ", predicted = " + sp.predicted +
            " (Unsafe probability: " + pct(sp.unsafe_probability) + ")");
        }

        showMLResult("\n📌 FEATURE INFLUENCE ON SAFE vs UNSAFE:", true);
        showInfluence(r.feature_influence);
        if (r.zero_weight_features && r.zero_weight_features.length) {
          showMLResult("\n🧹 Zero weight wale features (model ne ignore kiye): " + r.zero_weight_features.join(', '));
        }
        showSyntheticNote();

        renderChart({
          type: 'bar',
          data: {
            labels: ['Train Accuracy', 'Test Accuracy'],
            datasets: [{
              label: title,
              data: [
                m.train_accuracy <= 1 ? m.train_accuracy * 100 : m.train_accuracy,
                m.test_accuracy <= 1 ? m.test_accuracy * 100 : m.test_accuracy
              ],
              backgroundColor: ['#2563eb', '#16a34a']
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              title: { display: true, text: cat + ': ' + title + ' — Train vs Test Accuracy (%)' }
            },
            scales: { y: { beginAtZero: true, max: 100 } }
          }
        });
      } catch (err) {
        showMLResult('❌ ' + title + ' failed: ' + (err.message || err), true);
        showToast(title + ' failed.', 'error');
      } finally { setButtonLoading(btn, false); }
    }

    async function runLogistic() { await runLogisticBase("LOGISTIC REGRESSION", 'logistic', 'runLogistic'); }
    async function runRidge() { await runLogisticBase("RIDGE REGRESSION (L2)", 'ridge', 'runRidge'); }
    async function runLasso() { await runLogisticBase("LASSO REGRESSION (L1)", 'lasso', 'runLasso'); }

    // ===== HISTOGRAMS =====
    async function showHistograms() {
      clearMLResults();
      var cat = selectedCategory();
      setExplain('Feature Histograms (' + cat + '): Comparing average values for each parameter between Safe and Unsafe samples.');
      showMLResult("📊 FEATURE COMPARISON — Category: " + cat, true);
      var btn = el('runHist');
      setButtonLoading(btn, true, 'Analyzing...');
      try {
        var r = await callApi('GET', '/histograms', { query: { category: cat } });

        showMLResult("Comparing " + r.n_safe + " Safe samples vs " + r.n_unsafe + " Unsafe samples for '" + r.category + "'\n");
        r.comparison.forEach(function (c) {
          showMLResult(c.feature + ":");
          showMLResult("  Safe Avg:   " + num(c.safe_avg));
          showMLResult("  Unsafe Avg: " + num(c.unsafe_avg));
        });

        renderChart({
          type: 'bar',
          data: {
            labels: r.comparison.map(function (c) { return c.feature; }),
            datasets: [
              {
                label: 'Safe Samples (n=' + r.n_safe + ')',
                data: r.comparison.map(function (c) { return c.safe_avg; }),
                backgroundColor: '#16a34a', borderColor: '#15803d', borderWidth: 2
              },
              {
                label: 'Unsafe Samples (n=' + r.n_unsafe + ')',
                data: r.comparison.map(function (c) { return c.unsafe_avg; }),
                backgroundColor: '#dc2626', borderColor: '#b91c1c', borderWidth: 2
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'top' },
              title: { display: true, text: r.category + ': Feature Averages (Safe vs Unsafe)' }
            },
            scales: { y: { beginAtZero: true } }
          }
        });
      } catch (err) {
        showMLResult('❌ Histogram failed: ' + (err.message || err), true);
        showToast('Histogram failed.', 'error');
      } finally { setButtonLoading(btn, false); }
    }

    // ===== k-NN PREDICTION (LAB MODE) =====
    async function runKnnPredictionLab() {
      clearMLResults();
      var catName = el('p_cat') ? el('p_cat').value : (el('mlCategorySelect') ? el('mlCategorySelect').value : 'Dairy');
      if (catName === 'All') catName = 'Dairy';
      var schema = CATEGORY_SCHEMAS[catName] || CATEGORY_SCHEMAS['Dairy'];

      var featureMap = {};
      var missing = [];

      schema.common.concat(schema.specific).forEach(function (f) {
        var v = numVal(f.id);
        if (v === null || isNaN(v)) {
          missing.push(f.label);
        } else {
          featureMap[f.key] = v;
        }
      });

      if (missing.length > 0) {
        showToast('Please enter measured value for: ' + missing.join(', '), 'warning');
        return;
      }

      setExplain('k-Nearest Neighbors (k-NN) [' + catName + ']: Classifies sample safety by finding nearest neighbors in category dataset.');
      showMLResult("🧠 k-NN PREDICTION — Category: " + catName, true);
      var btn = el('runKnBtnLab');
      setButtonLoading(btn, true, 'Predicting...');

      try {
        var json = await callApi('POST', '/predict', { body: { category: catName, features: featureMap } });

        showMLResult("\n✅ PREDICTION VERDICT: " + String(json.prediction).toUpperCase(), true);
        if (typeof json.unsafeProbability === 'number') {
          showMLResult("  Unsafe probability: " + pct(json.unsafeProbability));
        }
        showMLResult("  Trained on: " + json.trainedOnSamples + " category dataset samples (k=" + json.k + ")");
        showMLResult("  Features evaluated: " + json.featuresUsed.join(', '));

        if (json.neighbors && json.neighbors.length) {
          showMLResult("\n👥 NEAREST NEIGHBORS:", true);
          json.neighbors.forEach(function (n, i) {
            showMLResult("  #" + (i + 1) + ": label = " + n.label + ", distance = " + num(n.distance, 3));
          });
        }

        if (json.evaluation) {
          var ev = json.evaluation;
          showMLResult("\n🎯 MODEL CHECK (k-NN, " + ev.n_train + " train / " + ev.n_test + " test):", true);
          showMLResult("  Train Accuracy: " + pct(ev.train_accuracy));
          showMLResult("  Test Accuracy:  " + pct(ev.test_accuracy));
        }

        if (el('knn_out')) el('knn_out').textContent = json.prediction + ' (k-NN trained on ' + json.trainedOnSamples + ' ' + catName + ' samples)';
      } catch (err) {
        console.error('k-NN request failed', err);
        showMLResult("❌ Prediction failed: " + (err.message || err), true);
      } finally {
        setButtonLoading(btn, false);
      }
    }

    return {
      runEDA: runEDA,
      runLinearRegression: runLinearRegression,
      runLogistic: runLogistic,
      runRidge: runRidge,
      runLasso: runLasso,
      showHistograms: showHistograms,
      runKnnPredictionLab: runKnnPredictionLab
    };
  }
};