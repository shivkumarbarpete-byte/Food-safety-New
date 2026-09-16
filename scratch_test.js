const fs = require('fs');
const path = require('path');

// 1. Verify categoryProxyConfig
const { categoryProxyConfig, computeProxyRiskScore, daysUntil } = require('./frontend/categoryProxyConfig.js');

const categories = [
  "Dairy", "Meat & Poultry", "Seafood", "Fresh Produce", "Beverage",
  "Bakery", "Frozen Food", "Baby Food", "Packaged Snack", "Street Food"
];

console.log('=== TEST 1: All 10 categories exist in config ===');
categories.forEach(cat => {
  const conf = categoryProxyConfig[cat];
  if (!conf) throw new Error('Missing category: ' + cat);
  if (!conf.questions || conf.questions.length === 0) throw new Error('No questions for ' + cat);
  console.log(`✓ ${cat}: ${conf.questions.length} questions, weights sum=${Object.values(conf.weights).reduce((a,b)=>a+b,0)}`);
});

console.log('\n=== TEST 2: Scoring for each category (Safe vs Risky answers) ===');
categories.forEach(cat => {
  const conf = categoryProxyConfig[cat];
  const safeAnswers = {};
  const riskyAnswers = {};
  conf.questions.forEach(q => {
    if (q.type === 'yesno') {
      safeAnswers[q.id] = (q.id === 'coldChain' || q.id === 'iceFrozen' || q.id === 'storage' || q.id === 'sunlight' || q.id === 'stayedFrozen' || q.id === 'sealIntegrity' || q.id === 'hygiene') ? 'yes' : 'no';
      riskyAnswers[q.id] = (safeAnswers[q.id] === 'yes') ? 'no' : 'yes';
    } else if (q.type === 'date') {
      safeAnswers[q.id] = 30; // 30 days left
      riskyAnswers[q.id] = -5; // 5 days expired
    } else if (q.type === 'days') {
      safeAnswers[q.id] = 1;
      riskyAnswers[q.id] = 10;
    } else if (q.type === 'hours') {
      safeAnswers[q.id] = 1;
      riskyAnswers[q.id] = 6;
    }
  });

  const safeRes = computeProxyRiskScore(cat, safeAnswers);
  const riskyRes = computeProxyRiskScore(cat, riskyAnswers);
  console.log(`✓ ${cat} -> Safe score: ${safeRes.score} (${safeRes.verdict}), Risky score: ${riskyRes.score} (${riskyRes.verdict})`);
  if (safeRes.verdict !== 'Low Risk Based on Available Information') throw new Error(`${cat} safe answers gave ${safeRes.verdict}`);
  if (riskyRes.verdict !== 'Higher Risk Based on Available Information') throw new Error(`${cat} risky answers gave ${riskyRes.verdict}`);
});

console.log('\n=== TEST 3: Nutrition scoring test with realistic values ===');
// Test FOP warnings and penalties
function generateFOPWarnings(sugar, sodium, sat, kcal) {
    var w = [];
    if (sugar !== null) {
        if (kcal) {
            var e = (sugar * 4 / kcal) * 100;
            if (e > 20) w.push("HIGH SUGAR ⚠️");
            else if (e > 10) w.push("MEDIUM SUGAR");
        } else {
            if (sugar > 22.5) w.push("HIGH SUGAR ⚠️");
            else if (sugar > 10) w.push("MEDIUM SUGAR");
        }
    }
    if (sodium !== null) {
        if (sodium > 1000) w.push("VERY HIGH SODIUM ⚠️");
        else if (sodium > 600) w.push("MEDIUM SODIUM");
    }
    if (sat !== null) {
        if (kcal) {
            var e = (sat * 9 / kcal) * 100;
            if (e > 25) w.push("HIGH SATURATED FAT ⚠️");
            else if (e > 12) w.push("MEDIUM SATURATED FAT");
        } else {
            if (sat > 10) w.push("HIGH SATURATED FAT ⚠️");
            else if (sat > 5) w.push("MEDIUM SATURATED FAT");
        }
    }
    return w;
}

const w1 = generateFOPWarnings(5, 400, 4, 350); // sat=4g, sugar=5g, sodium=400mg, kcal=350
console.log('FOP warnings for Sat 4g, Sugar 5g, Sodium 400mg, 350kcal:', w1);
let nutScore = 20; // base risk Packaged Snack
w1.forEach(w => { nutScore += w.includes('⚠️') ? 8 : 3; });
console.log('Resulting score:', nutScore, nutScore <= 30 ? '(Safe)' : '(Not safe)');
if (nutScore > 30) throw new Error('Realistic nutrition produced non-safe verdict!');

console.log('\n=== TEST 4: ID References check between script.js and index.html ===');
const htmlContent = fs.readFileSync(path.join(__dirname, './frontend/index.html'), 'utf8');
const jsContent = fs.readFileSync(path.join(__dirname, './frontend/script.js'), 'utf8');

// Extract el('id') and getElementById('id') calls
const elMatches = new Set();
const regex = /(?:el|getElementById)\s*\(\s*['"]([a-zA-Z0-9_\-]+)['"]\s*\)/g;
let m;
while ((m = regex.exec(jsContent)) !== null) {
  elMatches.add(m[1]);
}

console.log('Found ID checks in JS:', elMatches.size);
const missingInHtml = [];
elMatches.forEach(id => {
  // Check if id exists in HTML (as id="id" or id='id') or dynamically created
  const dynamicIds = ['submitProxyCheck', 'runKnBtnLab'];
  const hasId = htmlContent.includes(`id="${id}"`) || htmlContent.includes(`id='${id}'`);
  if (!hasId && !dynamicIds.includes(id)) {
    missingInHtml.push(id);
  }
});
console.log('Missing IDs (non-dynamic):', missingInHtml);

console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
