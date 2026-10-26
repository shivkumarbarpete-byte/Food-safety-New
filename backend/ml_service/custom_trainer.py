"""
custom_trainer.py
-----------------
Standalone local training script & inference loader for custom models.

CLI Usage:
    python custom_trainer.py --data path/to/dataset.csv --target Safety_Label --category Dairy --model logistic --out model_artifact.json

Features:
    1. Standalone CLI execution for training models locally and saving weights/artifacts to JSON or PKL.
    2. Loads pre-trained model files for ultra-fast, zero-training inference in serverless environments.
    3. Functions to load and predict without triggering any runtime training on request paths.
"""

import argparse
from collections import OrderedDict
import json
from pathlib import Path
import re
import sys
import time
from typing import Any
import uuid

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

# In-memory models cache for loaded models (LRU / oldest evicted)
MODELS_CACHE: OrderedDict[str, dict[str, Any]] = OrderedDict()
MAX_MODELS = 50

# Default directory for pre-trained custom models
CUSTOM_MODELS_DIR = Path(__file__).resolve().parent / "artifacts" / "custom_models"

ID_PATTERNS = {"id", "_id", "index", "serial", "row", "sr_no", "srno"}


def _is_id_column(col_name: str) -> bool:
    clean = col_name.strip().lower()
    if clean in ID_PATTERNS:
        return True
    if re.match(r"^(id|_id|index|serial|row|sr_?no)$", clean):
        return True
    return False


