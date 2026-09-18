const fs = require('fs');
const path = require('path');

const CATEGORY_MAP = {
  'Dairy': 'Dairy',
  'Meat & Poultry': 'Meat_Poultry',
  'Meat_Poultry': 'Meat_Poultry',
  'Seafood': 'Seafood',
  'Fresh Produce': 'Fresh_Produce',
  'Fresh_Produce': 'Fresh_Produce',
  'Beverage': 'Beverage',
  'Bakery': 'Bakery',
  'Frozen Food': 'Frozen_Food',
  'Frozen_Food': 'Frozen_Food',
  'Baby Food': 'Baby_Food',
  'Baby_Food': 'Baby_Food',
  'Packaged Snack': 'Packaged_Snack',
  'Packaged_Snack': 'Packaged_Snack',
  'Street Food': 'Street_Food',
  'Street_Food': 'Street_Food'
};

const CATEGORY_FEATURES = {
  'Dairy': ['Temperature_C', 'Moisture_percent', 'Storage_Days', 'pH', 'Fat_Percent', 'Titratable_Acidity'],
  'Meat_Poultry': ['Temperature_C', 'Moisture_percent', 'Storage_Days', 'pH', 'Color_Score'],
  'Seafood': ['Temperature_C', 'Moisture_percent', 'Storage_Days', 'TVBN_Level'],
  'Fresh_Produce': ['Temperature_C', 'Moisture_percent', 'Storage_Days', 'Ripeness_Index'],
  'Beverage': ['Temperature_C', 'Moisture_percent', 'Storage_Days', 'pH', 'Sugar_Content_Percent'],
  'Bakery': ['Temperature_C', 'Moisture_percent', 'Storage_Days', 'Mold_Risk_Index'],
  'Frozen_Food': ['Temperature_C', 'Moisture_percent', 'Storage_Days', 'Temp_Deviation_Neg18'],
  'Baby_Food': ['Temperature_C', 'Moisture_percent', 'Storage_Days', 'pH'],
  'Packaged_Snack': ['Temperature_C', 'Moisture_percent', 'Storage_Days', 'Oil_Rancidity_Index'],
  'Street_Food': ['Temperature_C', 'Moisture_percent', 'Storage_Days', 'Hygiene_Score']
};

function loadCategoryDataset(selectedCategory) {
  const filePath = path.join(__dirname, '..', 'data', 'food_safety_dataset_by_category.csv');
  if (!fs.existsSync(filePath)) {
    throw new Error('Dataset file food_safety_dataset_by_category.csv not found!');
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const normalizedCategory = selectedCategory && selectedCategory !== 'All' ? (CATEGORY_MAP[selectedCategory] || selectedCategory) : null;

  const dataset = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    const rowObj = {};
    headers.forEach((h, idx) => {
      rowObj[h] = cols[idx];
    });

    const catName = rowObj['Category'];
    if (normalizedCategory && catName !== normalizedCategory) {
      continue;
    }

    const featureKeys = CATEGORY_FEATURES[catName] || ['Temperature_C', 'Moisture_percent', 'Storage_Days'];
    const cleanRow = {
      Category: catName,
      Risk_Score: parseFloat(rowObj['Risk_Score']) || 0,
      Safety_Label: parseInt(rowObj['Safety_Label']) || 0,
      // For backwards compatibility with old pH/moisture/temperature code:
      pH: rowObj['pH'] !== '' && !isNaN(rowObj['pH']) ? parseFloat(rowObj['pH']) : null,
      moisture: rowObj['Moisture_percent'] !== '' && !isNaN(rowObj['Moisture_percent']) ? parseFloat(rowObj['Moisture_percent']) : null,
      temperature: rowObj['Temperature_C'] !== '' && !isNaN(rowObj['Temperature_C']) ? parseFloat(rowObj['Temperature_C']) : null,
      safe: parseInt(rowObj['Safety_Label']) === 1 ? 0 : 1, // 0 = safe, 1 = unsafe or vice versa (we store both)
      score: parseFloat(rowObj['Risk_Score']) || 0,
      features: {}
    };

    let hasAllFeatures = true;
    featureKeys.forEach(fKey => {
      const valStr = rowObj[fKey];
      if (valStr === undefined || valStr === '' || isNaN(valStr)) {
        hasAllFeatures = false;
      } else {
        cleanRow.features[fKey] = parseFloat(valStr);
        cleanRow[fKey] = parseFloat(valStr);
      }
    });

    if (hasAllFeatures) {
      dataset.push(cleanRow);
    }
  }

  return dataset;
}

module.exports = {
  loadCategoryDataset,
  CATEGORY_MAP,
  CATEGORY_FEATURES
};
