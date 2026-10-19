"""
main.py
-------
Food Safety ML Service (FastAPI).

Node/Express backend isi service ko call karega (port 8000).
Browser se seedha call nahi hota - isliye CORS ki zaroorat nahi.

Endpoints:
  GET  /health      service chal rahi hai ya nahi
  GET  /eda         ?category=Dairy        -> EDA stats + scatter points
  GET  /histograms  ?category=Dairy        -> Safe vs Unsafe feature averages
  POST /linear      {category}             -> Linear Regression (Risk_Score)
  POST /logistic    {category, kind}       -> Logistic / Ridge / Lasso
  POST /predict     {category, features}   -> k-NN prediction for a new sample
"""

from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

from analysis import run_eda, run_histograms
from custom_trainer import predict_custom_model, train_custom_model
from knn import predict_knn, predict_knn_batch
from models import run_linear_regression, run_logistic

app = FastAPI(title="Food Safety ML Service", version="1.0.0")


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
    user_id: str | None = None


class PredictCustomRequest(BaseModel):
    model_id: str
    user_id: str | None = None
    features: dict[str, Any]


def _call(fn, *args, **kwargs):
    """
    ML function chalata hai aur errors ko sahi HTTP status mein badalta hai.
      KeyError         -> 404 (model expired / not found)
      ValueError       -> 400 (user ka galat input / kam data)
      FileNotFoundError-> 500 (dataset file nahi mili)
      baaki errors     -> FastAPI khud 500 deta hai
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
    return {"status": "ok", "service": "food-safety-ml"}


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
    return _call(train_custom_model, req.rows, req.target, req.category, req.exclude, req.user_id)


@app.post("/predict-custom")
def predict_custom(req: PredictCustomRequest):
    return _call(predict_custom_model, req.model_id, req.user_id, req.features)