def train_custom_model_data(
    rows: list[dict[str, Any]],
    target: str = "Safety_Label",
    category: str | None = None,
    exclude: list[str] | None = None,
    user_id: str | None = None,
    model_type: str = "logistic",
) -> dict[str, Any]:
    """Core offline/local training logic for custom datasets."""
    if not isinstance(rows, list) or len(rows) == 0:
        raise ValueError("Dataset must contain at least one row.")

    if len(rows) > 5000:
        raise ValueError(f"Maximum allowed rows is 5000, received {len(rows)}.")

    df = pd.DataFrame(rows)

    # 1. Category Column Check
    cat_col = None
    for c in df.columns:
        if str(c).strip().lower() == "category":
            cat_col = c
            break

    if cat_col is not None:
        unique_cats = [
            str(x).strip()
            for x in df[cat_col].dropna().unique()
            if str(x).strip() != "" and str(x).strip().lower() != "nan"
        ]
        available_cats_sorted = sorted(list(set(unique_cats)))

        if not category or not str(category).strip():
            raise ValueError(
                f"Category is required. Available categories: {', '.join(available_cats_sorted)}"
            )

        cat_choice = str(category).strip().lower()
        matched_cat_orig = None
        for u in available_cats_sorted:
            if u.lower() == cat_choice:
                matched_cat_orig = u
                break

        if not matched_cat_orig:
            raise ValueError(
                f"Category '{category}' not found in CSV. Available categories: {', '.join(available_cats_sorted)}"
            )

        mask = df[cat_col].astype(str).str.strip().str.lower() == cat_choice
        df = df[mask].copy()
        selected_category = matched_cat_orig
    else:
        selected_category = None

    # 2. Target / Label Column Check
    target_clean = (target or "Safety_Label").strip().lower()
    target_col = None
    for c in df.columns:
        if str(c).strip().lower() == target_clean:
            target_col = c
            break

    if target_col is None:
        raise ValueError(f"Target column '{target}' not found in CSV.")

    def convert_label(val):
        if val is None or pd.isna(val):
            raise ValueError(f"Invalid label value {val!r} in column '{target}'. Allowed values are 0, 1, 'Safe', 'Unsafe'.")
        s = str(val).strip().lower()
        if s in ("0", "safe"):
            return 0
        if s in ("1", "unsafe"):
            return 1
        raise ValueError(f"Invalid label value {val!r} in column '{target}'. Allowed values are 0, 1, 'Safe', 'Unsafe'.")

    labels = [convert_label(val) for val in df[target_col]]
    df[target_col] = labels

    # 3. Feature Columns & Exclusions
    excluded_columns: list[dict[str, str]] = []
    excluded_names: set[str] = set()

    excluded_columns.append({"column": target_col, "reason": "Target / label column"})
    excluded_names.add(target_col)

    if cat_col is not None and cat_col not in excluded_names:
        excluded_columns.append({"column": cat_col, "reason": "Category column"})
        excluded_names.add(cat_col)

    user_exclude_lower = {str(x).strip().lower() for x in (exclude or [])}
    candidate_cols = [c for c in df.columns if c not in excluded_names]

    for c in candidate_cols:
        c_lower = str(c).strip().lower()
        if c_lower in user_exclude_lower:
            excluded_columns.append({"column": c, "reason": "Excluded by user request"})
            excluded_names.add(c)
        elif c_lower == "risk_score":
            excluded_columns.append({"column": c, "reason": "Target-correlated risk metric"})
            excluded_names.add(c)
        elif _is_id_column(c):
            excluded_columns.append({"column": c, "reason": "Identifier column"})
            excluded_names.add(c)

    valid_feature_cols = []
    for c in df.columns:
        if c in excluded_names:
            continue

        series = df[c]
        if series.isna().all() or (series.astype(str).str.strip() == "").all():
            excluded_columns.append({"column": c, "reason": "All values missing for selected category"})
            excluded_names.add(c)
            continue

        numeric_series = pd.to_numeric(series, errors="coerce")
        nan_count = numeric_series.isna().sum()
        total_count = len(series)

        if nan_count == total_count or (nan_count / total_count) > 0.5:
            excluded_columns.append({"column": c, "reason": "Non-numeric data"})
            excluded_names.add(c)
            continue

        df[c] = numeric_series
        valid_feature_cols.append(c)

    n_before_drop = len(df)
    if valid_feature_cols:
        df = df.dropna(subset=valid_feature_cols + [target_col])
    rows_dropped = n_before_drop - len(df)

    if len(valid_feature_cols) > 30:
        raise ValueError(f"Too many feature columns ({len(valid_feature_cols)}). Maximum allowed is 30.")

    if len(valid_feature_cols) < 2:
        raise ValueError(f"At least 2 feature columns required, found {len(valid_feature_cols)}.")

    if len(df) < 30:
        raise ValueError(f"Dataset must contain at least 30 usable rows after filtering, found {len(df)}.")

    y = df[target_col].to_numpy(dtype=int)
    safe_count = int(np.sum(y == 0))
    unsafe_count = int(np.sum(y == 1))

    if safe_count < 5 or unsafe_count < 5:
        raise ValueError(
            f"Dataset must contain at least 5 samples of each class (Safe and Unsafe). Found Safe: {safe_count}, Unsafe: {unsafe_count}."
        )

    model_type_clean = str(model_type or "logistic").strip().lower()
    if model_type_clean not in ("logistic", "ridge", "lasso", "knn"):
        raise ValueError(
            f"Invalid model_type '{model_type}'. Allowed types are 'logistic', 'ridge', 'lasso', 'knn'."
        )

    feature_stats = [
        {
            "feature": col,
            "mean": round(float(df[col].mean()), 3),
            "std": round(float(df[col].std(ddof=1)), 3) if len(df) > 1 else 0.0,
            "min": round(float(df[col].min()), 3),
            "max": round(float(df[col].max()), 3),
        }
        for col in valid_feature_cols
    ]

    X = df[valid_feature_cols].to_numpy(dtype=float)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    k_val = max(1, min(5, len(y_train)))

    MODEL_SPECS = {
        "logistic": {
            "title": "Logistic Regression",
            "instantiate": lambda: LogisticRegression(max_iter=5000, random_state=42, C=1e6),
        },
        "ridge": {
            "title": "Ridge Regression (L2)",
            "instantiate": lambda: LogisticRegression(max_iter=5000, random_state=42, C=1.0, l1_ratio=0.0),
        },
        "lasso": {
            "title": "Lasso Regression (L1)",
            "instantiate": lambda: LogisticRegression(max_iter=5000, random_state=42, C=1.0, l1_ratio=1.0, solver="saga"),
        },
        "knn": {
            "title": f"k-Nearest Neighbors (k={k_val})",
            "instantiate": lambda: KNeighborsClassifier(n_neighbors=k_val),
        },
    }

    comparison = []
    models_fitted = {}

    for m_key, spec in MODEL_SPECS.items():
        m_inst = spec["instantiate"]()
        m_inst.fit(X_train_scaled, y_train)
        models_fitted[m_key] = m_inst
        m_test_preds = m_inst.predict(X_test_scaled)
        comparison.append({
            "model_type": m_key,
            "model_name": spec["title"],
            "test_accuracy": round(float(accuracy_score(y_test, m_test_preds)), 4),
            "precision": round(float(precision_score(y_test, m_test_preds, pos_label=1, zero_division=0)), 4),
            "recall": round(float(recall_score(y_test, m_test_preds, pos_label=1, zero_division=0)), 4),
            "f1": round(float(f1_score(y_test, m_test_preds, pos_label=1, zero_division=0)), 4),
        })

    chosen_model = models_fitted[model_type_clean]
    train_preds = chosen_model.predict(X_train_scaled)
    test_preds = chosen_model.predict(X_test_scaled)

    train_acc = round(float(accuracy_score(y_train, train_preds)), 4)
    test_acc = round(float(accuracy_score(y_test, test_preds)), 4)
    prec = round(float(precision_score(y_test, test_preds, pos_label=1, zero_division=0)), 4)
    rec = round(float(recall_score(y_test, test_preds, pos_label=1, zero_division=0)), 4)
    f1 = round(float(f1_score(y_test, test_preds, pos_label=1, zero_division=0)), 4)
    cm = confusion_matrix(y_test, test_preds, labels=[0, 1]).tolist()

    if model_type_clean in ("logistic", "ridge", "lasso"):
        coefs = chosen_model.coef_[0]
        feature_influence = [
            {
                "feature": col,
                "weight": round(float(c), 4),
                "importance": round(abs(float(c)), 4),
                "effect": (
                    "no effect (weight 0)" if round(float(c), 6) == 0.0
                    else "higher value -> Unsafe signal" if float(c) > 0
                    else "higher value -> Safe signal"
                ),
                "direction": "Unsafe" if float(c) > 0 else ("Safe" if float(c) < 0 else "Neutral"),
            }
            for col, c in zip(valid_feature_cols, coefs)
        ]
        feature_influence.sort(key=lambda x: x["importance"], reverse=True)
        zero_weight_features = (
            [col for col, c in zip(valid_feature_cols, coefs) if round(float(c), 6) == 0.0]
            if model_type_clean == "lasso" else []
        )
    else:
        feature_influence = None
        zero_weight_features = []

    model_id = str(uuid.uuid4())
    pipeline = Pipeline([("scaler", scaler), ("model", chosen_model)])

    # Serializable model parameters (for lightweight JSON persistence)
    model_weights = {
        "model_id": model_id,
        "model_type": model_type_clean,
        "model_title": MODEL_SPECS[model_type_clean]["title"],
        "category": selected_category,
        "features": valid_feature_cols,
        "scaler_mean": scaler.mean_.tolist(),
        "scaler_scale": scaler.scale_.tolist(),
        "classes": [int(cl) for cl in chosen_model.classes_],
    }

    if model_type_clean in ("logistic", "ridge", "lasso"):
        model_weights["intercept"] = float(chosen_model.intercept_[0])
        model_weights["coefficients"] = [float(cf) for cf in chosen_model.coef_[0]]
    else:
        model_weights["k_neighbors"] = k_val
        model_weights["X_train_scaled"] = X_train_scaled.tolist()
        model_weights["y_train"] = [int(v) for v in y_train]

    metadata = {
        "model_id": model_id,
        "model_type": model_type_clean,
        "model_title": MODEL_SPECS[model_type_clean]["title"],
        "category": selected_category,
        "features": valid_feature_cols,
        "excluded_columns": excluded_columns,
        "n_total": int(len(df)),
        "n_train": int(len(y_train)),
        "n_test": int(len(y_test)),
        "rows_dropped": int(rows_dropped),
        "class_counts": {"Safe": safe_count, "Unsafe": unsafe_count},
        "feature_stats": feature_stats,
        "train_accuracy": train_acc,
        "test_accuracy": test_acc,
        "precision": prec,
        "recall": rec,
        "f1": f1,
        "confusion_matrix": cm,
        "feature_influence": feature_influence,
        "zero_weight_features": zero_weight_features,
        "comparison": comparison,
        "weights": model_weights,
    }

    # Cache locally in memory for current process
    register_model_in_cache(
        model_id=model_id,
        pipeline=pipeline,
        model_type=model_type_clean,
        user_id=user_id,
        features=valid_feature_cols,
        X_train_scaled=X_train_scaled,
        y_train=y_train,
    )

    return metadata


