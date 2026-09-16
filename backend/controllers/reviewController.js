const Review = require('../models/Review');

// @desc   Create a new review (replaces localStorage saveReview)
// @route  POST /api/reviews
exports.createReview = async (req, res) => {
  try {
    const { name, cat, verdict, score, origin, notes, pH, moisture, temperature, safe, catCode } = req.body;

    const review = await Review.create({
      userId: req.userId,
      name,
      cat,
      verdict,
      score,
      origin,
      notes,
      pH,
      moisture,
      temperature,
      safe,
        catCode
    });

    res.status(201).json({ message: 'Review saved successfully', review });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc   Get all reviews for logged-in user (replaces localStorage renderHistory)
// @route  GET /api/reviews
exports.getReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ userId: req.userId }).sort({ ts: -1 });
    res.status(200).json(reviews);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc   Delete all reviews for logged-in user (replaces localStorage clearHistory)
// @route  DELETE /api/reviews
exports.clearReviews = async (req, res) => {
  try {
    await Review.deleteMany({ userId: req.userId });
    res.status(200).json({ message: 'All reviews cleared successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};