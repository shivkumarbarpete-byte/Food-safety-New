"""
knn.py
------
backend/ml/knnModel.js ka Python version (k-Nearest Neighbors).

JS version se farak:
  1. Features SCALE hote hain (k-NN distance par chalta hai, isliye zaroori).
  2. Pehle train/test split par accuracy naapi jati hai.
  3. Naye sample ki prediction ke liye final model poore category data par banta hai.
  4. Result mein nearest neighbors bhi hote hain (prediction ka "kyun" dikhane ke liye).
"""

import numpy as np
from sklearn.metrics import accuracy_score
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from data_loader import get_feature_keys, load_category_dataset, normalize_category
from models import MIN_ROWS, prepare_data

DEFAULT_K = 5


def _build_input_vector(category, feature_map, feature_keys):
    """Frontend se aaye feature dict ko ordered list mein badalta hai."""
    if not isinstance(feature_map, dict):
        raise ValueError("'features' must be an object like {\"Temperature_C\": 4.0, ...}")

    vector = []
    for key in feature_keys:
        value = feature_map.get(key)
        if value is None or value == "":
            raise ValueError(f"Missing parameter '{key}' for category '{category}'")
        try:
            number = float(value)
        except (TypeError, ValueError):
            raise ValueError(f"Parameter '{key}' must be a number, got {value!r}")
        if not np.isfinite(number):
            raise ValueError(f"Parameter '{key}' must be a finite number")
        vector.append(number)
    return vector


def evaluate_knn(category="Dairy", k=DEFAULT_K):
    """Train/test split par k-NN ki asli (test) accuracy."""
    d = prepare_data(category, "Safety_Label")
    y_train = d["y_train"].astype(int)
    y_test = d["y_test"].astype(int)

    k_used = max(1, min(k, len(y_train)))
    model = KNeighborsClassifier(n_neighbors=k_used)
    model.fit(d["X_train"], y_train)

    return {
        "k": k_used,
        "n_train": int(len(y_train)),
        "n_test": int(len(y_test)),
        "train_accuracy": round(float(accuracy_score(y_train, model.predict(d["X_train"]))), 4),
        "test_accuracy": round(float(accuracy_score(y_test, model.predict(d["X_test"]))), 4),
    }


def predict_knn(category, feature_map, k=DEFAULT_K):
    """
    Ek naye food sample ko Safe / Unsafe batata hai.
    feature_map: {"Temperature_C": 4.0, "Moisture_percent": 85.0, ...}
    """
    cat = normalize_category(category or "Dairy")
    df = load_category_dataset(cat)
    if len(df) < MIN_ROWS:
        raise ValueError(f"Not enough training data for category {category}. Found {len(df)} samples.")

    feature_keys = get_feature_keys(cat)
    input_vector = _build_input_vector(category, feature_map, feature_keys)

    # 1) Honest accuracy: train/test split par
    evaluation = evaluate_knn(cat, k)
    k_used = evaluation["k"]

    # 2) Final model: poore category data par (scaler + k-NN ek saath)
    X = df[feature_keys].to_numpy(dtype=float)
    y = df["Safety_Label"].to_numpy(dtype=int)
    k_final = min(k_used, len(y))

    pipe = Pipeline(
        [("scale", StandardScaler()), ("knn", KNeighborsClassifier(n_neighbors=k_final))]
    )
    pipe.fit(X, y)

    x_new = np.array([input_vector], dtype=float)
    label = int(pipe.predict(x_new)[0])
    unsafe_prob = float(pipe.predict_proba(x_new)[0][list(pipe.classes_).index(1)]) \
        if 1 in pipe.classes_ else 0.0

    # Nearest neighbors (scaled space mein distance)
    x_scaled = pipe.named_steps["scale"].transform(x_new)
    distances, indices = pipe.named_steps["knn"].kneighbors(x_scaled)
    neighbors = [
        {
            "label": "UNSAFE" if int(y[i]) == 1 else "SAFE",
            "distance": round(float(dist), 3),
        }
        for dist, i in zip(distances[0], indices[0])
    ]

    return {
        "prediction": label,                                    # 0 = Safe, 1 = Unsafe
        "verdict": "Low Risk Screening Estimate" if label == 0 else "Higher Risk Screening Estimate",
        "unsafe_probability": round(unsafe_prob, 4),            # k neighbors mein se kitne Unsafe
        "trained_on": int(len(df)),
        "k": int(k_final),
        "category": cat,
        "features_used": feature_keys,
        "neighbors": neighbors,
        "evaluation": evaluation,
    }


