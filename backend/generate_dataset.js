const fs = require('fs');
const path = require('path');

const categories = [
  {
    name: 'Dairy',
    cols: ['pH', 'Fat_Percent', 'Titratable_Acidity'],
    gen: (i) => {
      const isUnsafe = i >= 48; // 60% safe, 40% unsafe
      const temp = isUnsafe ? 12 + Math.random() * 10 : 2 + Math.random() * 6;
      const moisture = 80 + Math.random() * 15;
      const days = isUnsafe ? 10 + Math.random() * 15 : 1 + Math.random() * 6;
      const ph = isUnsafe ? 4.2 + Math.random() * 1.0 : 6.4 + Math.random() * 0.4;
      const fat = 3.0 + Math.random() * 4.0;
      const acidity = isUnsafe ? 0.25 + Math.random() * 0.2 : 0.12 + Math.random() * 0.05;
      const riskScore = Math.min(100, Math.max(0, isUnsafe ? 65 + Math.random() * 30 : 10 + Math.random() * 30));
      return {
        Temperature_C: temp.toFixed(1),
        Moisture_percent: moisture.toFixed(1),
        Storage_Days: days.toFixed(0),
        pH: ph.toFixed(2),
        Fat_Percent: fat.toFixed(1),
        Titratable_Acidity: acidity.toFixed(2),
        Risk_Score: riskScore.toFixed(1),
        Safety_Label: isUnsafe ? 1 : 0
      };
    }
  },
  {
    name: 'Meat_Poultry',
    cols: ['pH', 'Color_Score'],
    gen: (i) => {
      const isUnsafe = i >= 48;
      const temp = isUnsafe ? 10 + Math.random() * 8 : 1 + Math.random() * 4;
      const moisture = 70 + Math.random() * 10;
      const days = isUnsafe ? 7 + Math.random() * 10 : 1 + Math.random() * 4;
      const ph = isUnsafe ? 6.8 + Math.random() * 0.8 : 5.6 + Math.random() * 0.4;
      const color = isUnsafe ? 1 + Math.random() * 3 : 7 + Math.random() * 3;
      const riskScore = Math.min(100, Math.max(0, isUnsafe ? 70 + Math.random() * 25 : 12 + Math.random() * 25));
      return {
        Temperature_C: temp.toFixed(1),
        Moisture_percent: moisture.toFixed(1),
        Storage_Days: days.toFixed(0),
        pH: ph.toFixed(2),
        Color_Score: color.toFixed(1),
        Risk_Score: riskScore.toFixed(1),
        Safety_Label: isUnsafe ? 1 : 0
      };
    }
  },
  {
    name: 'Seafood',
    cols: ['TVBN_Level'],
    gen: (i) => {
      const isUnsafe = i >= 48;
      const temp = isUnsafe ? 8 + Math.random() * 10 : -2 + Math.random() * 4;
      const moisture = 75 + Math.random() * 10;
      const days = isUnsafe ? 5 + Math.random() * 5 : 0 + Math.random() * 3;
      const tvbn = isUnsafe ? 35 + Math.random() * 30 : 8 + Math.random() * 12; // >30 mg/100g spoiled
      const riskScore = Math.min(100, Math.max(0, isUnsafe ? 75 + Math.random() * 25 : 8 + Math.random() * 25));
      return {
        Temperature_C: temp.toFixed(1),
        Moisture_percent: moisture.toFixed(1),
        Storage_Days: days.toFixed(0),
        TVBN_Level: tvbn.toFixed(1),
        Risk_Score: riskScore.toFixed(1),
        Safety_Label: isUnsafe ? 1 : 0
      };
    }
  },
  {
    name: 'Fresh_Produce',
    cols: ['Ripeness_Index'],
    gen: (i) => {
      const isUnsafe = i >= 48;
      const temp = isUnsafe ? 25 + Math.random() * 10 : 8 + Math.random() * 6;
      const moisture = 85 + Math.random() * 10;
      const days = isUnsafe ? 10 + Math.random() * 10 : 1 + Math.random() * 5;
      const ripeness = isUnsafe ? 9 + Math.random() * 1 : 4 + Math.random() * 3;
      const riskScore = Math.min(100, Math.max(0, isUnsafe ? 60 + Math.random() * 35 : 10 + Math.random() * 30));
      return {
        Temperature_C: temp.toFixed(1),
        Moisture_percent: moisture.toFixed(1),
        Storage_Days: days.toFixed(0),
        Ripeness_Index: ripeness.toFixed(1),
        Risk_Score: riskScore.toFixed(1),
        Safety_Label: isUnsafe ? 1 : 0
      };
    }
  },
  {
    name: 'Beverage',
    cols: ['pH', 'Sugar_Content_Percent'],
    gen: (i) => {
      const isUnsafe = i >= 48;
      const temp = isUnsafe ? 28 + Math.random() * 10 : 4 + Math.random() * 8;
      const moisture = 90 + Math.random() * 8;
      const days = isUnsafe ? 30 + Math.random() * 60 : 2 + Math.random() * 20;
      const ph = isUnsafe ? 5.5 + Math.random() * 1.5 : 3.0 + Math.random() * 0.8;
      const sugar = 5.0 + Math.random() * 15.0;
      const riskScore = Math.min(100, Math.max(0, isUnsafe ? 55 + Math.random() * 40 : 5 + Math.random() * 25));
      return {
        Temperature_C: temp.toFixed(1),
        Moisture_percent: moisture.toFixed(1),
        Storage_Days: days.toFixed(0),
        pH: ph.toFixed(2),
        Sugar_Content_Percent: sugar.toFixed(1),
        Risk_Score: riskScore.toFixed(1),
        Safety_Label: isUnsafe ? 1 : 0
      };
    }
  },
  {
    name: 'Bakery',
    cols: ['Mold_Risk_Index'],
    gen: (i) => {
      const isUnsafe = i >= 48;
      const temp = isUnsafe ? 28 + Math.random() * 8 : 18 + Math.random() * 5;
      const moisture = isUnsafe ? 35 + Math.random() * 15 : 15 + Math.random() * 10;
      const days = isUnsafe ? 8 + Math.random() * 10 : 1 + Math.random() * 4;
      const mold = isUnsafe ? 7 + Math.random() * 3 : 1 + Math.random() * 3;
      const riskScore = Math.min(100, Math.max(0, isUnsafe ? 65 + Math.random() * 30 : 10 + Math.random() * 25));
      return {
        Temperature_C: temp.toFixed(1),
        Moisture_percent: moisture.toFixed(1),
        Storage_Days: days.toFixed(0),
        Mold_Risk_Index: mold.toFixed(1),
        Risk_Score: riskScore.toFixed(1),
        Safety_Label: isUnsafe ? 1 : 0
      };
    }
  },
  {
    name: 'Frozen_Food',
    cols: ['Temp_Deviation_Neg18'],
    gen: (i) => {
      const isUnsafe = i >= 48;
      const temp = isUnsafe ? -5 + Math.random() * 10 : -22 + Math.random() * 3;
      const moisture = 60 + Math.random() * 20;
      const days = isUnsafe ? 60 + Math.random() * 120 : 10 + Math.random() * 40;
      const deviation = isUnsafe ? 10 + Math.random() * 15 : 0 + Math.random() * 3; // deviation from -18
      const riskScore = Math.min(100, Math.max(0, isUnsafe ? 70 + Math.random() * 28 : 8 + Math.random() * 25));
      return {
        Temperature_C: temp.toFixed(1),
        Moisture_percent: moisture.toFixed(1),
        Storage_Days: days.toFixed(0),
        Temp_Deviation_Neg18: deviation.toFixed(1),
        Risk_Score: riskScore.toFixed(1),
        Safety_Label: isUnsafe ? 1 : 0
      };
    }
  },
  {
    name: 'Baby_Food',
    cols: ['pH'],
    gen: (i) => {
      const isUnsafe = i >= 48;
      const temp = isUnsafe ? 25 + Math.random() * 10 : 4 + Math.random() * 4;
      const moisture = 75 + Math.random() * 15;
      const days = isUnsafe ? 15 + Math.random() * 20 : 1 + Math.random() * 5;
      const ph = isUnsafe ? 4.5 + Math.random() * 1.5 : 6.2 + Math.random() * 0.4;
      const riskScore = Math.min(100, Math.max(0, isUnsafe ? 75 + Math.random() * 25 : 5 + Math.random() * 20));
      return {
        Temperature_C: temp.toFixed(1),
        Moisture_percent: moisture.toFixed(1),
        Storage_Days: days.toFixed(0),
        pH: ph.toFixed(2),
        Risk_Score: riskScore.toFixed(1),
        Safety_Label: isUnsafe ? 1 : 0
      };
    }
  },
  {
    name: 'Packaged_Snack',
    cols: ['Oil_Rancidity_Index'],
    gen: (i) => {
      const isUnsafe = i >= 48;
      const temp = isUnsafe ? 32 + Math.random() * 10 : 22 + Math.random() * 5;
      const moisture = isUnsafe ? 8 + Math.random() * 8 : 2 + Math.random() * 3;
      const days = isUnsafe ? 120 + Math.random() * 100 : 10 + Math.random() * 60;
      const rancidity = isUnsafe ? 5.5 + Math.random() * 6.0 : 0.5 + Math.random() * 2.0;
      const riskScore = Math.min(100, Math.max(0, isUnsafe ? 65 + Math.random() * 30 : 10 + Math.random() * 25));
      return {
        Temperature_C: temp.toFixed(1),
        Moisture_percent: moisture.toFixed(1),
        Storage_Days: days.toFixed(0),
        Oil_Rancidity_Index: rancidity.toFixed(1),
        Risk_Score: riskScore.toFixed(1),
        Safety_Label: isUnsafe ? 1 : 0
      };
    }
  },
  {
    name: 'Street_Food',
    cols: ['Hygiene_Score'],
    gen: (i) => {
      const isUnsafe = i >= 48;
      const temp = isUnsafe ? 35 + Math.random() * 10 : 4 + Math.random() * 5;
      const moisture = 50 + Math.random() * 30;
      const days = isUnsafe ? 2 + Math.random() * 4 : 0 + Math.random() * 1;
      const hygiene = isUnsafe ? 1 + Math.random() * 4 : 8 + Math.random() * 2;
      const riskScore = Math.min(100, Math.max(0, isUnsafe ? 75 + Math.random() * 25 : 12 + Math.random() * 25));
      return {
        Temperature_C: temp.toFixed(1),
        Moisture_percent: moisture.toFixed(1),
        Storage_Days: days.toFixed(0),
        Hygiene_Score: hygiene.toFixed(1),
        Risk_Score: riskScore.toFixed(1),
        Safety_Label: isUnsafe ? 1 : 0
      };
    }
  }
];

const allColumns = [
  'Category',
  'Temperature_C',
  'Moisture_percent',
  'Storage_Days',
  'pH',
  'Fat_Percent',
  'Titratable_Acidity',
  'Color_Score',
  'TVBN_Level',
  'Ripeness_Index',
  'Sugar_Content_Percent',
  'Mold_Risk_Index',
  'Temp_Deviation_Neg18',
  'Oil_Rancidity_Index',
  'Hygiene_Score',
  'Risk_Score',
  'Safety_Label'
];

const rows = [allColumns.join(',')];

categories.forEach(cat => {
  for (let i = 0; i < 80; i++) {
    const data = cat.gen(i);
    const row = allColumns.map(col => {
      if (col === 'Category') return cat.name;
      return data[col] !== undefined ? data[col] : '';
    });
    rows.push(row.join(','));
  }
});

const outDir = path.join(__dirname, 'data');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const outFile = path.join(outDir, 'food_safety_dataset_by_category.csv');
fs.writeFileSync(outFile, rows.join('\n'), 'utf8');
console.log(`Generated ${rows.length - 1} rows in ${outFile}`);
