const { loadCategoryDataset } = require('./backend/ml/datasetLoader');
const { trainAndPredictCategory } = require('./backend/ml/knnModel');

console.log('=== TEST 1: Load dataset per category ===');
const categories = [
  'Dairy', 'Meat & Poultry', 'Seafood', 'Fresh Produce', 'Beverage',
  'Bakery', 'Frozen Food', 'Baby Food', 'Packaged Snack', 'Street Food'
];

categories.forEach(cat => {
  const data = loadCategoryDataset(cat);
  console.log(`✓ ${cat}: loaded ${data.length} clean rows`);
  if (data.length !== 80) throw new Error(`Expected 80 rows for ${cat}, got ${data.length}`);
});

console.log('\n=== TEST 2: Train & Predict KNN per category ===');
async function runTests() {
  const testInputs = {
    'Dairy': { Temperature_C: 4.0, Moisture_percent: 85.0, Storage_Days: 3, pH: 6.6, Fat_Percent: 3.5, Titratable_Acidity: 0.14 },
    'Meat & Poultry': { Temperature_C: 2.0, Moisture_percent: 72.0, Storage_Days: 2, pH: 5.7, Color_Score: 8.0 },
    'Seafood': { Temperature_C: -1.0, Moisture_percent: 78.0, Storage_Days: 1, TVBN_Level: 12.0 },
    'Fresh Produce': { Temperature_C: 10.0, Moisture_percent: 88.0, Storage_Days: 3, Ripeness_Index: 5.0 },
    'Beverage': { Temperature_C: 5.0, Moisture_percent: 92.0, Storage_Days: 10, pH: 3.2, Sugar_Content_Percent: 11.0 },
    'Bakery': { Temperature_C: 20.0, Moisture_percent: 20.0, Storage_Days: 2, Mold_Risk_Index: 2.0 },
    'Frozen Food': { Temperature_C: -20.0, Moisture_percent: 65.0, Storage_Days: 20, Temp_Deviation_Neg18: 1.0 },
    'Baby Food': { Temperature_C: 4.0, Moisture_percent: 80.0, Storage_Days: 2, pH: 6.3 },
    'Packaged Snack': { Temperature_C: 24.0, Moisture_percent: 3.0, Storage_Days: 30, Oil_Rancidity_Index: 1.0 },
    'Street Food': { Temperature_C: 5.0, Moisture_percent: 60.0, Storage_Days: 0.5, Hygiene_Score: 8.5 }
  };

  for (const cat of categories) {
    const res = await trainAndPredictCategory(cat, testInputs[cat]);
    console.log(`✓ ${cat} k-NN prediction: ${res.verdict} (trained on ${res.trainedOn} samples, features: [${res.featuresUsed.join(', ')}])`);
  }

  console.log('\n=== ALL BACKEND ML TESTS PASSED! ===');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
