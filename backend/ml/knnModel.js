const knn = require('ml-knn');
const Review = require('../models/Review');

// Train a fresh k-NN model using all stored reviews that have pH/moisture/temperature/safe
async function trainAndPredict(inputFeatures, userId) {
  // Fetch only this user's reviews that have the required ML fields filled in
  const reviews = await Review.find({
    userId: userId,
    pH: { $exists: true, $ne: null },
    moisture: { $exists: true, $ne: null },
    temperature: { $exists: true, $ne: null },
    safe: { $exists: true, $ne: null }
  });

  if (reviews.length < 5) {
    throw new Error('Not enough training data yet. Need at least 5 saved reviews with pH/moisture/temperature. Currently have: ' + reviews.length);
  }

  // Build training dataset
  const trainingSet = reviews.map(r => [r.pH, r.moisture, r.temperature, r.catCode || 0]);
  const labels = reviews.map(r => r.safe);

  // Train k-NN model (k=3, or fewer if dataset is small)
  const k = Math.min(3, reviews.length);
  const model = new knn(trainingSet, labels, { k });

  // Predict on the new input
  const prediction = model.predict([inputFeatures]);

  return {
    prediction: prediction[0], // 0 or 1
    trainedOn: reviews.length,
    k: k
  };
}

module.exports = { trainAndPredict };