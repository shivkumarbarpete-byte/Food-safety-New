const express = require('express');
const router = express.Router();
const { predict } = require('../controllers/mlController');
const protect = require('../middleware/authMiddleware');

router.post('/predict', protect, predict);

module.exports = router;