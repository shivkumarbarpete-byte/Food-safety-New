"""
main.py
-------
Food Safety ML & Real-Time Computer Vision Service (FastAPI).

Endpoints:
  GET  /health           Service health check
  GET  /eda              ?category=Dairy        -> EDA stats + scatter points
  GET  /histograms       ?category=Dairy        -> Safe vs Unsafe feature averages
  POST /linear           {category}             -> Linear Regression (Risk_Score)
  POST /logistic         {category, kind}       -> Logistic / Ridge / Lasso
  POST /predict          {category, features}   -> k-NN prediction for a new sample
  POST /detect-freshness Multipart image upload -> YOLOv8 Freshness & Spoilage detection
  POST /api/v1/detect/image Full image detection
  POST /api/v1/detect/frame Compressed webcam stream frame detection (<100ms)
"""

from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from analysis import run_eda, run_histograms
from custom_trainer import predict_custom_model, train_custom_model
from detector import FoodFreshnessDetector
from knn import predict_knn, predict_knn_batch
from label_auditor import FoodLabelAuditor
from models import run_linear_regression, run_logistic

app = FastAPI(
    title="Food Safety ML & Vision Service",
    description="Real-time food safety screening, YOLOv8 freshness detection, and Regulatory Label Auditor",
    version="2.1.0",
)

# 1. Enable CORS for frontend browser calls & Node gateway
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Initialize Model & Auditor Singletons
custom_weights = Path(__file__).resolve().parent / "artifacts" / "best.pt"
freshness_detector = FoodFreshnessDetector(
    model_path=custom_weights,
    fallback_model="yolov8n.pt",
    conf_threshold=0.30,
)
label_auditor = FoodLabelAuditor()


class CategoryRequest(BaseModel):
    category: str = "All"


class LogisticRequest(BaseModel):
    category: str = "All"
    kind: Literal["logistic", "ridge", "lasso"] = "logistic"


class PredictRequest(BaseModel):
    category: str = "Dairy"
    features: dict[str, Any]


class PredictBatchRequest(BaseModel):
    category: str = "Dairy"
    rows: list[dict[str, Any]]


class TrainCustomRequest(BaseModel):
    rows: list[dict[str, Any]]
    target: str = "Safety_Label"
    category: str | None = None
    exclude: list[str] | None = None
    model_type: str = "logistic"
    user_id: str | None = None


class PredictCustomRequest(BaseModel):
    model_id: str
    user_id: str | None = None
    features: dict[str, Any]


def _call(fn, *args, **kwargs):
    """
    ML function wrapper converting internal exceptions to clean HTTP responses.
    """
    try:
        return fn(*args, **kwargs)
    except KeyError as e:
        msg = str(e).strip("'\"")
        raise HTTPException(status_code=404, detail=msg)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "food-safety-ml",
        "vision_model": freshness_detector.model_path,
    }


@app.get("/eda")
def eda(category: str = Query("All")):
    return _call(run_eda, category)


@app.get("/histograms")
def histograms(category: str = Query("All")):
    return _call(run_histograms, category)


@app.post("/linear")
def linear(req: CategoryRequest):
    return _call(run_linear_regression, req.category)


@app.post("/logistic")
def logistic(req: LogisticRequest):
    return _call(run_logistic, req.category, req.kind)


@app.post("/predict")
def predict(req: PredictRequest):
    return _call(predict_knn, req.category, req.features)


@app.post("/predict-batch")
def predict_batch(req: PredictBatchRequest):
    return _call(predict_knn_batch, req.category, req.rows)


@app.post("/train-custom")
def train_custom(req: TrainCustomRequest):
    return _call(
        train_custom_model,
        req.rows,
        req.target,
        req.category,
        req.exclude,
        req.user_id,
        req.model_type,
    )


@app.post("/predict-custom")
def predict_custom(req: PredictCustomRequest):
    return _call(predict_custom_model, req.model_id, req.user_id, req.features)


# --- YOLOv8 Computer Vision Endpoints ---

@app.post("/detect-freshness")
@app.post("/api/v1/detect/image")
async def detect_freshness_endpoint(file: UploadFile = File(...)):
    """
    Accepts multipart/form-data image upload.
    Returns:
      - detected bounding boxes & labels
      - safety verdict ('Safe to Consume' vs 'Unsafe - Spoilage Detected')
      - safety_score (0-100)
      - annotated base64 JPEG image buffer
    """
    allowed_types = ["image/jpeg", "image/png", "image/webp"]
    if file.content_type and file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{file.content_type}'. Please upload JPEG, PNG, or WebP.",
        )
    try:
        image_bytes = await file.read()
        analysis = freshness_detector.predict_image(
            image_bytes=image_bytes,
            render_annotated=True,
            imgsz=640,
        )
        return JSONResponse(content=analysis)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference failure: {str(e)}")


@app.post("/api/v1/detect/frame")
async def detect_frame_endpoint(frame: UploadFile = File(...)):
    """
    Low-latency endpoint optimized for live webcam canvas snapshots (<100ms).
    Uses imgsz=416 for faster inference throughput.
    """
    try:
        image_bytes = await frame.read()
        analysis = freshness_detector.predict_image(
            image_bytes=image_bytes,
            render_annotated=True,
            imgsz=416,
        )
        return JSONResponse(content=analysis)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Frame processing failure: {str(e)}")


@app.post("/api/v1/audit-label")
@app.post("/audit-label")
async def audit_label_endpoint(file: UploadFile = File(...)):
    """
    Smart Food Label & Regulatory Safety Auditor.
    Accepts food label photo (JPEG, PNG, WEBP).
    Returns:
      - Parsed Manufacturing (MFG) & Expiry (EXP) dates
      - Shelf-life calculation (days remaining / expired / near expiry)
      - Detected Harmful/Restricted Additives (INS / E-numbers)
      - Detected Allergen declarations
      - Dynamic Regulatory Safety Index (0-100) & Actionable Verdict
    """
    allowed_types = ["image/jpeg", "image/png", "image/webp"]
    if file.content_type and file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{file.content_type}'. Please upload an image file (JPEG, PNG, WebP).",
        )
    try:
        image_bytes = await file.read()
        audit_result = label_auditor.audit_label(image_bytes)
        return JSONResponse(content=audit_result, status_code=200)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Label audit engine error: {str(e)}")