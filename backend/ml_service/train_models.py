"""
train_models.py
---------------
Standalone offline/local training script for Food Safety ML models.
Trains models on local data/CSV, computes evaluation metrics, and serializes
trained model artifacts and metrics into pre-trained files (artifacts/...)
so that serverless backends (e.g. Vercel, Express, FastAPI) only perform
fast inference and never run training at request time.
"""

import json
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from data_loader import CATEGORY_FEATURES, get_feature_keys, load_category_dataset, normalize_category

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"
MODELS_PKL_PATH = ARTIFACTS_DIR / "pretrained_models.pkl"
METRICS_JSON_PATH = ARTIFACTS_DIR / "model_metrics.json"

TEST_SIZE = 0.2
RANDOM_STATE = 42
MIN_ROWS = 10
DEFAULT_K = 5

LOGISTIC_VARIANTS = {
    "logistic": {"title": "Logistic Regression", "params": {"C": 1e6}},
    "ridge": {"title": "Ridge Regression (L2)", "params": {"C": 1.0, "l1_ratio": 0.0}},
    "lasso": {"title": "Lasso Regression (L1)", "params": {"C": 1.0, "l1_ratio": 1.0, "solver": "saga"}},
}

CATEGORIES = [
    "All",
    "Dairy",
    "Meat & Poultry",
    "Seafood",
    "Fresh Produce",
    "Beverage",
    "Bakery",
    "Frozen Food",
    "Baby Food",
    "Packaged Snack",
    "Street Food",
]


def prepare_training_data(category, target):
    """Data load -> train/test split -> scaling."""
    cat = normalize_category(category)
    df = load_category_dataset(cat)
    if len(df) < MIN_ROWS:
        raise ValueError(f"Not enough dataset samples for {category}: found {len(df)}")

    feature_keys = get_feature_keys(cat)
    X = df[feature_keys].to_numpy(dtype=float)
    y = df[target].to_numpy()
    labels = df["Safety_Label"].to_numpy()

    counts = np.bincount(labels, minlength=2)
    stratify = labels if counts.min() >= 2 else None

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=stratify
    )

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)

    return {
        "category": cat,
        "feature_keys": feature_keys,
        "X_train": X_train_s,
        "X_test": X_test_s,
        "y_train": y_train,
        "y_test": y_test,
        "n_total": int(len(df)),
        "n_safe": int((labels == 0).sum()),
        "n_unsafe": int((labels == 1).sum()),
        "scaler": scaler,
    }


def _risk_level(score: float) -> str:
    if score >= 60:
        return "Higher Risk"
    if score >= 30:
        return "Moderate Risk"
    return "Low Risk"


