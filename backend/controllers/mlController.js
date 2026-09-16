const { trainAndPredict } = require('../ml/knnModel');

exports.predict = async (req, res) => {
  try {
    const { pH, moisture, temperature, catCode } = req.body;

    if (pH == null || moisture == null || temperature == null) {
      return res.status(400).json({ message: 'Please provide pH, moisture, and temperature' });
    }

    const result = await trainAndPredict([pH, moisture, temperature, catCode || 0], req.userId);

    res.status(200).json({
      prediction: result.prediction === 1 ? 'Safe' : 'Unsafe',
      rawLabel: result.prediction,
      trainedOnSamples: result.trainedOn,
      k: result.k
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};