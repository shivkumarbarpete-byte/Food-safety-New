/**
 * pythonClient.js
 * ---------------
 * Node (Express) se Python ML service (FastAPI) ko call karne ka chhota helper.
 *
 * Python service default: http://127.0.0.1:8000
 * Badalna ho to .env mein PYTHON_ML_URL set karo.
 *
 * Node 18+ mein fetch built-in hai, isliye axios jaisi library nahi chahiye.
 */

const PYTHON_ML_URL = process.env.PYTHON_ML_URL || 'http://127.0.0.1:8000';
const TIMEOUT_MS = 20000;

class MLServiceError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'MLServiceError';
    this.status = status;
  }
}

// FastAPI error 'detail' kabhi text hota hai, kabhi list (validation error)
function detailToMessage(detail) {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (d.loc ? d.loc.join('.') + ': ' : '') + d.msg)
      .join('; ');
  }
  return 'ML service returned an error';
}

/**
 * callPython('GET',  '/eda',    { query: { category: 'Dairy' } })
 * callPython('POST', '/linear', { body:  { category: 'Dairy' } })
 */
async function callPython(method, path, options) {
  const opts = options || {};
  const url = new URL(path, PYTHON_ML_URL);

  if (opts.query) {
    Object.entries(opts.query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new MLServiceError('ML service timed out. Please try again.', 504);
    }
    throw new MLServiceError(
      'Python ML service is offline. Start it with: python -m uvicorn main:app --port 8000 (inside backend/ml_service)',
      503
    );
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    // JSON nahi aaya - neeche status se handle hoga
  }

  if (!res.ok) {
    const message = detailToMessage(data && data.detail);
    // 4xx (user ki galti) wahi status, 5xx (Python ki galti) -> 502 Bad Gateway
    const status = res.status >= 400 && res.status < 500 ? res.status : 502;
    throw new MLServiceError(message, status);
  }

  return data;
}

module.exports = { callPython, MLServiceError, PYTHON_ML_URL };