def _extract_feature_val(f_map, key):
    """Case-insensitive and synonym lookup for CSV column names."""
    if key in f_map:
        return f_map[key]
    k_lower = key.lower()
    for k, v in f_map.items():
        if str(k).lower() == k_lower:
            return v
    synonyms = {
        "temperature_c": ["temp", "temperature", "temp_c", "measured_temp", "p_temp"],
        "moisture_percent": ["moisture", "moisture_%", "moisture_pct", "humidity", "p_moisture"],
        "storage_days": ["storage", "days", "storagedays", "shelf_days", "p_storage_days"],
        "ph": ["measured_ph", "p_ph"],
        "fat_percent": ["fat", "fat_%", "fatpercent", "p_fat_percent"],
        "titratable_acidity": ["acidity", "titratableacidity", "p_titratable_acidity"],
        "color_score": ["color", "colorscore", "p_color_score"],
        "tvbn_level": ["tvbn", "tvbnlevel", "p_tvbn_level"],
        "ripeness_index": ["ripeness", "ripenessindex", "p_ripeness_index"],
        "sugar_content_percent": ["sugar", "sugar_%", "sugarpercent", "p_sugar_content_percent"],
        "mold_risk_index": ["mold", "mold_risk", "moldrisk", "p_mold_risk_index"],
        "temp_deviation_neg18": ["temp_dev", "temp_deviation", "p_temp_deviation_neg18"],
        "oil_rancidity_index": ["rancidity", "oil_rancidity", "p_oil_rancidity_index"],
        "hygiene_score": ["hygiene", "hygienescore", "p_hygiene_score"]
    }
    for syn in synonyms.get(k_lower, []):
        for k, v in f_map.items():
            if str(k).lower().strip() == syn:
                return v
    return None


