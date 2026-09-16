const express = require('express');
const router = express.Router();
const { createReview, getReviews, clearReviews } = require('../controllers/reviewController');
const protect = require('../middleware/authMiddleware');

router.post('/', protect, createReview);
router.get('/', protect, getReviews);
router.delete('/', protect, clearReviews);

module.exports = router;