"""
models.py
---------
mlAnalysis.js ke Linear / Logistic / Ridge / Lasso ka Python version.

Farak JS se:
  1. Data pehle train (80%) aur test (20%) mein baanta jata hai.
  2. Scaling (StandardScaler) sirf TRAIN data se seekhi jati hai.
  3. Model train data par seekhta hai, aur marks TEST data par diye jate hain.
Result JSON-ready dict hota hai, taaki baad mein API seedha bhej sake.
"""

import numpy as np
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
from sklearn.preprocessing import StandardScaler

from data_loader import get_feature_keys, load_category_dataset, normalize_category

TEST_SIZE = 0.2      # 20% data test ke liye
RANDOM_STATE = 42    # har baar same split aaye (result repeatable rahe)
MIN_ROWS = 10        # isse kam rows mein split ka matlab nahi


def prepare_data(category, target):
    """
    Data load -> train/test split -> scaling.
    target: 'Risk_Score' (regression) ya 'Safety_Label' (classification)
    """
    cat = normalize_category(category)
    df = load_category_dataset(cat)
    if len(df) < MIN_ROWS:
        raise ValueError(f"Not enough dataset samples for {category}: found {len(df)}")

    feature_keys = get_feature_keys(cat)
    X = df[feature_keys].to_numpy(dtype=float)
    y = df[target].to_numpy()
    labels = df["Safety_Label"].to_numpy()

    # Stratify: train aur test dono mein Safe/Unsafe ka ratio lagbhag same rahe
    counts = np.bincount(labels, minlength=2)
    stratify = labels if counts.min() >= 2 else None

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=stratify
    )

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)   # fit sirf train par
    X_test_s = scaler.transform(X_test)         # test par sirf transform

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


def _risk_level(score):
    if score >= 60:
        return "Higher Risk"
    if score >= 30:
        return "Moderate Risk"
    return "Low Risk"


def run_linear_regression(category="All"):
    """Risk_Score (0-100) predict karna - continuous value."""
    d = prepare_data(category, "Risk_Score")

    model = LinearRegression()
    model.fit(d["X_train"], d["y_train"])

    train_pred = np.clip(model.predict(d["X_train"]), 0, 100)
    test_pred = np.clip(model.predict(d["X_test"]), 0, 100)

    influence = sorted(
        (
            {
                "feature": name,
                "weight": round(float(w), 4),
                "effect": "increases risk" if w > 0 else "decreases risk",
            }
            for name, w in zip(d["feature_keys"], model.coef_)
        ),
        key=lambda item: abs(item["weight"]),
        reverse=True,
    )

    first_actual = float(d["y_test"][0])
    first_pred = float(test_pred[0])

    return {
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


# Teen "logistic" variants - sab same model, bas regularization alag
#   logistic : (almost) koi penalty nahi - C bahut bada rakha hai
#   ridge    : L2 penalty (weights ko chhota rakhta hai)
#   lasso    : L1 penalty (kuch weights ko exactly 0 kar deta hai)
LOGISTIC_VARIANTS = {
    "logistic": {"title": "Logistic Regression", "params": {"C": 1e6}},
    "ridge": {"title": "Ridge Regression (L2)", "params": {"C": 1.0, "l1_ratio": 0.0}},
    "lasso": {"title": "Lasso Regression (L1)", "params": {"C": 1.0, "l1_ratio": 1.0, "solver": "saga"}},
}


def run_logistic(category="All", kind="logistic"):
    """Safe (0) vs Unsafe (1) classification."""
    if kind not in LOGISTIC_VARIANTS:
        raise ValueError(f"kind must be one of {list(LOGISTIC_VARIANTS)}")
    variant = LOGISTIC_VARIANTS[kind]

    d = prepare_data(category, "Safety_Label")
    y_train = d["y_train"].astype(int)
    y_test = d["y_test"].astype(int)

    model = LogisticRegression(max_iter=5000, **variant["params"])
    model.fit(d["X_train"], y_train)

    train_pred = model.predict(d["X_train"])
    test_pred = model.predict(d["X_test"])
    test_proba = model.predict_proba(d["X_test"])[:, 1]   # Unsafe ki probability

    # labels=[0, 1] dene se matrix hamesha 2x2 aata hai
    tn, fp, fn, tp = confusion_matrix(y_test, test_pred, labels=[0, 1]).ravel()

    weights = model.coef_[0]
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

    first_p = float(test_proba[0])

    return {
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
        "zero_weight_features": [i["feature"] for i in influence if i["weight"] == 0],
        "sample_prediction": {
            "note": "First TEST sample (model ne ise training mein nahi dekha)",
            "actual": "UNSAFE" if int(y_test[0]) == 1 else "SAFE",
            "predicted": "UNSAFE" if first_p >= 0.5 else "SAFE",
            "unsafe_probability": round(first_p, 4),
        },
    }


if __name__ == "__main__":
    import json
    import sys

    cat = sys.argv[1] if len(sys.argv) > 1 else "Dairy"
    print("=" * 60)
    print("CATEGORY:", cat)
    print("=" * 60)

    r = run_linear_regression(cat)
    print(f"\n[{r['model']}]  train={r['n_train']}  test={r['n_test']}")
    print("metrics:", json.dumps(r["metrics"]))
    print("sample :", json.dumps(r["sample_prediction"]))
    for i in r["feature_influence"]:
        print(f"   {i['feature']:22s} {i['weight']:9.3f}  {i['effect']}")

    for kind in ("logistic", "ridge", "lasso"):
        r = run_logistic(cat, kind)
        print(f"\n[{r['model']}]  train={r['n_train']}  test={r['n_test']}  (safe={r['n_safe']}, unsafe={r['n_unsafe']})")
        print("metrics:", json.dumps(r["metrics"]))
        print("confusion:", json.dumps(r["confusion_matrix"]))
        print("sample :", json.dumps(r["sample_prediction"]))
        for i in r["feature_influence"]:
            print(f"   {i['feature']:22s} {i['weight']:9.3f}  {i['effect']}")
        if r["zero_weight_features"]:
            print("   zero-weight (Lasso ne hata diye):", r["zero_weight_features"])