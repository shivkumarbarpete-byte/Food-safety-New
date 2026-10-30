"""
train.py
--------
Fine-tuning YOLOv8 for Food Freshness & Spoilage Detection.

Usage:
  python train.py
"""

from pathlib import Path
from ultralytics import YOLO


def train_freshness_model():
    data_yaml = Path("datasets/food_freshness/data.yaml")
    if not data_yaml.exists():
        print(f"Warning: {data_yaml} not found.")
        print("Please prepare your dataset structure or download from Roboflow/Kaggle.")
        return

    # 1. Load baseline model (YOLOv8 Nano for fast edge & real-time inference)
    print("Loading YOLOv8 nano baseline...")
    model = YOLO("yolov8n.pt")

    # 2. Train on food freshness dataset
    print(f"Starting training on {data_yaml}...")
    results = model.train(
        data=str(data_yaml),
        epochs=50,
        imgsz=640,
        batch=16,
        patience=10,
        device=0,  # Or 'cpu' if NVIDIA CUDA is not installed
        project="artifacts",
        name="freshness_yolo_run",
        save=True,
    )

    # 3. Export weights to deployment location
    best_weights = Path("artifacts/freshness_yolo_run/weights/best.pt")
    target_weights = Path("artifacts/best.pt")
    if best_weights.exists():
        target_weights.parent.mkdir(parents=True, exist_ok=True)
        target_weights.write_bytes(best_weights.read_bytes())
        print(f"Deployment weights ready at: {target_weights.resolve()}")


if __name__ == "__main__":
    train_freshness_model()