def predict_knn_batch(category, rows, k=DEFAULT_K):
    """
    Ek saath poori CSV ya batch of rows ko classify karta hai.
    Scaler aur k-NN model category dataset par sirf EK baar fit hota hai.
    """
    cat = normalize_category(category or "Dairy")
    df = load_category_dataset(cat)
    if len(df) < MIN_ROWS:
        raise ValueError(f"Not enough training data for category '{category}'. Found {len(df)} samples.")

    feature_keys = get_feature_keys(cat)

    # 1. Fit scaler and k-NN once
    X_train = df[feature_keys].to_numpy(dtype=float)
    y_train = df["Safety_Label"].to_numpy(dtype=int)
    k_final = max(1, min(k, len(y_train)))

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    knn = KNeighborsClassifier(n_neighbors=k_final)
    knn.fit(X_train_scaled, y_train)

    parsed_rows = []
    valid_vectors = []
    valid_indices = []

    for idx, row in enumerate(rows):
        if not isinstance(row, dict):
            parsed_rows.append({
                "row_index": idx + 1,
                "name": f"Row #{idx + 1}",
                "status": "error",
                "verdict": "ERROR",
                "confidence": None,
                "unsafe_probability": None,
                "nearest_distance": None,
                "error": "Row data is not an object"
            })
            continue

        f_map = row.get("features", row) if isinstance(row.get("features"), dict) else row
        row_name = (
            row.get("name")
            or row.get("product_name")
            or row.get("Product Name")
            or row.get("Product")
            or row.get("Name")
            or f"Row #{idx + 1}"
        )

        vector = []
        missing_errors = []
        for key in feature_keys:
            val = _extract_feature_val(f_map, key)
            if val is None or str(val).strip() == "":
                missing_errors.append(f"Missing '{key}'")
                continue
            try:
                num = float(val)
                if not np.isfinite(num):
                    missing_errors.append(f"'{key}' must be finite")
                    continue
                vector.append(num)
            except (TypeError, ValueError):
                missing_errors.append(f"Invalid '{key}' ({val!r})")

        if missing_errors:
            parsed_rows.append({
                "row_index": idx + 1,
                "name": str(row_name),
                "status": "error",
                "verdict": "ERROR",
                "confidence": None,
                "unsafe_probability": None,
                "nearest_distance": None,
                "error": "; ".join(missing_errors)
            })
            continue

        valid_indices.append(len(parsed_rows))
        valid_vectors.append(vector)
        parsed_rows.append({
            "row_index": idx + 1,
            "name": str(row_name),
            "status": "ok",
            "prediction": None,
            "verdict": None,
            "confidence": None,
            "unsafe_probability": None,
            "nearest_distance": None,
            "error": None
        })

    # Predict all valid rows together
    safe_count = 0
    unsafe_count = 0
    error_count = len(parsed_rows) - len(valid_vectors)
    confidences = []

    if valid_vectors:
        X_batch = np.array(valid_vectors, dtype=float)
        X_batch_scaled = scaler.transform(X_batch)
        preds = knn.predict(X_batch_scaled)
        probs = knn.predict_proba(X_batch_scaled)
        distances, _ = knn.kneighbors(X_batch_scaled)

        unsafe_idx = list(knn.classes_).index(1) if 1 in knn.classes_ else -1

        for i, target_idx in enumerate(valid_indices):
            pred = int(preds[i])
            unsafe_prob = float(probs[i][unsafe_idx]) if unsafe_idx >= 0 else 0.0
            conf = (1.0 - unsafe_prob) if pred == 0 else unsafe_prob
            confidences.append(conf)
            nearest_dist = float(round(distances[i][0], 3))
            verdict_str = "SAFE" if pred == 0 else "UNSAFE"

            if pred == 0:
                safe_count += 1
            else:
                unsafe_count += 1

            parsed_rows[target_idx]["prediction"] = pred
            parsed_rows[target_idx]["verdict"] = verdict_str
            parsed_rows[target_idx]["confidence"] = round(conf, 4)
            parsed_rows[target_idx]["unsafe_probability"] = round(unsafe_prob, 4)
            parsed_rows[target_idx]["nearest_distance"] = nearest_dist

    avg_conf = round(float(np.mean(confidences)), 4) if confidences else 0.0
    results = parsed_rows

    return {
        "category": cat,
        "total": len(rows),
        "safe_count": safe_count,
        "unsafe_count": unsafe_count,
        "error_count": error_count,
        "avg_confidence": avg_conf,
        "features_used": feature_keys,
        "trained_on": len(df),
        "k": k_final,
        "results": results,
        "disclaimer": "Predictions come from a model trained on the synthetic dataset."
    }


if __name__ == "__main__":
    import json

    print("=" * 60)
    print("k-NN TEST - Dairy")
    print("=" * 60)

    ev = evaluate_knn("Dairy")
    print("\n[Evaluation on train/test split]")
    print(json.dumps(ev))

    fresh = {"Temperature_C": 4.0, "Moisture_percent": 85.0, "Storage_Days": 3,
             "pH": 6.6, "Fat_Percent": 3.5, "Titratable_Acidity": 0.14}
    spoiled = {"Temperature_C": 20.0, "Moisture_percent": 88.0, "Storage_Days": 20,
               "pH": 4.5, "Fat_Percent": 5.0, "Titratable_Acidity": 0.40}

    for name, sample in (("FRESH-looking sample", fresh), ("SPOILED-looking sample", spoiled)):
        r = predict_knn("Dairy", sample)
        print(f"\n[{name}]")
        print("verdict          :", r["verdict"])
        print("unsafe_probability:", r["unsafe_probability"], f"(k={r['k']}, trained_on={r['trained_on']})")
        print("neighbors        :", [f"{n['label']}@{n['distance']}" for n in r["neighbors"]])

    print("\n[Missing feature test]")
    try:
        predict_knn("Dairy", {"Temperature_C": 4.0})
    except ValueError as e:
        print("ValueError ->", e)