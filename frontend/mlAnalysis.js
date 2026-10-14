/* ============================================================
   mlAnalysis.js
   ------------------------------------------------------------
   Standalone Machine Learning Analysis module for Food Safety.
   Copied from frontend/script.js to decouple ML analysis routines.
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

    async function getRealDataset(categoryFilter) {
      var cat = categoryFilter || (el('mlCategorySelect') ? el('mlCategorySelect').value : 'All');
      try {
        var token = localStorage.getItem('fs_token');
        var headers = {};
        if (token) headers['Authorization'] = 'Bearer ' + token;
        var res = await fetch('http://localhost:5000/api/ml/dataset?category=' + encodeURIComponent(cat), { headers: headers });
        if (res.ok) {
          var json = await res.json();
          if (json.data && json.data.length > 0) {
            return json.data;
          }
        }
      } catch (err) {
        console.warn('Backend dataset API offline, using fallback parser', err);
      }
      return [];
    }

    function normalizeDatasetFeatures(data, featureKeys) {
      var means = {}, stds = {};
      featureKeys.forEach(function (key) {
        var vals = data.map(function (d) {
          var value = d.features ? d.features[key] : d[key];
          return Number.isFinite(value) ? value : 0;
        });
        var mean = vals.reduce(function (a, b) { return a + b; }, 0) / (vals.length || 1);
        var std = Math.sqrt(vals.reduce(function (a, x) { return a + (x - mean) * (x - mean); }, 0) / (vals.length || 1)) || 1;
        means[key] = mean;
        stds[key] = std;
      });

      return data.map(function (d) {
        var normObj = {
          raw: d,
          score: d.Risk_Score !== undefined ? d.Risk_Score : (d.score || 0),
          safe: d.Safety_Label !== undefined ? (d.Safety_Label === 0 ? 1 : 0) : d.safe, // 1 = Safe, 0 = Unsafe for frontend
          rawSafetyLabel: d.Safety_Label,
          features: {}
        };
        featureKeys.forEach(function (key) {
          var rawVal = d.features ? d.features[key] : d[key];
          if (!Number.isFinite(rawVal)) rawVal = 0;
          normObj.features[key] = (rawVal - means[key]) / stds[key];
        });
        return normObj;
      });
    }

    function getDatasetFeatureKeys(data) {
      if (!data.length) return [];
      var firstKeys = Object.keys(data[0].features || {});
      return firstKeys.filter(function (key) {
        return data.every(function (row) {
          return row.features && Number.isFinite(row.features[key]);
        });
      });
    }

    // ===== EDA - Full Calculation Visible =====
    async function runEDA() {
      clearMLResults();
      var cat = el('mlCategorySelect') ? el('mlCategorySelect').value : 'All';
      if (el('currentExplain')) el('currentExplain').textContent = 'Exploratory Data Analysis (' + cat + '): Summary statistics & scatter distribution of dataset samples for selected category.';
      showMLResult("📊 DATA SUMMARY — Category: " + cat, true);
      var btn = el('runEDA');
      setButtonLoading(btn, true, 'Running EDA...');
      try {
        var data = await getRealDataset(cat);
        if (!data || data.length < 3) {
          showMLResult('⚠️ Not enough dataset samples for ' + cat + '. Ensure dataset is loaded.', true);
          return;
        }

        var safeCount = data.filter(function (d) { return d.Safety_Label === 0 || d.safe === 1; }).length;
        var unsafeCount = data.filter(function (d) { return d.Safety_Label === 1 || d.safe === 0; }).length;

        showMLResult("Category '" + cat + "' has " + data.length + " rows: " + safeCount + " Safe, " + unsafeCount + " Unsafe.\n");

        showMLResult("━━━━━━━━━━━━━━━━━━━━━━━━━━", false);
        showMLResult("\n📈 AVERAGE VALUES:", true);

        var featKeys = getDatasetFeatureKeys(data);
        if (featKeys.length < 2) throw new Error('Dataset has no common numeric features for this selection.');

        featKeys.forEach(function (key) {
          var vals = data.map(function (d) { return d.features ? d.features[key] : (d[key] || 0); });
          var mean = (vals.reduce(function (a, b) { return a + b; }, 0) / vals.length).toFixed(2);
          var min = Math.min.apply(null, vals).toFixed(1);
          var max = Math.max.apply(null, vals).toFixed(1);
          showMLResult(key + ": Average = " + mean + " | Range = " + min + " to " + max);
        });

        showMLResult("\n💡 Summary gives quick parameter insight before running ML prediction models.", false);

        // Scatter Chart (Feature 1 vs Feature 2)
        var ctx = el('mlChart');
        if (!ctx) return;
        ctx = ctx.getContext('2d');
        if (getMlChart && getMlChart()) getMlChart().destroy();

        var xKey = featKeys[0] || 'Temperature_C';
        var yKey = featKeys[1] || 'Moisture_percent';

        var chart = new Chart(ctx, {
          type: 'scatter',
          data: {
            datasets: [
              {
                label: 'Safe Samples (Label=0)',
                data: data.filter(function (d) { return d.Safety_Label === 0 || d.safe === 1; }).map(function (d) {
                  return { x: d.features ? d.features[xKey] : d[xKey], y: d.features ? d.features[yKey] : d[yKey] };
                }),
                backgroundColor: '#16a34a',
                pointRadius: 6
              },
              {
                label: 'Unsafe Samples (Label=1)',
                data: data.filter(function (d) { return d.Safety_Label === 1 || d.safe === 0; }).map(function (d) {
                  return { x: d.features ? d.features[xKey] : d[xKey], y: d.features ? d.features[yKey] : d[yKey] };
                }),
                backgroundColor: '#dc2626',
                pointRadius: 6
              }
            ]
          },
          options: {
            scales: {
              x: { title: { display: true, text: xKey } },
              y: { title: { display: true, text: yKey } }
            },
            plugins: {
              legend: { position: 'top' },
              title: { display: true, text: cat + ' Dataset: ' + xKey + ' vs ' + yKey }
            }
          }
        });
        if (setMlChart) setMlChart(chart);
      } catch (err) {
        showMLResult('❌ EDA failed: ' + (err.message || err), true);
        showToast('EDA failed. Check that the backend is running.', 'error');
      } finally { setButtonLoading(el('runEDA'), false); }
    }

    // ===== LINEAR REGRESSION =====
    async function runLinearRegression() {
      if (typeof tf === 'undefined') { showToast('TensorFlow.js not loaded', 'error'); return; }
      clearMLResults();
      var cat = el('mlCategorySelect') ? el('mlCategorySelect').value : 'All';
      if (el('currentExplain')) el('currentExplain').textContent = 'Linear Regression (' + cat + '): Learns weights to estimate continuous Risk_Score (0-100) from parameters.';
      showMLResult("📈 LINEAR REGRESSION — Category: " + cat, true);
      var btn = el('runLinear');
      setButtonLoading(btn, true, 'Training...');
      try {
        var data = await getRealDataset(cat);
        if (!data || data.length < 3) {
          showMLResult('⚠️ Not enough dataset samples for ' + cat + '.', true);
          return;
        }

        var featKeys = getDatasetFeatureKeys(data);
        if (featKeys.length < 2) throw new Error('Dataset has no common numeric features for this selection.');
        showMLResult("Training Linear model on " + data.length + " rows for features: [" + featKeys.join(', ') + "]\n");

        var normalizedData = normalizeDatasetFeatures(data, featKeys);
        var xs = tf.tensor2d(normalizedData.map(function (d) {
          return featKeys.map(function (k) { return d.features[k]; });
        }));
        var ys = tf.tensor2d(normalizedData.map(function (d) { return [d.score]; }));

        var model = tf.sequential();
        model.add(tf.layers.dense({ units: 1, inputShape: [featKeys.length], activation: 'linear' }));
        model.compile({ loss: 'meanSquaredError', optimizer: tf.train.adam(0.08) });

        var finalLoss = 0;
        await model.fit(xs, ys, {
          epochs: 180,
          shuffle: true,
          callbacks: { onEpochEnd: function (epoch, logs) { finalLoss = logs.loss; } }
        });

        showMLResult("\n━━━━━━━━━━━━━━━━━━━━━━━━━━", false);
        showMLResult("\n✅ RESULT:", true);
        showMLResult("Average prediction error: ±" + Math.sqrt(finalLoss).toFixed(1) + " points (out of 100)");

        var linearPredictionTensor = model.predict(xs);
        var linearPredictions = linearPredictionTensor.dataSync();
        var firstRisk = Math.max(0, Math.min(100, linearPredictions[0]));
        showMLResult("Dataset sample 1 predicted Risk Score: " + firstRisk.toFixed(1) + "/100 (" + (firstRisk >= 60 ? 'Higher Risk' : (firstRisk >= 30 ? 'Moderate Risk' : 'Low Risk')) + ")", true);
        linearPredictionTensor.dispose();

        var weights = model.layers[0].getWeights()[0].arraySync().flat();

        showMLResult("\n📌 FEATURE INFLUENCE ON RISK SCORE:", true);
        var influences = featKeys.map(function (key, idx) {
          return { name: key, w: weights[idx] };
        }).sort(function (a, b) { return Math.abs(b.w) - Math.abs(a.w); });

        influences.forEach(function (inf) {
          var direction = inf.w > 0 ? 'increases risk' : 'decreases risk';
          showMLResult("  " + inf.name + " — " + direction + " (weight: " + inf.w.toFixed(2) + ")");
        });

        xs.dispose();
        ys.dispose();
        model.dispose();
      } catch (err) {
        showMLResult('❌ Linear Regression failed: ' + (err.message || err), true);
        showToast('Linear Regression failed.', 'error');
      } finally { setButtonLoading(el('runLinear'), false); }
    }

    // ===== LOGISTIC REGRESSION (Logistic, Ridge L2, Lasso L1) =====
    async function runLogisticBase(title, l2, l1, btnId) {
      if (typeof tf === 'undefined') { showToast('TensorFlow.js not loaded', 'error'); return; }
      clearMLResults();
      var cat = el('mlCategorySelect') ? el('mlCategorySelect').value : 'All';
      if (el('currentExplain')) {
        if (l2) el('currentExplain').textContent = 'Ridge Regression (L2) [' + cat + ']: Classifies Safe/Unsafe with L2 weight regularization.';
        else if (l1) el('currentExplain').textContent = 'Lasso Regression (L1) [' + cat + ']: Classifies Safe/Unsafe with L1 sparsity regularization.';
        else el('currentExplain').textContent = 'Logistic Regression [' + cat + ']: Classifies Safe vs Unsafe food samples.';
      }
      showMLResult("🧠 " + title + " — Category: " + cat, true);
      var btn = btnId ? el(btnId) : null;
      setButtonLoading(btn, true, 'Training...');
      try {
        var data = await getRealDataset(cat);
        if (!data || data.length < 3) {
          showMLResult('⚠️ Not enough dataset samples for ' + cat + '.', true);
          return;
        }

        var featKeys = getDatasetFeatureKeys(data);
        if (featKeys.length < 2) throw new Error('Dataset has no common numeric features for this selection.');
        var safeCount = data.filter(function (d) { return d.Safety_Label === 0 || d.safe === 1; }).length;
        var unsafeCount = data.filter(function (d) { return d.Safety_Label === 1 || d.safe === 0; }).length;

        showMLResult("Training on " + data.length + " samples (" + safeCount + " Safe, " + unsafeCount + " Unsafe)\n");

        var normalizedData = normalizeDatasetFeatures(data, featKeys);
        var xs = tf.tensor2d(normalizedData.map(function (d) {
          return featKeys.map(function (k) { return d.features[k]; });
        }));
        // Train target: 0 for Safe, 1 for Unsafe
        var ys = tf.tensor2d(normalizedData.map(function (d) {
          return [d.rawSafetyLabel !== undefined ? d.rawSafetyLabel : (d.safe === 1 ? 0 : 1)];
        }));

        var reg = l2 ? tf.regularizers.l2({ l2: l2 }) : (l1 ? tf.regularizers.l1({ l1: l1 }) : null);
        var model = tf.sequential();
        model.add(tf.layers.dense({ units: 1, inputShape: [featKeys.length], activation: 'sigmoid', kernelRegularizer: reg }));
        model.compile({ loss: 'binaryCrossentropy', optimizer: tf.train.adam(0.08), metrics: ['accuracy'] });

        var finalAcc = 0;
        await model.fit(xs, ys, {
          epochs: 150,
          shuffle: true,
          callbacks: { onEpochEnd: function (epoch, logs) { finalAcc = logs.acc !== undefined ? logs.acc : logs.accuracy; } }
        });

        showMLResult("\n━━━━━━━━━━━━━━━━━━━━━━━━━━", false);
        showMLResult("\n✅ RESULT:", true);
        showMLResult("Model Accuracy: " + (Number(finalAcc) * 100).toFixed(0) + "%");

        var logisticPredictionTensor = model.predict(xs);
        var logisticProbabilities = logisticPredictionTensor.dataSync();
        var firstProbability = logisticProbabilities[0];
        showMLResult("Dataset sample 1 prediction: " + (firstProbability >= 0.5 ? 'UNSAFE' : 'SAFE') + " (Unsafe probability: " + (firstProbability * 100).toFixed(1) + "%)", true);
        logisticPredictionTensor.dispose();

        var weights = model.layers[0].getWeights()[0].arraySync().flat();
        showMLResult("\n📌 FEATURE INFLUENCE ON SAFE vs UNSAFE:", true);
        var influences = featKeys.map(function (key, idx) {
          return { name: key, w: weights[idx] };
        }).sort(function (a, b) { return Math.abs(b.w) - Math.abs(a.w); });

        influences.forEach(function (inf) {
          var direction = inf.w > 0 ? 'higher value → Unsafe signal' : 'higher value → Safe signal';
          showMLResult("  " + inf.name + " — " + direction);
        });

        xs.dispose();
        ys.dispose();
        model.dispose();
      } catch (err) {
        showMLResult('❌ ' + title + ' failed: ' + (err.message || err), true);
        showToast(title + ' failed.', 'error');
      } finally { setButtonLoading(btn, false); }
    }

    async function runLogistic() { await runLogisticBase("LOGISTIC REGRESSION", 0, 0, 'runLogistic'); }
    async function runRidge() { await runLogisticBase("RIDGE REGRESSION (L2)", 0.01, 0, 'runRidge'); }
    async function runLasso() { await runLogisticBase("LASSO REGRESSION (L1)", 0, 0.01, 'runLasso'); }

    // ===== HISTOGRAMS =====
    async function showHistograms() {
      clearMLResults();
      var cat = el('mlCategorySelect') ? el('mlCategorySelect').value : 'All';
      if (el('currentExplain')) el('currentExplain').textContent = 'Feature Histograms (' + cat + '): Comparing average values for each parameter between Safe and Unsafe samples.';
      showMLResult("📊 FEATURE COMPARISON — Category: " + cat, true);
      var btn = el('runHist');
      setButtonLoading(btn, true, 'Analyzing...');
      try {
        var data = await getRealDataset(cat);
        if (!data || data.length < 3) {
          showMLResult('⚠️ Not enough dataset samples for ' + cat + '.', true);
          return;
        }

        var safe = data.filter(function (d) { return d.Safety_Label === 0 || d.safe === 1; });
        var unsafe = data.filter(function (d) { return d.Safety_Label === 1 || d.safe === 0; });

        showMLResult("Comparing " + safe.length + " Safe samples vs " + unsafe.length + " Unsafe samples for '" + cat + "'\n");

        var featKeys = getDatasetFeatureKeys(data);
        if (featKeys.length < 2) throw new Error('Dataset has no common numeric features for this selection.');

        var safeAvgs = [], unsafeAvgs = [];

        featKeys.forEach(function (key) {
          var sVals = safe.map(function (d) { return d.features ? d.features[key] : (d[key] || 0); });
          var uVals = unsafe.map(function (d) { return d.features ? d.features[key] : (d[key] || 0); });
          var sAvg = sVals.length ? (sVals.reduce(function (a, b) { return a + b; }, 0) / sVals.length) : 0;
          var uAvg = uVals.length ? (uVals.reduce(function (a, b) { return a + b; }, 0) / uVals.length) : 0;
          safeAvgs.push(sAvg);
          unsafeAvgs.push(uAvg);

          showMLResult(key + ":");
          showMLResult("  Safe Avg:   " + sAvg.toFixed(2));
          showMLResult("  Unsafe Avg: " + uAvg.toFixed(2));
        });

        // Chart
        var ctx = el('mlChart');
        if (!ctx) return;
        ctx = ctx.getContext('2d');
        if (getMlChart && getMlChart()) getMlChart().destroy();

        var chart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: featKeys,
            datasets: [
              {
                label: 'Safe Samples (n=' + safe.length + ')',
                data: safeAvgs,
                backgroundColor: '#16a34a',
                borderColor: '#15803d',
                borderWidth: 2
              },
              {
                label: 'Unsafe Samples (n=' + unsafe.length + ')',
                data: unsafeAvgs,
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
              legend: { position: 'top' },
              title: { display: true, text: cat + ': Feature Averages (Safe vs Unsafe)' }
            },
            scales: { y: { beginAtZero: true } }
          }
        });
        if (setMlChart) setMlChart(chart);
      } finally { setButtonLoading(el('runHist'), false); }
    }

    // ===== k-NN PREDICTION (LAB MODE) =====
    async function runKnnPredictionLab() {
      clearMLResults();
      var catName = el('p_cat') ? el('p_cat').value : (el('mlCategorySelect') ? el('mlCategorySelect').value : 'Dairy');
      if (catName === 'All') catName = 'Dairy';
      var schema = CATEGORY_SCHEMAS[catName] || CATEGORY_SCHEMAS['Dairy'];

      var featureMap = {};
      var missing = [];

      schema.common.concat(schema.specific).forEach(function(f) {
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

      if (el('currentExplain')) el('currentExplain').textContent = 'k-Nearest Neighbors (k-NN) [' + catName + ']: Classifies sample safety by finding nearest neighbors in category dataset.';
      showMLResult("🧠 k-NN PREDICTION — Category: " + catName, true);
      var btn = el('runKnBtnLab');
      setButtonLoading(btn, true, 'Predicting...');

      try {
        var token = localStorage.getItem('fs_token');
        var headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;

        var res = await fetch('http://localhost:5000/api/ml/predict', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ category: catName, features: featureMap })
        });

        var json = await res.json();
        if (res.ok) {
          showMLResult("\n✅ PREDICTION VERDICT: " + json.prediction.toUpperCase(), true);
          showMLResult("  Trained on: " + json.trainedOnSamples + " category dataset samples (k=" + json.k + ")");
          showMLResult("  Features evaluated: " + json.featuresUsed.join(', '));
          if (el('knn_out')) el('knn_out').textContent = json.prediction + ' (k-NN trained on ' + json.trainedOnSamples + ' ' + catName + ' samples)';
        } else {
          showMLResult("❌ Prediction failed: " + (json.message || 'Error occurred'), true);
        }
      } catch (err) {
        console.error('k-NN request failed', err);
        showMLResult("⚠️ Network error contacting backend prediction endpoint.", true);
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
