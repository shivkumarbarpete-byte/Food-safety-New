const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const { getDataset, eda, histograms, linear, logistic, predict, predictBatch, trainCustom, predictCustom } = require('../controllers/mlController');

router.get('/dataset', getDataset);        // purana (JS loader)
router.get('/eda', eda);                   // -> Python
router.get('/histograms', histograms);     // -> Python
router.post('/linear', linear);            // -> Python
router.post('/logistic', logistic);        // -> Python (Logistic / Ridge / Lasso)
router.post('/predict', predict);          // -> Python k-NN (ya purana legacy path)
router.post('/predict-batch', predictBatch); // -> Python k-NN batch prediction
router.post('/train-custom', protect, trainCustom);     // -> Python custom training
router.post('/predict-custom', protect, predictCustom); // -> Python custom model predict

module.exports = router;