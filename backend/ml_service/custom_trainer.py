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

    # 5. Train / Test Split & Logistic Regression
    X = df[valid_feature_cols].to_numpy(dtype=float)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    clf = LogisticRegression(max_iter=5000, random_state=42)
    clf.fit(X_train_scaled, y_train)

    train_preds = clf.predict(X_train_scaled)
    test_preds = clf.predict(X_test_scaled)

    train_acc = round(float(accuracy_score(y_train, train_preds)), 4)
    test_acc = round(float(accuracy_score(y_test, test_preds)), 4)
    prec = round(float(precision_score(y_test, test_preds, pos_label=1, zero_division=0)), 4)
    rec = round(float(recall_score(y_test, test_preds, pos_label=1, zero_division=0)), 4)
    f1 = round(float(f1_score(y_test, test_preds, pos_label=1, zero_division=0)), 4)
    cm = confusion_matrix(y_test, test_preds).tolist()

    # Feature influence
    coefs = clf.coef_[0]
    feature_influence = [
        {
            "feature": col,
            "coefficient": round(float(c), 4),
            "importance": round(abs(float(c)), 4),
        }
        for col, c in zip(valid_feature_cols, coefs)
    ]
    feature_influence.sort(key=lambda x: x["importance"], reverse=True)

    # Pipeline for inference
    pipeline = Pipeline([("scaler", scaler), ("model", clf)])

    # Store in cache
    model_id = str(uuid.uuid4())
    while len(MODELS_CACHE) >= MAX_MODELS:
        MODELS_CACHE.popitem(last=False)

    MODELS_CACHE[model_id] = {
        "pipeline": pipeline,
        "user_id": str(user_id) if user_id else None,
        "features": valid_feature_cols,
        "created_at": time.time(),
    }

    return {
        "model_id": model_id,
        "category": selected_category,
        "features": valid_feature_cols,
        "excluded_columns": excluded_columns,
        "n_total": int(len(df)),
        "n_train": int(len(y_train)),
        "n_test": int(len(y_test)),
        "rows_dropped": int(rows_dropped),
        "class_counts": {"Safe": safe_count, "Unsafe": unsafe_count},
        "train_accuracy": train_acc,
        "test_accuracy": test_acc,
        "precision": prec,
        "recall": rec,
        "f1": f1,
        "confusion_matrix": cm,
        "feature_influence": feature_influence,
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
    x_new = np.array([vector], dtype=float)

    pred_label = int(pipeline.predict(x_new)[0])
    classes = list(pipeline.classes_)
    if 1 in classes:
        prob_idx = classes.index(1)
        unsafe_prob = round(float(pipeline.predict_proba(x_new)[0][prob_idx]), 4)
    else:
        unsafe_prob = 0.0

    verdict = "Unsafe" if pred_label == 1 else "Safe"

    return {
        "verdict": verdict,
        "unsafe_probability": unsafe_prob,
        "features_used": required_features,
    }
