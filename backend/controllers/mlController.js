const { trainAndPredictCategory, trainAndPredict } = require('../ml/knnModel');
const { loadCategoryDataset } = require('../ml/datasetLoader');

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

exports.predict = async (req, res) => {
  try {
    const { category, features, pH, moisture, temperature, catCode } = req.body;

    if (category && features) {
      const result = await trainAndPredictCategory(category, features);
      return res.status(200).json({
        prediction: result.verdict,
        rawLabel: result.prediction,
        trainedOnSamples: result.trainedOn,
        k: result.k,
        category: result.category,
        featuresUsed: result.featuresUsed
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
    res.status(500).json({ message: error.message });
  }
};