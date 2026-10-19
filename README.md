# Food Safety Hub

A full-stack food safety screening and information platform.  
Users can scan barcodes, upload product labels (OCR), or enter product details manually.  
An advanced ML lab mode runs EDA, regression, classification, and k-NN prediction — all powered by a Python FastAPI service.

🔗 **Live Demo:** [https://food-safety-new.vercel.app/](https://food-safety-new.vercel.app/)

---

## Architecture

```
Browser (HTML/CSS/JS)
        │  fetch /api/ml/*  (port 5000)
        ▼
Node.js / Express  ──  /api/auth, /api/reviews  ──▶  MongoDB Atlas
        │  HTTP proxy via pythonClient.js
        ▼
Python FastAPI  (port 8000)
        │
        ▼
scikit-learn ML models
(Linear Regression, Logistic/Ridge/Lasso, k-NN)
```

---

## API Endpoints

### Auth & Reviews (Express, port 5000)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/signup` | Register a new user |
| POST | `/api/auth/login` | Login, receive JWT |
| GET / POST / DELETE | `/api/reviews` | Save / fetch / clear scan history |

### ML (Express → FastAPI proxy, port 5000 → 8000)
| Method | Path | Body / Query | Description |
|--------|------|--------------|-------------|
| GET | `/api/ml/eda` | `?category=Dairy` | EDA statistics + scatter data |
| GET | `/api/ml/histograms` | `?category=Dairy` | Safe vs Unsafe feature averages |
| POST | `/api/ml/linear` | `{"category":"Dairy"}` | Linear Regression on Risk_Score |
| POST | `/api/ml/logistic` | `{"category":"Dairy","kind":"logistic"}` | Logistic Regression (Safe/Unsafe) |
| POST | `/api/ml/logistic` | `{"category":"Dairy","kind":"ridge"}` | Ridge (L2) classification |
| POST | `/api/ml/logistic` | `{"category":"Dairy","kind":"lasso"}` | Lasso (L1) classification |
| POST | `/api/ml/predict` | `{"category":"Dairy","features":{...}}` | k-NN prediction for a new sample |
| GET | `/api/ml/dataset` | `?category=All` | Raw dataset rows (legacy JS loader) |

> **Note on accuracy:** The dataset is **synthetic** (800 generated samples).  
> Very high model accuracy (95–100 %) is expected and is a known characteristic of synthetic data — it demonstrates the ML pipeline, not real-world generalisability.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, Vanilla JS, Chart.js, jsPDF, Quagga2, Tesseract.js |
| Backend API | Node.js 18+, Express.js |
| Database | MongoDB Atlas (Mongoose) |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| ML Service | Python 3.13, FastAPI, uvicorn |
| ML Models | scikit-learn (LinearRegression, LogisticRegression, KNeighborsClassifier) |
| Data | pandas, numpy |

---

## Project Structure

```
FOOD SAFETY NEW/
├── frontend/
│   ├── index.html          # Single-page app
│   ├── script.js           # Main frontend logic
│   ├── mlAnalysis.js       # Thin ML client (calls /api/ml/*)
│   ├── categoryProxyConfig.js
│   └── style.css
├── backend/
│   ├── server.js           # Express entry point (port 5000)
│   ├── .env                # Secrets — never commit
│   ├── .env.example        # Variable names with placeholders
│   ├── routes/
│   ├── controllers/
│   ├── models/
│   ├── ml/                 # JS helpers (datasetLoader, pythonClient, knnModel)
│   └── ml_service/         # Python FastAPI ML service
│       ├── main.py         # FastAPI app (port 8000)
│       ├── models.py       # Linear / Logistic / Ridge / Lasso
│       ├── knn.py          # k-NN prediction
│       ├── analysis.py     # EDA + histograms
│       ├── data_loader.py  # pandas dataset loader
│       ├── requirements.txt
│       └── venv/           # Python virtual environment
└── README.md
```

---

## How to Run (Windows PowerShell)

### Prerequisites
- Node.js 18+ and npm
- Python 3.13
- MongoDB Atlas account (or local MongoDB)

### 1 — Clone and configure environment

```powershell
git clone <repo-url>
cd "FOOD SAFETY NEW"

# Copy the example env and fill in your values
Copy-Item backend\.env.example backend\.env
# Now open backend\.env and set MONGO_URI and JWT_SECRET
```

### 2 — Start the Node / Express server (Terminal 1)

```powershell
cd backend
npm install
node server.js
# Expected output:  🚀 Server running on http://localhost:5000
```

### 3 — Start the Python FastAPI ML service (Terminal 2)

```powershell
cd "backend\ml_service"

# Create the virtual environment (first time only)
python -m venv venv

# Activate
.\venv\Scripts\Activate.ps1

# Install dependencies (first time only, or after requirements.txt changes)
pip install -r requirements.txt

# Start the service
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
# Expected output:  Uvicorn running on http://0.0.0.0:8000
```

### 4 — Open the app

Open `frontend/index.html` directly in your browser, **or** serve it with any static file server:

```powershell
# Option A — VS Code Live Server extension (recommended)
# Option B — Python one-liner (from project root)
python -m http.server 3000 --directory frontend
# Then open http://localhost:3000
```

---

## Environment Variables

See [`backend/.env.example`](backend/.env.example) for the full list.  
Copy it to `backend/.env` and fill in real values — **never commit `.env`**.

| Variable | Description |
|----------|-------------|
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret key for signing JWT tokens |
| `PORT` | Express server port (default `5000`) |
| `PYTHON_ML_URL` | FastAPI ML service URL (default `http://localhost:8000`) |

---

## Machine Learning

- **Dataset:** 800 synthetic food samples across 10 categories (Dairy, Meat & Poultry, Seafood, Fresh Produce, Beverage, Bakery, Frozen Food, Baby Food, Packaged Snack, Street Food)
- **Features per category:** pH, Moisture (%), Temperature (°C), Storage Days, plus category-specific features (e.g., Fat %, Titratable Acidity for Dairy)
- **Target variables:** `Risk_Score` (0–100, continuous) and `Safety_Label` (0 = Safe, 1 = Unsafe)
- **Train / Test split:** 80 / 20, stratified, `random_state=42`
- **Scaling:** `StandardScaler` fitted on training data only

> ⚠️ **High accuracy is expected** — the dataset is synthetic, so models can achieve near-perfect scores. This is by design; the purpose is to demonstrate the full ML pipeline (EDA → regression → classification → k-NN prediction), not to generalise to real lab data.

---

## Authors

**Shivkumar Barpete**, **Parag Admache**, **Nilesh Dhakad**  
Institution: Indian Institute of Information Technology, Bhopal  
Course: Master of Computer Applications (MCA)  
GitHub: [@shivkumarbarpete-byte](https://github.com/shivkumarbarpete-byte)  
Contact: shivkirar78@gmail.com
