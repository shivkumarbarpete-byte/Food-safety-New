/* ============================================================
   categoryProxyConfig.js
   ------------------------------------------------------------
   Consumer-mode proxy risk scoring — NO pH / moisture / temperature
   sensor needed. Uses printed date info + self-reported storage
   condition + visual/sensory checks, weighted per food category.

   Paste this into script.js (or include as a separate <script> tag
   before script.js). It does NOT touch analyze(), nutritionTraffic(),
   getRealDataset(), or any ML/backend logic — this is a fully
   separate "Consumer Proxy Check" module.
   ============================================================ */

/**
 * Each category defines:
 *  - weights: how much each of the 3 axes contributes to the
 *    final risk score (must sum to 100)
 *  - questions: the actual proxy questions shown to the customer.
 *    Each question belongs to one axis ("time" | "coldChain" | "physical")
 *    and has a riskValue (0-100) that gets scaled by its axis weight
 *    when the "risky" answer is selected.
 */
const categoryProxyConfig = {
  "Dairy": {
    weights: { time: 35, coldChain: 40, physical: 25 },
    questions: [
      { id: "expiry", axis: "time", type: "date",
        label: "What is the expiry / best-before date on the pack?",
        risk: (daysLeft) => daysLeft < 0 ? 100 : daysLeft <= 1 ? 60 : 0 },
      { id: "coldChain", axis: "coldChain", type: "yesno",
        label: "Was it stored/purchased from a refrigerated section?",
        risk: (ans) => ans === "no" ? 100 : 0 },
      { id: "sealPuff", axis: "physical", type: "yesno",
        label: "Is the seal damaged or is the pack puffed/bulging?",
        risk: (ans) => ans === "yes" ? 100 : 0 },
      { id: "smell", axis: "physical", type: "yesno",
        label: "(If opened) Any sour smell or curdling?",
        risk: (ans) => ans === "yes" ? 100 : 0, optional: true }
    ]
  },

  "Meat & Poultry": {
    weights: { time: 30, coldChain: 45, physical: 25 },
    questions: [
      { id: "useBy", axis: "time", type: "date",
        label: "What is the USE-BY date on the pack?",
        risk: (daysLeft) => daysLeft < 0 ? 100 : daysLeft === 0 ? 50 : 0 },
      { id: "coldChain", axis: "coldChain", type: "yesno",
        label: "Was it kept frozen/chilled continuously since purchase?",
        risk: (ans) => ans === "no" ? 100 : 0 },
      { id: "colorLeak", axis: "physical", type: "yesno",
        label: "Any grey/green discoloration or excess liquid/blood pooling?",
        risk: (ans) => ans === "yes" ? 100 : 0 }
    ]
  },

  "Seafood": {
    weights: { time: 30, coldChain: 45, physical: 25 },
    questions: [
      { id: "useBy", axis: "time", type: "date",
        label: "What is the USE-BY date on the pack?",
        risk: (daysLeft) => daysLeft < 0 ? 100 : daysLeft === 0 ? 60 : 0 },
      { id: "iceFrozen", axis: "coldChain", type: "yesno",
        label: "Was it on ice or frozen when purchased?",
        risk: (ans) => ans === "no" ? 100 : 0 },
      { id: "ammoniaSmell", axis: "physical", type: "yesno",
        label: "(If opened) Sharp ammonia-like smell?",
        risk: (ans) => ans === "yes" ? 100 : 0, optional: true }
    ]
  },

  "Fresh Produce": {
    weights: { time: 30, coldChain: 15, physical: 55 },
    questions: [
      { id: "purchaseAge", axis: "time", type: "days",
        label: "How many days ago was this purchased?",
        risk: (days) => days > 7 ? 60 : days > 4 ? 25 : 0 },
      { id: "storage", axis: "coldChain", type: "yesno",
        label: "Stored in fridge/cool place since purchase?",
        risk: (ans) => ans === "no" ? 50 : 0 },
      { id: "moldSpots", axis: "physical", type: "yesno",
        label: "Any visible mold, dark spots, or excessive softness?",
        risk: (ans) => ans === "yes" ? 100 : 0 }
    ]
  },

  "Beverage": {
    weights: { time: 40, coldChain: 20, physical: 40 },
    questions: [
      { id: "expiry", axis: "time", type: "date",
        label: "Expiry date on the label?",
        risk: (daysLeft) => daysLeft < 0 ? 100 : 0 },
      { id: "sunlight", axis: "coldChain", type: "yesno",
        label: "Was it stored away from direct sunlight/heat?",
        risk: (ans) => ans === "no" ? 40 : 0 },
      { id: "bulging", axis: "physical", type: "yesno",
        label: "Cap tampered, leaking, or bottle bulging?",
        risk: (ans) => ans === "yes" ? 100 : 0 }
    ]
  },

  "Bakery": {
    weights: { time: 45, coldChain: 15, physical: 40 },
    questions: [
      { id: "bestBefore", axis: "time", type: "date",
        label: "Best-before date on the pack?",
        risk: (daysLeft) => daysLeft < 0 ? 100 : daysLeft === 0 ? 40 : 0 },
      { id: "roomExposure", axis: "coldChain", type: "days",
        label: "Days left unrefrigerated/opened at room temp?",
        risk: (days) => days > 2 ? 50 : 0 },
      { id: "mold", axis: "physical", type: "yesno",
        label: "Any visible mold or unusual texture?",
        risk: (ans) => ans === "yes" ? 100 : 0 }
    ]
  },

  "Frozen Food": {
    weights: { time: 20, coldChain: 55, physical: 25 },
    questions: [
      { id: "expiry", axis: "time", type: "date",
        label: "Expiry date on the pack?",
        risk: (daysLeft) => daysLeft < 0 ? 100 : 0 },
      { id: "stayedFrozen", axis: "coldChain", type: "yesno",
        label: "Was it FROZEN (not just chilled) the entire time, with no thaw-refreeze?",
        risk: (ans) => ans === "no" ? 100 : 0 },
      { id: "freezerBurn", axis: "physical", type: "yesno",
        label: "Visible ice crystals, frost, or freezer burn on the food?",
        risk: (ans) => ans === "yes" ? 60 : 0 }
    ]
  },

  "Baby Food": {
    weights: { time: 35, coldChain: 25, physical: 40 },
    questions: [
      { id: "expiry", axis: "time", type: "date",
        label: "Expiry date on the pack?",
        risk: (daysLeft) => daysLeft < 0 ? 100 : daysLeft <= 2 ? 50 : 0 },
      { id: "coldChain", axis: "coldChain", type: "yesno",
        label: "Stored as per label instructions (fridge if required)?",
        risk: (ans) => ans === "no" ? 100 : 0 },
      { id: "sealIntegrity", axis: "physical", type: "yesno",
        label: "Is the safety seal / tamper-band fully intact?",
        risk: (ans) => ans === "no" ? 100 : 0 }
    ]
  },

  "Packaged Snack": {
    weights: { time: 40, coldChain: 10, physical: 50 },
    questions: [
      { id: "expiry", axis: "time", type: "date",
        label: "Expiry date on the pack?",
        risk: (daysLeft) => daysLeft < 0 ? 100 : 0 },
      { id: "storage", axis: "coldChain", type: "yesno",
        label: "Stored in a dry place (not damp/humid)?",
        risk: (ans) => ans === "no" ? 30 : 0 },
      { id: "packDamage", axis: "physical", type: "yesno",
        label: "Packaging puffed, torn, or damaged?",
        risk: (ans) => ans === "yes" ? 100 : 0 }
    ]
  },

  "Street Food": {
    // No barcode/expiry available — different flow, hygiene/time-since-made based
    weights: { time: 50, coldChain: 0, physical: 50 },
    questions: [
      { id: "timeSinceMade", axis: "time", type: "hours",
        label: "Roughly how many hours ago was it prepared/cooked?",
        risk: (hrs) => hrs > 4 ? 80 : hrs > 2 ? 35 : 0 },
      { id: "hygiene", axis: "physical", type: "yesno",
        label: "Did the stall/vendor area look visibly clean and hygienic?",
        risk: (ans) => ans === "no" ? 100 : 0 }
    ]
  }
};

