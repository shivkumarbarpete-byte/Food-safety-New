"""
analysis.py
-----------
mlAnalysis.js ke runEDA() aur showHistograms() ka Python version.

Yahan koi model train nahi hota - sirf data ko samajhne ke liye statistics.
Charts ab frontend banayega; backend sirf numbers (JSON) bhejega.
"""

from data_loader import get_feature_keys, load_category_dataset, normalize_category

MIN_ROWS = 3


def _load(category):
    cat = normalize_category(category)
    df = load_category_dataset(cat)
    if len(df) < MIN_ROWS:
        raise ValueError(f"Not enough dataset samples for {category}: found {len(df)}")
    return cat, df, get_feature_keys(cat)


def run_eda(category="All"):
    """
    Exploratory Data Analysis:
      - kitne rows, kitne Safe / Unsafe
      - har feature ka average, min, max, std
      - scatter chart ke points (pehla feature vs doosra feature)
    """
    cat, df, feature_keys = _load(category)

    safe_df = df[df["Safety_Label"] == 0]
    unsafe_df = df[df["Safety_Label"] == 1]

    feature_stats = []
    for key in feature_keys:
        col = df[key]
        feature_stats.append(
            {
                "feature": key,
                "mean": round(float(col.mean()), 2),
                "std": round(float(col.std(ddof=0)), 2),
                "min": round(float(col.min()), 2),
                "max": round(float(col.max()), 2),
            }
        )

    x_key, y_key = feature_keys[0], feature_keys[1]

    def to_points(frame):
        return [
            {"x": round(float(x), 3), "y": round(float(y), 3)}
            for x, y in zip(frame[x_key], frame[y_key])
        ]

    return {
        "category": cat,
        "n_rows": int(len(df)),
        "n_safe": int(len(safe_df)),
        "n_unsafe": int(len(unsafe_df)),
        "features": feature_keys,
        "feature_stats": feature_stats,
        "scatter": {
            "x_feature": x_key,
            "y_feature": y_key,
            "safe_points": to_points(safe_df),
            "unsafe_points": to_points(unsafe_df),
        },
    }


def run_histograms(category="All"):
    """
    Har feature ka average: Safe samples vs Unsafe samples (bar chart ke liye).
    """
    cat, df, feature_keys = _load(category)

    safe_df = df[df["Safety_Label"] == 0]
    unsafe_df = df[df["Safety_Label"] == 1]

    comparison = []
    for key in feature_keys:
        safe_avg = float(safe_df[key].mean()) if len(safe_df) else 0.0
        unsafe_avg = float(unsafe_df[key].mean()) if len(unsafe_df) else 0.0
        comparison.append(
            {
                "feature": key,
                "safe_avg": round(safe_avg, 2),
                "unsafe_avg": round(unsafe_avg, 2),
            }
        )

    return {
        "category": cat,
        "n_safe": int(len(safe_df)),
        "n_unsafe": int(len(unsafe_df)),
        "features": feature_keys,
        "comparison": comparison,
    }


if __name__ == "__main__":
    import sys

    cat = sys.argv[1] if len(sys.argv) > 1 else "Dairy"

    print("=" * 60)
    print("EDA -", cat)
    print("=" * 60)
    eda = run_eda(cat)
    print(f"rows={eda['n_rows']}  safe={eda['n_safe']}  unsafe={eda['n_unsafe']}")
    for s in eda["feature_stats"]:
        print(f"  {s['feature']:22s} mean={s['mean']:8.2f}  std={s['std']:7.2f}  min={s['min']:8.2f}  max={s['max']:8.2f}")
    sc = eda["scatter"]
    print(f"scatter: {sc['x_feature']} vs {sc['y_feature']}  "
          f"({len(sc['safe_points'])} safe pts, {len(sc['unsafe_points'])} unsafe pts)")

    print()
    print("=" * 60)
    print("HISTOGRAM (Safe avg vs Unsafe avg) -", cat)
    print("=" * 60)
    hist = run_histograms(cat)
    for c in hist["comparison"]:
        print(f"  {c['feature']:22s} safe={c['safe_avg']:8.2f}   unsafe={c['unsafe_avg']:8.2f}")