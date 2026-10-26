const knn = require('ml-knn');
const path = require('path');
const fs = require('fs');
const { CATEGORY_MAP, CATEGORY_FEATURES } = require('./datasetLoader');

// Path to pre-trained/pre-extracted weights artifact
const PRETRAINED_PATH = path.join(__dirname, 'pretrained_knn.json');

// In-memory cache for initialized model instances so initialization happens only once
const INSTANTIATED_MODELS = {};

function getPretrainedModel(normCat) {
  if (INSTANTIATED_MODELS[normCat]) {
    return INSTANTIATED_MODELS[normCat];
  }

  if (!fs.existsSync(PRETRAINED_PATH)) {
    throw new Error(`Pre-trained artifact ${PRETRAINED_PATH} not found. Please run offline training first.`);
  }

  const raw = fs.readFileSync(PRETRAINED_PATH, 'utf8');
  const allModels = JSON.parse(raw);
  const modelData = allModels[normCat];

  if (!modelData) {
    throw new Error(`No pre-trained model found for category ${normCat}`);
  }

  // Fast instantiation of pre-built KDTree structure without disk writes or dynamic training requests
  const model = new knn(modelData.trainingSet, modelData.labels, { k: modelData.k });
  INSTANTIATED_MODELS[normCat] = {
    model,
    featureKeys: modelData.featureKeys,
    trainedOn: modelData.trainedOn,
    k: modelData.k,
    category: modelData.category
  };

  return INSTANTIATED_MODELS[normCat];
}

async function trainAndPredictCategory(category, inputFeatureMap) {
  const normCat = CATEGORY_MAP[category] || category || 'Dairy';
  const preloaded = getPretrainedModel(normCat);
  const featureKeys = preloaded.featureKeys;

  // Map input feature vector
  const inputVector = featureKeys.map(k => {
    const val = inputFeatureMap[k];
    if (val === undefined || val === null || isNaN(val)) {
      throw new Error(`Missing parameter '${k}' for category '${category}'`);
    }
    return parseFloat(val);
  });

  // Fast inference using preloaded model (no runtime training or CSV parsing)
  const prediction = preloaded.model.predict([inputVector]);
  const predictedLabel = prediction[0]; // 0 = Safe, 1 = Unsafe

  return {
    prediction: predictedLabel,
    verdict: predictedLabel === 0 ? 'Low Risk Screening Estimate' : 'Higher Risk Screening Estimate',
    trainedOn: preloaded.trainedOn,
    k: preloaded.k,
    category: normCat,
    featuresUsed: featureKeys
  };
}

module.exports = { trainAndPredictCategory, getPretrainedModel };