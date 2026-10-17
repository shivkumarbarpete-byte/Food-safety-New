"""
data_loader.py
--------------
Python version of backend/ml/datasetLoader.js
CSV padhta hai, category ke hisaab se filter karta hai, aur
sirf wahi rows deta hai jinme saare zaroori features maujood hon.
"""

from pathlib import Path
import pandas as pd

# backend/ml_service/data_loader.py  ->  backend/data/food_safety_dataset_by_category.csv
DATASET_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "food_safety_dataset_by_category.csv"
)

# Frontend ke naam -> CSV ke naam
CATEGORY_MAP = {
    "Dairy": "Dairy",
    "Meat & Poultry": "Meat_Poultry",
    "Meat_Poultry": "Meat_Poultry",
    "Seafood": "Seafood",
    "Fresh Produce": "Fresh_Produce",
    "Fresh_Produce": "Fresh_Produce",
    "Beverage": "Beverage",
    "Bakery": "Bakery",
    "Frozen Food": "Frozen_Food",
    "Frozen_Food": "Frozen_Food",
    "Baby Food": "Baby_Food",
    "Baby_Food": "Baby_Food",
    "Packaged Snack": "Packaged_Snack",
    "Packaged_Snack": "Packaged_Snack",
    "Street Food": "Street_Food",
    "Street_Food": "Street_Food",
}

# Har category ke apne features
CATEGORY_FEATURES = {
    "Dairy": ["Temperature_C", "Moisture_percent", "Storage_Days", "pH", "Fat_Percent", "Titratable_Acidity"],
    "Meat_Poultry": ["Temperature_C", "Moisture_percent", "Storage_Days", "pH", "Color_Score"],
    "Seafood": ["Temperature_C", "Moisture_percent", "Storage_Days", "TVBN_Level"],
    "Fresh_Produce": ["Temperature_C", "Moisture_percent", "Storage_Days", "Ripeness_Index"],
    "Beverage": ["Temperature_C", "Moisture_percent", "Storage_Days", "pH", "Sugar_Content_Percent"],
    "Bakery": ["Temperature_C", "Moisture_percent", "Storage_Days", "Mold_Risk_Index"],
    "Frozen_Food": ["Temperature_C", "Moisture_percent", "Storage_Days", "Temp_Deviation_Neg18"],
    "Baby_Food": ["Temperature_C", "Moisture_percent", "Storage_Days", "pH"],
    "Packaged_Snack": ["Temperature_C", "Moisture_percent", "Storage_Days", "Oil_Rancidity_Index"],
    "Street_Food": ["Temperature_C", "Moisture_percent", "Storage_Days", "Hygiene_Score"],
}

# "All" category ke liye: sirf wo features jo har category mein hain
COMMON_FEATURES = ["Temperature_C", "Moisture_percent", "Storage_Days"]


def normalize_category(category):
    """Frontend ka naam -> CSV wala naam. None ya 'All' ho to 'All' lautata hai."""
    if category is None or category == "All":
        return "All"
    return CATEGORY_MAP.get(category, category)


def get_feature_keys(category):
    """Is category ke liye model jin features par train hoga unki list."""
    cat = normalize_category(category)
    if cat == "All":
        return list(COMMON_FEATURES)
    if cat not in CATEGORY_FEATURES:
        raise ValueError(f"Unknown category: {category}")
    return list(CATEGORY_FEATURES[cat])


def load_category_dataset(category="All"):
    """
    CSV load karke saaf DataFrame lautata hai.
    Columns: Category, <features...>, Risk_Score, Safety_Label
    Safety_Label: 0 = Safe, 1 = Unsafe
    """
    if not DATASET_PATH.exists():
        raise FileNotFoundError(f"Dataset file not found: {DATASET_PATH}")

    df = pd.read_csv(DATASET_PATH)
    df.columns = df.columns.str.strip()
    df["Category"] = df["Category"].astype(str).str.strip()

    cat = normalize_category(category)
    if cat != "All":
        if cat not in CATEGORY_FEATURES:
            raise ValueError(f"Unknown category: {category}")
        df = df[df["Category"] == cat]

    feature_keys = get_feature_keys(cat)
    needed = feature_keys + ["Risk_Score", "Safety_Label"]

    df = df[["Category"] + needed].copy()
    for col in needed:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # Jis row mein koi zaroori value khaali ho, use hata do
    df = df.dropna(subset=needed)
    df["Safety_Label"] = df["Safety_Label"].astype(int)

    return df.reset_index(drop=True)


if __name__ == "__main__":
    # Self-test: file ko seedha chalane par ye block chalta hai
    print("Dataset path:", DATASET_PATH)
    print()
    for name in [
        "Dairy", "Meat & Poultry", "Seafood", "Fresh Produce", "Beverage",
        "Bakery", "Frozen Food", "Baby Food", "Packaged Snack", "Street Food",
    ]:
        d = load_category_dataset(name)
        safe = int((d["Safety_Label"] == 0).sum())
        unsafe = int((d["Safety_Label"] == 1).sum())
        print(f"{name:16s} rows={len(d):3d}  safe={safe:3d}  unsafe={unsafe:3d}  features={len(get_feature_keys(name))}")

    all_df = load_category_dataset("All")
    print()
    print("All ->", len(all_df), "rows, features:", get_feature_keys("All"))