train_custom_model = train_custom_model_data


def register_model_in_cache(
    model_id: str,
    pipeline: Pipeline,
    model_type: str,
    user_id: str | None,
    features: list[str],
    X_train_scaled: np.ndarray,
    y_train: np.ndarray,
):
    """Stores pipeline in LRU cache."""
    while len(MODELS_CACHE) >= MAX_MODELS:
        MODELS_CACHE.popitem(last=False)

    MODELS_CACHE[model_id] = {
        "pipeline": pipeline,
        "model_type": model_type,
        "user_id": str(user_id) if user_id else None,
        "features": features,
        "created_at": time.time(),
        "X_train_scaled": X_train_scaled,
        "y_train": y_train,
    }


def save_model_artifact(metadata: dict[str, Any], filepath: Path | str) -> str:
    """Saves trained model artifact (JSON) to disk."""
    path = Path(filepath)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    return str(path)


def load_model_from_file(filepath: Path | str) -> str:
    """
    Loads a pre-trained model artifact from a JSON file into memory for zero-training inference.
    Returns model_id.
    """
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"Model file not found: {path}")

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    weights = data.get("weights", data)
    model_id = weights["model_id"]
    model_type = weights["model_type"]
    features = weights["features"]

    scaler = StandardScaler()
    scaler.mean_ = np.array(weights["scaler_mean"], dtype=float)
    scaler.scale_ = np.array(weights["scaler_scale"], dtype=float)
    scaler.var_ = scaler.scale_ ** 2
    scaler.n_features_in_ = len(features)

    if model_type in ("logistic", "ridge", "lasso"):
        model = LogisticRegression()
        model.classes_ = np.array(weights["classes"], dtype=int)
        model.intercept_ = np.array([weights["intercept"]], dtype=float)
        model.coef_ = np.array([weights["coefficients"]], dtype=float)
        X_train_scaled = np.empty((0, len(features)))
        y_train = np.empty((0,), dtype=int)
    else:
        k_val = weights.get("k_neighbors", 5)
        X_train_scaled = np.array(weights["X_train_scaled"], dtype=float)
        y_train = np.array(weights["y_train"], dtype=int)
        model = KNeighborsClassifier(n_neighbors=k_val)
        model.fit(X_train_scaled, y_train)

    pipeline = Pipeline([("scaler", scaler), ("model", model)])

    register_model_in_cache(
        model_id=model_id,
        pipeline=pipeline,
        model_type=model_type,
        user_id=None,
        features=features,
        X_train_scaled=X_train_scaled,
        y_train=y_train,
    )
    return model_id