def train_and_save_all():
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Artifacts will be stored in: {ARTIFACTS_DIR}")

    artifacts = {
        "knn_models": {},
        "linear_models": {},
        "logistic_models": {},
    }
    metrics_summary = {
        "linear": {},
        "logistic": {},
        "knn_evaluations": {},
    }

    # 1. Linear Regression
    print("\n--- Training Linear Regression Models ---")
    for cat in CATEGORIES:
        norm_cat = normalize_category(cat)
        try:
            d = prepare_training_data(cat, "Risk_Score")
            lin_model = LinearRegression()
            lin_model.fit(d["X_train"], d["y_train"])

            train_pred = np.clip(lin_model.predict(d["X_train"]), 0, 100)
            test_pred = np.clip(lin_model.predict(d["X_test"]), 0, 100)

            influence = sorted(
                (
                    {
                        "feature": name,
                        "weight": round(float(w), 4),
                        "effect": "increases risk" if w > 0 else "decreases risk",
                    }
                    for name, w in zip(d["feature_keys"], lin_model.coef_)
                ),
                key=lambda item: abs(item["weight"]),
                reverse=True,
            )

            first_actual = float(d["y_test"][0]) if len(d["y_test"]) > 0 else 0.0
            first_pred = float(test_pred[0]) if len(test_pred) > 0 else 0.0

            linear_result = {
                "model": "Linear Regression",
                "category": d["category"],
                "features": d["feature_keys"],
                "n_total": d["n_total"],
                "n_train": int(len(d["y_train"])),
                "n_test": int(len(d["y_test"])),
                "metrics": {
                    "train_rmse": round(float(np.sqrt(mean_squared_error(d["y_train"], train_pred))), 3),
                    "test_rmse": round(float(np.sqrt(mean_squared_error(d["y_test"], test_pred))), 3),
                    "test_mae": round(float(mean_absolute_error(d["y_test"], test_pred)), 3),
                    "test_r2": round(float(r2_score(d["y_test"], test_pred)), 4),
                },
                "feature_influence": influence,
                "sample_prediction": {
                    "note": "First TEST sample (model ne ise training mein nahi dekha)",
                    "actual_risk": round(first_actual, 1),
                    "predicted_risk": round(first_pred, 1),
                    "level": _risk_level(first_pred),
                },
            }

            metrics_summary["linear"][norm_cat] = linear_result
            artifacts["linear_models"][norm_cat] = {
                "scaler": d["scaler"],
                "model": lin_model,
                "feature_keys": d["feature_keys"],
                "result": linear_result,
            }
            print(f"  [Linear] {norm_cat:15s} Test R2: {linear_result['metrics']['test_r2']}")
        except Exception as e:
            print(f"  [Linear] Error for {cat}: {e}")

    # 2. Logistic / Ridge / Lasso
    print("\n--- Training Logistic / Ridge / Lasso Models ---")
    for cat in CATEGORIES:
        norm_cat = normalize_category(cat)
        for kind, variant in LOGISTIC_VARIANTS.items():
            key = f"{norm_cat}:{kind}"
            try:
                d = prepare_training_data(cat, "Safety_Label")
                y_train = d["y_train"].astype(int)
                y_test = d["y_test"].astype(int)

                clf = LogisticRegression(max_iter=5000, **variant["params"])
                clf.fit(d["X_train"], y_train)

                train_pred = clf.predict(d["X_train"])
                test_pred = clf.predict(d["X_test"])
                test_proba = clf.predict_proba(d["X_test"])[:, 1]

                tn, fp, fn, tp = confusion_matrix(y_test, test_pred, labels=[0, 1]).ravel()
                weights = clf.coef_[0]
                influence = sorted(
                    (
                        {
                            "feature": name,
                            "weight": round(float(w), 4),
                            "effect": (
                                "no effect (weight 0)" if w == 0
                                else "higher value -> Unsafe signal" if w > 0
                                else "higher value -> Safe signal"
                            ),
                        }
                        for name, w in zip(d["feature_keys"], weights)
                    ),
                    key=lambda item: abs(item["weight"]),
                    reverse=True,
                )

                first_p = float(test_proba[0]) if len(test_proba) > 0 else 0.0
                first_pred_label = int(test_pred[0]) if len(test_pred) > 0 else 0
                first_actual_label = int(y_test[0]) if len(y_test) > 0 else 0

                zero_weight_features = (
                    [col for col, w in zip(d["feature_keys"], weights) if w == 0]
                    if kind == "lasso"
                    else []
                )

                logistic_result = {
                    "model": variant["title"],
                    "category": d["category"],
                    "features": d["feature_keys"],
                    "n_total": d["n_total"],
                    "n_safe": d["n_safe"],
                    "n_unsafe": d["n_unsafe"],
                    "n_train": int(len(y_train)),
                    "n_test": int(len(y_test)),
                    "metrics": {
                        "train_accuracy": round(float(accuracy_score(y_train, train_pred)), 4),
                        "test_accuracy": round(float(accuracy_score(y_test, test_pred)), 4),
                        "precision": round(float(precision_score(y_test, test_pred, zero_division=0)), 4),
                        "recall": round(float(recall_score(y_test, test_pred, zero_division=0)), 4),
                        "f1": round(float(f1_score(y_test, test_pred, zero_division=0)), 4),
                    },
                    "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
                    "feature_influence": influence,
                    "zero_weight_features": zero_weight_features,
                    "sample_prediction": {
                        "note": "First TEST sample (model ne ise training mein nahi dekha)",
                        "actual": "Safe" if first_actual_label == 0 else "Unsafe",
                        "predicted": "Safe" if first_pred_label == 0 else "Unsafe",
                        "unsafe_probability": round(first_p, 4),
                    },
                }

                metrics_summary["logistic"][key] = logistic_result
                artifacts["logistic_models"][key] = {
                    "scaler": d["scaler"],
                    "model": clf,
                    "feature_keys": d["feature_keys"],
                    "result": logistic_result,
                }
                print(f"  [Logistic] {key:22s} Test Acc: {logistic_result['metrics']['test_accuracy']}")
            except Exception as e:
                print(f"  [Logistic] Error for {cat} ({kind}): {e}")

    # 3. k-NN Models
    print("\n--- Training & Serializing k-NN Models ---")
    knn_cats = [c for c in CATEGORIES if c != "All"] + ["All"]
    for cat in knn_cats:
        norm_cat = normalize_category(cat)
        try:
            df = load_category_dataset(norm_cat)
            if len(df) < MIN_ROWS:
                continue

            feature_keys = get_feature_keys(norm_cat)

            d = prepare_training_data(norm_cat, "Safety_Label")
            y_train = d["y_train"].astype(int)
            y_test = d["y_test"].astype(int)
            k_used = max(1, min(DEFAULT_K, len(y_train)))

            eval_model = KNeighborsClassifier(n_neighbors=k_used)
            eval_model.fit(d["X_train"], y_train)

            evaluation = {
                "k": k_used,
                "n_train": int(len(y_train)),
                "n_test": int(len(y_test)),
                "train_accuracy": round(float(accuracy_score(y_train, eval_model.predict(d["X_train"]))), 4),
                "test_accuracy": round(float(accuracy_score(y_test, eval_model.predict(d["X_test"]))), 4),
            }
            metrics_summary["knn_evaluations"][norm_cat] = evaluation

            X = df[feature_keys].to_numpy(dtype=float)
            y = df["Safety_Label"].to_numpy(dtype=int)
            k_final = min(k_used, len(y))

            pipe = Pipeline([
                ("scale", StandardScaler()),
                ("knn", KNeighborsClassifier(n_neighbors=k_final)),
            ])
            pipe.fit(X, y)

            artifacts["knn_models"][norm_cat] = {
                "pipeline": pipe,
                "feature_keys": feature_keys,
                "trained_on": int(len(df)),
                "k": int(k_final),
                "evaluation": evaluation,
                "y_train": y,
            }
            print(f"  [k-NN] {norm_cat:16s} k={k_final} Trained on {len(df)} samples | Test Acc: {evaluation['test_accuracy']}")
        except Exception as e:
            print(f"  [k-NN] Error for {cat}: {e}")

    joblib.dump(artifacts, MODELS_PKL_PATH)
    print(f"\nSaved models binary artifact to: {MODELS_PKL_PATH}")

    with open(METRICS_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(metrics_summary, f, indent=2)
    print(f"Saved evaluation metrics JSON to: {METRICS_JSON_PATH}")


if __name__ == "__main__":
    train_and_save_all()
