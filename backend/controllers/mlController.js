const { callPython, MLServiceError } = require('../ml/pythonClient');
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
//   Body: { category, features } -> Python k-NN
exports.predict = async (req, res) => {
  try {
    const { category, features } = req.body || {};

    if (!category || !features || typeof features !== 'object') {
      return res.status(400).json({ message: 'Please provide category and features' });
    }

    const result = await callPython('POST', '/predict', { body: { category, features } });
    return res.status(200).json({
      prediction: result.verdict,
      rawLabel: result.prediction,
      trainedOnSamples: result.trained_on,
      k: result.k,
      category: result.category,
      featuresUsed: result.features_used,
      unsafeProbability: result.unsafe_probability,
      neighbors: result.neighbors,
      evaluation: result.evaluation
    });
  } catch (error) {
    sendError(res, error);
  }
};

// POST /api/ml/predict-batch   body: { category, rows }
exports.predictBatch = async (req, res) => {
  try {
    const { category, rows } = req.body || {};
    if (!Array.isArray(rows)) {
      return res.status(400).json({ message: "'rows' must be an array of feature objects" });
    }
    if (rows.length === 0) {
      return res.status(400).json({ message: "'rows' cannot be empty" });
    }
    if (rows.length > 500) {
      return res.status(400).json({ message: "Batch size exceeds maximum limit of 500 rows" });
    }

    const result = await callPython('POST', '/predict-batch', {
      body: {
        category: category || 'Dairy',
        rows: rows
      }
    });

    res.status(200).json(result);
  } catch (error) {
    sendError(res, error);
  }
};

// POST /api/ml/train-custom   body: { rows, target, category, exclude }
exports.trainCustom = async (req, res) => {
  try {
    const { rows, target, category, exclude } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: "'rows' must be a non-empty array of row objects" });
    }

    const result = await callPython('POST', '/train-custom', {
      body: {
        rows,
        target: target || 'Safety_Label',
        category: category || null,
        exclude: Array.isArray(exclude) ? exclude : null,
        user_id: req.userId || null
      }
    });

    res.status(200).json(result);
  } catch (error) {
    sendError(res, error);
  }
};

// POST /api/ml/predict-custom   body: { model_id, features }
exports.predictCustom = async (req, res) => {
  try {
    const { model_id, features } = req.body || {};
    if (!model_id) {
      return res.status(400).json({ message: "'model_id' is required" });
    }
    if (!features || typeof features !== 'object') {
      return res.status(400).json({ message: "'features' must be an object of numeric values" });
    }

    const result = await callPython('POST', '/predict-custom', {
      body: {
        model_id,
        user_id: req.userId || null,
        features
      }
    });

    res.status(200).json(result);
  } catch (error) {
    sendError(res, error);
  }
};