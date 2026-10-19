"""
custom_trainer.py
-----------------
Train and predict custom Logistic Regression models on user-uploaded CSV rows.
"""

from collections import OrderedDict
import re
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

# In-memory models cache (max 20 models, LRU / oldest evicted)
MODELS_CACHE: OrderedDict[str, dict[str, Any]] = OrderedDict()
MAX_MODELS = 20

ID_PATTERNS = {"id", "_id", "index", "serial", "row", "sr_no", "srno"}


def _is_id_column(col_name: str) -> bool:
    clean = col_name.strip().lower()
    if clean in ID_PATTERNS:
        return True
    if re.match(r"^(id|_id|index|serial|row|sr_?no)$", clean):
        return True
    return False


def train_custom_model(
    rows: list[dict[str, Any]],
    target: str = "Safety_Label",
    category: str | None = None,
    exclude: list[str] | None = None,
    user_id: str | None = None,
    model_type: str = "logistic",
) -> dict[str, Any]:
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
        # Category column exists
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

        # Filter rows for this category
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

    # Convert Label to 0/1
    def convert_label(val):
        if val is None or pd.isna(val):
            raise ValueError(f"Invalid label value {val!r} in column '{target}'. Allowed values are 0, 1, 'Safe', 'Unsafe'.")
        s = str(val).strip().lower()
        if s in ("0", "safe"):
            return 0
        if s in ("1", "unsafe"):
            return 1
        raise ValueError(f"Invalid label value {val!r} in column '{target}'. Allowed values are 0, 1, 'Safe', 'Unsafe'.")

    labels = []
    for val in df[target_col]:
        labels.append(convert_label(val))
    df[target_col] = labels

    # 3. Feature Columns & Exclusions
    excluded_columns: list[dict[str, str]] = []
    excluded_names: set[str] = set()

    # Exclude target
    excluded_columns.append({"column": target_col, "reason": "Target / label column"})
    excluded_names.add(target_col)

    # Exclude Category
    if cat_col is not None and cat_col not in excluded_names:
        excluded_columns.append({"column": cat_col, "reason": "Category column"})
        excluded_names.add(cat_col)

    # User excluded columns
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

    # Check remaining candidates for numeric data & emptiness
    valid_feature_cols = []
    for c in df.columns:
        if c in excluded_names:
            continue

        series = df[c]
        # Check if entirely empty
        if series.isna().all() or (series.astype(str).str.strip() == "").all():
            excluded_columns.append({"column": c, "reason": "All values missing for selected category"})
            excluded_names.add(c)
            continue

        # Coerce to numeric
        numeric_series = pd.to_numeric(series, errors="coerce")
        nan_count = numeric_series.isna().sum()
        total_count = len(series)

        # If all became NaN or majority (> 50%) non-numeric
        if nan_count == total_count or (nan_count / total_count) > 0.5:
            excluded_columns.append({"column": c, "reason": "Non-numeric data"})
            excluded_names.add(c)
            continue

        df[c] = numeric_series
        valid_feature_cols.append(c)

    # Drop rows that still have missing values in valid feature columns
    n_before_drop = len(df)
    if valid_feature_cols:
        df = df.dropna(subset=valid_feature_cols + [target_col])
    rows_dropped = n_before_drop - len(df)

    # 4. Validations
    if len(valid_feature_cols) > 30:
        raise ValueError(f"Too many feature columns ({len(valid_feature_cols)}). Maximum allowed is 30.")

    if len(valid_feature_cols) < 2:
        raise ValueError(f"At least 2 feature columns required, found {len(valid_feature_cols)}.")

    if len(df) < 30:
        raise ValueError(f"Dataset must contain at least 30 usable rows after filtering, found {len(df)}.")

    # Class counts
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

    # Feature statistics across usable dataset
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

    # 5. Train / Test Split & Scaler (fitted on train only)
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

    # Evaluate ALL 4 models on the same train/test split for the comparison table
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

    # Chosen model evaluation & metrics
    chosen_model = models_fitted[model_type_clean]
    train_preds = chosen_model.predict(X_train_scaled)
    test_preds = chosen_model.predict(X_test_scaled)

    train_acc = round(float(accuracy_score(y_train, train_preds)), 4)
    test_acc = round(float(accuracy_score(y_test, test_preds)), 4)
    prec = round(float(precision_score(y_test, test_preds, pos_label=1, zero_division=0)), 4)
    rec = round(float(recall_score(y_test, test_preds, pos_label=1, zero_division=0)), 4)
    f1 = round(float(f1_score(y_test, test_preds, pos_label=1, zero_division=0)), 4)
    cm = confusion_matrix(y_test, test_preds, labels=[0, 1]).tolist()

    # Feature influence and zero-weight features
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
        if model_type_clean == "lasso":
            zero_weight_features = [
                col for col, c in zip(valid_feature_cols, coefs) if round(float(c), 6) == 0.0
            ]
        else:
            zero_weight_features = []
    else:
        # For k-NN, feature influence is not available
        feature_influence = None
        zero_weight_features = []

    # Pipeline for inference
    pipeline = Pipeline([("scaler", scaler), ("model", chosen_model)])

    # Store in cache
    model_id = str(uuid.uuid4())
    while len(MODELS_CACHE) >= MAX_MODELS:
        MODELS_CACHE.popitem(last=False)

    MODELS_CACHE[model_id] = {
        "pipeline": pipeline,
        "model_type": model_type_clean,
        "user_id": str(user_id) if user_id else None,
        "features": valid_feature_cols,
        "created_at": time.time(),
        "X_train_scaled": X_train_scaled,
        "y_train": y_train,
    }

    return {
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
    }


def predict_custom_model(
    model_id: str,
    user_id: str | None,
    features: dict[str, Any],
) -> dict[str, Any]:
    if not model_id or model_id not in MODELS_CACHE:
        raise KeyError("Model expired or not found, please train again")

    entry = MODELS_CACHE[model_id]

    # Owner verification if user_id was stored and provided
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
