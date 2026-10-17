const { callPython, MLServiceError } = require('../ml/pythonClient');
const { trainAndPredict } = require('../ml/knnModel');          // sirf purane (legacy) pH/moisture/temp path ke liye
const { loadCategoryDataset } = require('../ml/datasetLoader');  // /dataset endpoint ke liye

// Python se aaye error ko sahi HTTP status ke saath frontend ko bhejna
function sendError(res, error) {
  if (error instanceof MLServiceError) {
    return res.status(error.status).json({ message: error.message });
  }
  return res.status(500).json({ message: error.message });
}

// ===== Purana endpoint (abhi bhi chal raha hai) =====
exports.getDataset = async (req, res) => {
  try {
    const category = req.query.category || 'All';
    const dataset = loadCategoryDataset(category);
    res.status(200).json({
      count: dataset.length,
      category: category,
      data: dataset
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ===== Python ML service ke endpoints =====

// GET /api/ml/eda?category=Dairy
exports.eda = async (req, res) => {
  try {
    const result = await callPython('GET', '/eda', { query: { category: req.query.category || 'All' } });
    res.status(200).json(result);
  } catch (error) {
    sendError(res, error);
  }
};

// GET /api/ml/histograms?category=Dairy
exports.histograms = async (req, res) => {
  try {
    const result = await callPython('GET', '/histograms', { query: { category: req.query.category || 'All' } });
    res.status(200).json(result);
  } catch (error) {
    sendError(res, error);
  }
};

// POST /api/ml/linear   body: { category }
exports.linear = async (req, res) => {
  try {
    const { category } = req.body || {};
    const result = await callPython('POST', '/linear', { body: { category: category || 'All' } });
    res.status(200).json(result);
  } catch (error) {
    sendError(res, error);
  }
};

// POST /api/ml/logistic   body: { category, kind: 'logistic' | 'ridge' | 'lasso' }
exports.logistic = async (req, res) => {
  try {
    const { category, kind } = req.body || {};
    const result = await callPython('POST', '/logistic', {
      body: { category: category || 'All', kind: kind || 'logistic' }
    });
    res.status(200).json(result);
  } catch (error) {
    sendError(res, error);
  }
};

// POST /api/ml/predict
//   Naya tareeka : body { category, features }  -> Python k-NN
//   Purana tareeka: body { pH, moisture, temperature, catCode } -> purana JS k-NN (script.js abhi ise use karta hai)
exports.predict = async (req, res) => {
  try {
    const { category, features, pH, moisture, temperature, catCode } = req.body || {};

    if (category && features) {
      const result = await callPython('POST', '/predict', { body: { category, features } });
      // Purane response ke naam wahi rakhe, taaki frontend na toote
      return res.status(200).json({
        prediction: result.verdict,
        rawLabel: result.prediction,
        trainedOnSamples: result.trained_on,
        k: result.k,
        category: result.category,
        featuresUsed: result.features_used,
        // naye fields
        unsafeProbability: result.unsafe_probability,
        neighbors: result.neighbors,
        evaluation: result.evaluation
      });
    }

    // Legacy fallback for pH/moisture/temperature
    if (pH != null && moisture != null && temperature != null) {
      const result = await trainAndPredict([pH, moisture, temperature, catCode || 0], req.userId);
      return res.status(200).json({
        prediction: result.prediction === 0 ? 'Low Risk Estimate' : 'Higher Risk Estimate',
        rawLabel: result.prediction,
        trainedOnSamples: result.trainedOn,
        k: result.k,
        featuresUsed: ['pH', 'moisture', 'temperature']
      });
    }

    return res.status(400).json({ message: 'Please provide either (category and features) or (pH, moisture, temperature)' });
  } catch (error) {
    sendError(res, error);
  }
};