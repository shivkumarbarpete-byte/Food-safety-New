import csv
import json
import sys
from pathlib import Path

# Add backend/ml_service to path
ml_service_dir = Path(__file__).resolve().parent / "backend" / "ml_service"
sys.path.insert(0, str(ml_service_dir))

from knn import predict_knn_batch

csv_path = Path(__file__).resolve().parent / "sample_dairy_batch.csv"

# Read sample CSV into row dictionaries
rows = []
with open(csv_path, mode="r", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for r in reader:
        rows.append(r)

print(f"Loaded {len(rows)} rows from sample_dairy_batch.csv")

# Run batch prediction
result = predict_knn_batch("Dairy", rows)

print("\n" + "=" * 60)
print("BATCH PREDICTION SUMMARY")
print("=" * 60)
print(f"Category         : {result['category']}")
print(f"Total Rows       : {result['total']}")
print(f"Safe Count       : {result['safe_count']}")
print(f"Unsafe Count     : {result['unsafe_count']}")
print(f"Error Count      : {result['error_count']}")
print(f"Avg Confidence   : {result['avg_confidence'] * 100:.1f}%")
print(f"Features Used    : {result['features_used']}")
print(f"Trained on       : {result['trained_on']} samples (k={result['k']})")
print(f"Disclaimer       : {result['disclaimer']}")

print("\n" + "=" * 60)
print("ROW-BY-ROW RESULTS")
print("=" * 60)
header_fmt = "{:<4} | {:<32} | {:<8} | {:<10} | {:<8} | {:<25}"
print(header_fmt.format("#", "Sample Name", "Verdict", "Confidence", "Distance", "Status / Notes"))
print("-" * 100)

for r in result["results"]:
    idx = r["row_index"]
    name = r["name"]
    verdict = r["verdict"]
    conf = f"{r['confidence'] * 100:.1f}%" if r["confidence"] is not None else "-"
    dist = f"{r['nearest_distance']:.3f}" if r["nearest_distance"] is not None else "-"
    notes = r["error"] if r["error"] else f"Unsafe prob: {r['unsafe_probability']:.2f}"
    print(header_fmt.format(idx, name[:32], verdict, conf, dist, notes))

print("-" * 100)
print("\nFull JSON Response:")
print(json.dumps(result, indent=2))