/**
 * Computes a 0-100 proxy risk score for a given category and the
 * customer's answers, using the category's axis weights.
 *
 * @param {string} category - must match a key in categoryProxyConfig
 * @param {Object} answers  - { questionId: rawAnswerValue, ... }
 *                             date fields: pass daysLeft (number) you've
 *                             already computed from the picked date.
 * @returns {{ score: number, verdict: string, breakdown: Object }}
 */
function computeProxyRiskScore(category, answers) {
  const config = categoryProxyConfig[category];
  if (!config) {
    return { score: 0, verdict: "Unknown category", breakdown: {} };
  }

  // Sum risk contribution per axis (each question's risk() returns 0-100,
  // scaled by that axis's weight / 100, then averaged if multiple
  // questions share an axis).
  const axisTotals = {};   // axis -> { sum, count }
  const breakdown = {};    // questionId -> contribution for transparency

  config.questions.forEach(q => {
    if (q.optional && (answers[q.id] === undefined || answers[q.id] === "")) {
      return; // skip unanswered optional questions
    }
    const rawRisk = q.risk(answers[q.id]); // 0-100
    if (!axisTotals[q.axis]) axisTotals[q.axis] = { sum: 0, count: 0 };
    axisTotals[q.axis].sum += rawRisk;
    axisTotals[q.axis].count += 1;
    breakdown[q.id] = rawRisk;
  });

  let finalScore = 0;
  Object.keys(axisTotals).forEach(axis => {
    const avgAxisRisk = axisTotals[axis].sum / axisTotals[axis].count; // 0-100
    const weight = (config.weights[axis] || 0) / 100;
    finalScore += avgAxisRisk * weight;
  });

  finalScore = Math.round(finalScore);

  let verdict;
  if (finalScore >= 60) verdict = "Higher Risk Based on Available Information";
  else if (finalScore >= 30) verdict = "Moderate Risk Based on Available Information";
  else verdict = "Low Risk Based on Available Information";

  return { score: finalScore, verdict, breakdown };
}

/**
 * Helper: converts a date input value into "days left" (negative = expired).
 * Use this before calling computeProxyRiskScore for any "date" type question.
 */
function daysUntil(dateString) {
  const target = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

/* ------------------------------------------------------------
   Example usage (wire this into your consumer-mode form):

   const category = "Dairy";
   const answers = {
     expiry: daysUntil(document.getElementById("p_expiry").value),
     coldChain: document.getElementById("p_coldchain").value, // "yes"/"no"
     sealPuff: document.getElementById("p_seal").value,       // "yes"/"no"
     smell: document.getElementById("p_smell").value          // "yes"/"no"/""
   };
   const result = computeProxyRiskScore(category, answers);
   console.log(result); // { score, verdict, breakdown }

   To dynamically render the right questions for a category:
   categoryProxyConfig[category].questions.forEach(q => {
     // build an input based on q.type (date / yesno / days / hours)
     // using q.id as the field id and q.label as the prompt text
   });
   ------------------------------------------------------------ */

if (typeof window !== 'undefined') {
  window.categoryProxyConfig = categoryProxyConfig;
  window.computeProxyRiskScore = computeProxyRiskScore;
  window.daysUntil = daysUntil;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { categoryProxyConfig, computeProxyRiskScore, daysUntil };
}