def load_all_pretrained_custom_models():
    """Scans CUSTOM_MODELS_DIR and loads any pre-trained custom models on server boot."""
    if not CUSTOM_MODELS_DIR.exists():
        return
    for file in CUSTOM_MODELS_DIR.glob("*.json"):
        try:
            load_model_from_file(file)
        except Exception as e:
            print(f"Warning: could not load custom model {file}: {e}")


def predict_custom_model(
    model_id: str,
    user_id: str | None,
    features: dict[str, Any],
) -> dict[str, Any]:
    """Inference-only function. Does zero runtime training."""
    if not model_id or model_id not in MODELS_CACHE:
        # Check if saved on disk as pre-trained file
        custom_file = CUSTOM_MODELS_DIR / f"{model_id}.json"
        if custom_file.exists():
            load_model_from_file(custom_file)
        else:
            raise KeyError("Model expired or not found, please train again or load pre-trained artifact")

    entry = MODELS_CACHE[model_id]

    stored_owner = entry.get("user_id")
    if stored_owner and user_id and str(stored_owner) != str(user_id):
        raise KeyError("Model expired or not found, please train again")

    required_features = entry["features"]
    if not isinstance(features, dict):
        raise ValueError("'features' must be an object with feature values.")

    vector = []
    for f in required_features:
        if f not in features or features[f] is None or features[f] == "":
            raise ValueError(f"Missing required feature '{f}'")
        try:
            val = float(features[f])
        except (ValueError, TypeError):
            raise ValueError(f"Feature '{f}' must be a number, got {features[f]!r}")
        if not np.isfinite(val):
            raise ValueError(f"Feature '{f}' must be a finite number")
        vector.append(val)

    pipeline = entry["pipeline"]
    model_type = entry.get("model_type", "logistic")
    x_new = np.array([vector], dtype=float)

    pred_label = int(pipeline.predict(x_new)[0])
    classes = list(pipeline.classes_)
    if 1 in classes:
        prob_idx = classes.index(1)
        unsafe_prob = round(float(pipeline.predict_proba(x_new)[0][prob_idx]), 4)
    else:
        unsafe_prob = 0.0

    verdict = "Unsafe" if pred_label == 1 else "Safe"

    neighbors = None
    if model_type == "knn":
        scaler = pipeline.named_steps["scaler"]
        knn_clf = pipeline.named_steps["model"]
        x_scaled = scaler.transform(x_new)
        distances, indices = knn_clf.kneighbors(x_scaled)
        y_train = entry["y_train"]
        neighbors = [
            {
                "label": "UNSAFE" if int(y_train[i]) == 1 else "SAFE",
                "distance": round(float(dist), 3),
            }
            for dist, i in zip(distances[0], indices[0])
        ]

    return {
        "verdict": verdict,
        "unsafe_probability": unsafe_prob,
        "features_used": required_features,
        "model_type": model_type,
        "neighbors": neighbors,
    }


