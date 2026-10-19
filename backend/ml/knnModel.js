const knn = require('ml-knn');
const { loadCategoryDataset, CATEGORY_FEATURES, CATEGORY_MAP } = require('./datasetLoader');

async function trainAndPredictCategory(category, inputFeatureMap) {
  const normCat = CATEGORY_MAP[category] || category || 'Dairy';
  const dataset = loadCategoryDataset(normCat);
  if (dataset.length < 3) {
    throw new Error(`Not enough training data for category ${category}. Found ${dataset.length} samples.`);
  }

  const featureKeys = CATEGORY_FEATURES[normCat] || ['Temperature_C', 'Moisture_percent', 'Storage_Days'];

  // Map input feature vector
  const inputVector = featureKeys.map(k => {
    const val = inputFeatureMap[k];
    if (val === undefined || val === null || isNaN(val)) {
      throw new Error(`Missing parameter '${k}' for category '${category}'`);
    }
    return parseFloat(val);
  });

  const trainingSet = dataset.map(row => featureKeys.map(k => row.features[k]));
  const labels = dataset.map(row => row.Safety_Label);

  const k = Math.min(5, dataset.length);
  const model = new knn(trainingSet, labels, { k });
  const prediction = model.predict([inputVector]);

  const predictedLabel = prediction[0]; // 0 = Safe, 1 = Unsafe

  return {
    prediction: predictedLabel,
    verdict: predictedLabel === 0 ? 'Low Risk Screening Estimate' : 'Higher Risk Screening Estimate',
    trainedOn: dataset.length,
    k: k,
    category: normCat,
    featuresUsed: featureKeys
  };
}

module.exports = { trainAndPredictCategory };