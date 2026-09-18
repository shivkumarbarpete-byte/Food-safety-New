const express = require('express');
const router = express.Router();
const { predict, getDataset } = require('../controllers/mlController');

router.get('/dataset', getDataset);
router.post('/predict', predict);

module.exports = router;