def main_cli():
    parser = argparse.ArgumentParser(description="Standalone Local ML Model Trainer for Food Safety Hub")
    parser.add_argument("--data", required=True, help="Path to input CSV file")
    parser.add_argument("--target", default="Safety_Label", help="Target column name (default: Safety_Label)")
    parser.add_argument("--category", default=None, help="Category name (e.g. Dairy)")
    parser.add_argument("--model", default="logistic", choices=["logistic", "ridge", "lasso", "knn"], help="Model type")
    parser.add_argument("--out", default=None, help="Output path for model JSON artifact")

    args = parser.parse_args()

    data_path = Path(args.data)
    if not data_path.exists():
        print(f"Error: file not found: {data_path}", file=sys.stderr)
        sys.exit(1)

    df = pd.read_csv(data_path)
    rows = df.to_dict(orient="records")

    print(f"Training {args.model} model on {len(rows)} rows from {data_path}...")
    result = train_custom_model_data(
        rows=rows,
        target=args.target,
        category=args.category,
        model_type=args.model,
    )

    out_file = args.out or (CUSTOM_MODELS_DIR / f"{result['model_id']}.json")
    saved_path = save_model_artifact(result, out_file)
    print("\n[OK] Training Complete!")
    print(f"Model ID: {result['model_id']}")
    print(f"Test Accuracy: {result['test_accuracy'] * 100:.2f}%")
    print(f"Artifact saved to: {saved_path}")


if __name__ == "__main__":
    main_cli()
