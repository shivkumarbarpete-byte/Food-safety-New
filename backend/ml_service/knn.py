"""
knn.py
------
Fast inference-only k-NN module.
Loads pre-trained k-NN models and pipelines directly from artifacts (pretrained_models.pkl),
performing predictions in < 2ms without running runtime training, fitting, or train/test splits.
"""

from pathlib import Path
import joblib
import numpy as np

from data_loader import get_feature_keys, normalize_category

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"
MODELS_PKL_PATH = ARTIFACTS_DIR / "pretrained_models.pkl"

DEFAULT_K = 5
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


def get_pretrained_knn(category="Dairy"):
    """Fetches pre-trained k-NN pipeline and metadata for a category."""
    artifacts = load_artifacts()
    cat = normalize_category(category or "Dairy")
    knn_models = artifacts.get("knn_models", {})
    if cat not in knn_models:
        raise ValueError(f"No pre-trained k-NN model found for category: '{category}'")
    return cat, knn_models[cat]


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
    """Returns pre-computed honest accuracy on the test split from offline training."""
    cat, entry = get_pretrained_knn(category)
    return entry["evaluation"]


def predict_knn(category, feature_map, k=DEFAULT_K):
    """
    Ek naye food sample ko Safe / Unsafe batata hai.
    Uses pre-trained model artifact - does zero runtime training.
    """
    cat, entry = get_pretrained_knn(category)
    feature_keys = entry["feature_keys"]
    pipe = entry["pipeline"]
    y_train = entry["y_train"]
    k_final = entry["k"]
    trained_on = entry["trained_on"]
    evaluation = entry["evaluation"]

    input_vector = _build_input_vector(category, feature_map, feature_keys)
    x_new = np.array([input_vector], dtype=float)

    label = int(pipe.predict(x_new)[0])
    classes = list(pipe.classes_)
    if 1 in classes:
        unsafe_prob = float(pipe.predict_proba(x_new)[0][classes.index(1)])
    else:
        unsafe_prob = 0.0

    # Nearest neighbors (scaled space mein distance)
    scaler = pipe.named_steps["scale"]
    knn_clf = pipe.named_steps["knn"]
    x_scaled = scaler.transform(x_new)
    distances, indices = knn_clf.kneighbors(x_scaled)
    neighbors = [
        {
            "label": "UNSAFE" if int(y_train[i]) == 1 else "SAFE",
            "distance": round(float(dist), 3),
        }
        for dist, i in zip(distances[0], indices[0])
    ]

    return {
        "prediction": label,                                    # 0 = Safe, 1 = Unsafe
        "verdict": "Low Risk Screening Estimate" if label == 0 else "Higher Risk Screening Estimate",
        "unsafe_probability": round(unsafe_prob, 4),            # k neighbors mein se kitne Unsafe
        "trained_on": trained_on,
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
    Uses pre-trained pipeline - does zero runtime training.
    """
    cat, entry = get_pretrained_knn(category)
    feature_keys = entry["feature_keys"]
    pipe = entry["pipeline"]
    scaler = pipe.named_steps["scale"]
    knn_clf = pipe.named_steps["knn"]
    k_final = entry["k"]
    trained_on = entry["trained_on"]

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

    safe_count = 0
    unsafe_count = 0
    error_count = len(parsed_rows) - len(valid_vectors)
    confidences = []

    if valid_vectors:
        X_batch = np.array(valid_vectors, dtype=float)
        X_batch_scaled = scaler.transform(X_batch)
        preds = knn_clf.predict(X_batch_scaled)
        probs = knn_clf.predict_proba(X_batch_scaled)
        distances, _ = knn_clf.kneighbors(X_batch_scaled)

        unsafe_idx = list(knn_clf.classes_).index(1) if 1 in knn_clf.classes_ else -1

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
        "trained_on": trained_on,
        "k": k_final,
        "results": results,
        "disclaimer": "Predictions come from a model trained on the synthetic dataset."
    }


if __name__ == "__main__":
    print("=" * 60)
    print("k-NN TEST - Dairy (Inference from pre-trained artifact)")
    print("=" * 60)
    sample_features = {
        "Temperature_C": 4.0,
        "Moisture_percent": 85.0,
        "Storage_Days": 3,
        "pH": 6.6,
        "Fat_Percent": 3.5,
        "Titratable_Acidity": 0.14,
    }
    res = predict_knn("Dairy", sample_features)
    print("Prediction result:", res["verdict"], f"(unsafe_probability={res['unsafe_probability']})")