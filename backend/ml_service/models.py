"""
models.py
---------
Inference-only module for Linear, Logistic, Ridge, and Lasso models.
Loads pre-trained model artifacts from disk (trained via train_models.py)
and returns cached metrics/evaluations and sample predictions without
running any runtime training inside the serverless/request loop.
"""

from pathlib import Path
import joblib
import numpy as np

from data_loader import normalize_category

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"
MODELS_PKL_PATH = ARTIFACTS_DIR / "pretrained_models.pkl"

MIN_ROWS = 10

# Global in-memory cache for loaded artifacts
PRETRAINED_ARTIFACTS = None


def load_artifacts():
    global PRETRAINED_ARTIFACTS
    if PRETRAINED_ARTIFACTS is None:
        if not MODELS_PKL_PATH.exists():
            raise FileNotFoundError(
                f"Pre-trained models artifact not found at {MODELS_PKL_PATH}. "
                "Please run `python train_models.py` locally to generate model artifacts."
            )
        PRETRAINED_ARTIFACTS = joblib.load(MODELS_PKL_PATH)
    return PRETRAINED_ARTIFACTS


def run_linear_regression(category="All"):
    """
    Returns pre-trained Linear Regression metrics, feature influence,
    and sample prediction for the requested category without training at runtime.
    """
    artifacts = load_artifacts()
    norm_cat = normalize_category(category)
    linear_models = artifacts.get("linear_models", {})

    if norm_cat not in linear_models:
        raise ValueError(f"No pre-trained Linear Regression model found for category: {category}")

    return linear_models[norm_cat]["result"]


def run_logistic(category="All", kind="logistic"):
    """
    Returns pre-trained Logistic / Ridge / Lasso metrics, confusion matrix,
    feature influence, and sample prediction without training at runtime.
    """
    artifacts = load_artifacts()
    norm_cat = normalize_category(category)
    key = f"{norm_cat}:{kind}"
    logistic_models = artifacts.get("logistic_models", {})

    if key not in logistic_models:
        raise ValueError(f"No pre-trained {kind} model found for category: {category}")

    return logistic_models[key]["result"]