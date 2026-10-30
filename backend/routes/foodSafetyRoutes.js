const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parseFoodLabel } = require('../services/geminiService');
const protect = require('../middleware/authMiddleware');
const Review = require('../models/Review');
const { PYTHON_ML_URL, MLServiceError } = require('../ml/pythonClient');

// Memory storage for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

/**
 * Helper to forward multipart/form-data directly to Python ML Service
 */
async function forwardMultipartToML(path, req, res, saveToDb = false, scanType = 'detection') {
  try {
    const mlTargetUrl = `${PYTHON_ML_URL}${path}`;

    const headers = {};
    if (req.headers['content-type']) {
      headers['content-type'] = req.headers['content-type'];
    }

    const response = await fetch(mlTargetUrl, {
      method: 'POST',
      headers: headers,
      body: req,
      duplex: 'half',
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // Optionally save scan result to MongoDB if user is authenticated
    if (saveToDb && req.user && req.user._id) {
      try {
        const isSafe = (data.verdict_code === 'safe' || (data.summary && data.summary.status === 'safe')) ? 1 : 0;
        const score = data.safety_score || (data.summary && data.summary.safety_score) || (isSafe ? 90 : 25);
        const verdict = data.verdict || (data.summary && data.summary.verdict) || (isSafe ? 'Safe' : 'Unsafe');

        await Review.create({
          userId: req.user._id,
          name: req.body.product_name || `${scanType === 'audit' ? 'Label Audit' : 'Freshness Detection'} - ${new Date().toLocaleDateString()}`,
          cat: req.body.category || 'Fresh Produce',
          verdict: verdict,
          score: score,
          safe: isSafe,
          origin: `Automated AI Scan (${scanType})`,
          notes: JSON.stringify(data.regulatory_flags || data.detections || []),
        });
      } catch (dbErr) {
        console.error('Failed to log scan to MongoDB:', dbErr.message);
      }
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error(`Error communicating with ML microservice at ${path}:`, error.message);
    return res.status(503).json({
      message: 'ML Service is unreachable or processing failed',
      error: error.message,
    });
  }
}

/**
 * 1. Gemini Vision API Endpoint: Smart Label Parsing & Safety Audit
 * Handles multipart/form-data with field name 'labelImage'
 */
router.post('/audit-label', upload.single('labelImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Please upload an image file (field: labelImage)' });
    }

    const result = await parseFoodLabel(req.file.buffer, req.file.mimetype);

    // Optionally persist to MongoDB if user is authenticated
    if (req.user && req.user._id) {
      try {
        const isSafe = result.safety_risk_level === 'Low' ? 1 : 0;
        const score = result.safety_risk_level === 'Low' ? 90 : result.safety_risk_level === 'Moderate' ? 60 : 30;
        await Review.create({
          userId: req.user._id,
          name: result.product_name || `Label Audit - ${new Date().toLocaleDateString()}`,
          cat: 'Packaged Food',
          verdict: result.safety_risk_level === 'Low' ? 'Safe' : 'Attention Required',
          score: score,
          safe: isSafe,
          origin: 'Gemini Vision AI Audit',
          notes: JSON.stringify({ additives: result.flagged_additives, allergens: result.allergens }),
        });
      } catch (dbErr) {
        console.error('Failed to save Gemini audit to MongoDB:', dbErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error('Label audit error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to parse label: ' + err.message,
    });
  }
});

/**
 * 2. YOLOv8 Freshness & Spoilage Detection Endpoint
 */
router.post('/detect-freshness', async (req, res) => {
  return forwardMultipartToML('/detect-freshness', req, res, true, 'detection');
});

/**
 * 3. YOLOv8 Fast Canvas Frame Detection
 */
router.post('/detect-frame', async (req, res) => {
  return forwardMultipartToML('/api/v1/detect/frame', req, res, false, 'frame');
});

module.exports = router;