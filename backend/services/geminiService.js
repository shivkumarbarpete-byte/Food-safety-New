/**
 * geminiService.js
 * ----------------
 * Google Gemini Vision API Integration for Food Label Parsing.
 * Uses the official @google/genai SDK with model gemini-2.5-flash.
 */

const { GoogleGenAI } = require('@google/genai');

const apiKey = process.env.GEMINI_API_KEY;
let ai = null;

if (apiKey) {
  ai = new GoogleGenAI({ apiKey });
} else {
  console.warn('⚠️ GEMINI_API_KEY is not set. Gemini Vision features will require the API key in environment.');
}

/**
 * Strips markdown code blocks (e.g. ```json ... ```) from Gemini responses.
 * @param {string} rawText
 * @returns {string}
 */
function cleanJsonString(rawText) {
  if (!rawText) return '{}';
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

/**
 * Parses a packaged food label image using Gemini Vision (gemini-2.5-flash).
 *
 * @param {Buffer} imageBuffer - Raw image buffer
 * @param {string} mimeType - e.g. 'image/jpeg', 'image/png', 'image/webp'
 * @returns {Promise<Object>} Structured food label data
 */
async function parseFoodLabel(imageBuffer, mimeType = 'image/jpeg') {
  if (!apiKey || !ai) {
    throw new Error('GEMINI_API_KEY is not configured in the environment variables.');
  }

  if (!imageBuffer || imageBuffer.length === 0) {
    throw new Error('Empty or invalid image buffer provided to parseFoodLabel.');
  }

  const prompt = `You are a Senior Food Safety & Regulatory Compliance Auditor.
Analyze this packaged food label / nutrition information photo carefully.
Extract and return a strict JSON object with this EXACT structure:

{
  "product_name": "string or null if not detected",
  "manufacturing_date": "DD/MM/YYYY or null if not detected",
  "expiry_date": "DD/MM/YYYY or null if not detected",
  "ingredients": ["list of strings of each ingredient"],
  "flagged_additives": ["list of flagged INS/E numbers like E102, E211, INS 621, BHA, TBHQ with short risk note"],
  "allergens": ["list of detected allergens such as Gluten, Peanuts, Dairy, Soy, Egg, Fish, Tree Nuts"],
  "safety_risk_level": "Low | Moderate | High"
}

Rules:
1. Return ONLY the raw valid JSON string. Do not include markdown ticks, conversational text, or explanation.
2. If dates appear in formats like 'MM/YY' or 'Best before 6 months from packaging', convert to the most accurate DD/MM/YYYY or approximate date.
3. If an ingredient or additive is not found, return empty array [].
4. Set safety_risk_level to:
   - "High" if expired, contains toxic preservatives (e.g., Sodium Benzoate with Ascorbic acid, BHA/TBHQ over limits, synthetic azo dyes), or multiple high-risk additives.
   - "Moderate" if near expiry, contains artificial sweeteners, MSG, or high saturated fat/sugar.
   - "Low" if standard, compliant ingredients and valid shelf life.`;

  try {
    const base64Data = imageBuffer.toString('base64');

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType || 'image/jpeg',
              },
            },
          ],
        },
      ],
    });

    const responseText = response.text;
    const jsonStr = cleanJsonString(responseText);
    const parsedData = JSON.parse(jsonStr);

    return {
      product_name: parsedData.product_name || null,
      manufacturing_date: parsedData.manufacturing_date || null,
      expiry_date: parsedData.expiry_date || null,
      ingredients: Array.isArray(parsedData.ingredients) ? parsedData.ingredients : [],
      flagged_additives: Array.isArray(parsedData.flagged_additives) ? parsedData.flagged_additives : [],
      allergens: Array.isArray(parsedData.allergens) ? parsedData.allergens : [],
      safety_risk_level: ['Low', 'Moderate', 'High'].includes(parsedData.safety_risk_level)
        ? parsedData.safety_risk_level
        : 'Low',
    };
  } catch (err) {
    console.error('Gemini Vision API error:', err);
    throw new Error(`Failed to parse label with Gemini Vision: ${err.message}`);
  }
}

module.exports = {
  parseFoodLabel,
};