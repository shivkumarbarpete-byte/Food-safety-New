const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const Review = require('../models/Review');
const { PYTHON_ML_URL, MLServiceError } = require('../ml/pythonClient');

/**
 * Helper to forward multipart/form-data directly to Python ML Service
 */
async function forwardMultipartToML(path, req, res, saveToDb = false, scanType = 'detection') {
  try {
    const mlTargetUrl = `${PYTHON_ML_URL}${path}`;

    // Forward incoming request stream/headers to Python ML service
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

// 1. YOLOv8 Freshness & Spoilage Detection Endpoint
router.post('/detect-freshness', async (req, res) => {
  return forwardMultipartToML('/detect-freshness', req, res, true, 'detection');
});

// 2. YOLOv8 Fast Canvas Frame Detection
router.post('/detect-frame', async (req, res) => {
  return forwardMultipartToML('/api/v1/detect/frame', req, res, false, 'frame');
});

// 3. Smart Food Label & Regulatory Safety Auditor Endpoint
router.post('/audit-label', async (req, res) => {
  return forwardMultipartToML('/api/v1/audit-label', req, res, true, 'audit');
});

module.exports = router;
