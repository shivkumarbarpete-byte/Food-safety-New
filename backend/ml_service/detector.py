"""
detector.py
-----------
Real-time Food Freshness Detection & Tracking engine using Ultralytics YOLO & OpenCV.
Supports:
  - Model loading with fallback to standard yolov8n.pt
  - Image inference & base64 JPEG annotation
  - Label classification: 'fresh', 'rotten', or 'neutral'
  - Safety verdict ('Safe to Consume', 'Unsafe - Spoilage Detected', or 'No Food Item Found')
  - Graceful handling of empty or corrupted detection frames
"""

from __future__ import annotations

import base64
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import cv2
import numpy as np
from ultralytics import YOLO

logger = logging.getLogger("FoodFreshnessDetector")
logger.setLevel(logging.INFO)


class FoodFreshnessDetector:
    """Wrapper class for YOLO-based food detection, tracking, and freshness analysis."""

    # BGR color palette for OpenCV annotations
    COLOR_FRESH = (46, 204, 113)    # Emerald Green
    COLOR_ROTTEN = (41, 128, 185)   # Brick Red / Warning
    COLOR_NEUTRAL = (241, 196, 15)  # Amber

    ROTTEN_KEYWORDS = ("rotten", "spoiled", "mold", "mould", "bad", "decay", "stale")
    FRESH_KEYWORDS = ("fresh", "good", "ripe", "clean")

    def __init__(
        self,
        model_path: Union[str, Path] = "artifacts/best.pt",
        fallback_model: str = "yolov8n.pt",
        conf_threshold: float = 0.30,
        iou_threshold: float = 0.45,
        device: str = "cpu",
    ) -> None:
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.device = device

        weights_file = Path(model_path)
        if weights_file.is_file():
            logger.info("Loading custom trained weights: %s", weights_file)
            self.model_path = str(weights_file)
            self.model = YOLO(self.model_path)
        else:
            logger.warning(
                "Weights '%s' not found. Falling back to default '%s'.",
                weights_file,
                fallback_model,
            )
            self.model_path = fallback_model
            self.model = YOLO(fallback_model)

        self.class_names: Dict[int, str] = (
            self.model.names if hasattr(self.model, "names") else {}
        )

    def _determine_freshness_state(self, label: str) -> str:
        """Classify item as 'fresh', 'rotten', or 'neutral' based on label naming conventions."""
        lbl_lower = label.lower().replace("-", "_").replace(" ", "_")
        for term in self.ROTTEN_KEYWORDS:
            if term in lbl_lower:
                return "rotten"
        for term in self.FRESH_KEYWORDS:
            if term in lbl_lower:
                return "fresh"
        return "neutral"

    def predict_image(
        self,
        image_bytes: bytes,
        render_annotated: bool = True,
        imgsz: int = 640,
    ) -> Dict[str, Any]:
        """
        Runs inference on raw image bytes.
        Returns detection metadata, overall food safety verdict, and base64 rendered image.
        """
        # Decode raw image buffer to OpenCV BGR
        np_arr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None or frame.size == 0:
            raise ValueError("Invalid image format or corrupted buffer.")

        # Run YOLO inference
        results = self.model.predict(
            source=frame,
            conf=self.conf_threshold,
            iou=self.iou_threshold,
            imgsz=imgsz,
            device=self.device,
            verbose=False,
        )

        detections: List[Dict[str, Any]] = []
        has_rotten = False
        has_fresh = False

        result = results[0]
        boxes = result.boxes
        annotated_frame = frame.copy() if render_annotated else None

        if boxes is not None and len(boxes) > 0:
            for box in boxes:
                xyxy = box.xyxy[0].cpu().numpy().astype(int)  # [x1, y1, x2, y2]
                conf = float(box.conf[0].cpu().numpy())
                cls_id = int(box.cls[0].cpu().numpy())
                label = self.class_names.get(cls_id, f"class_{cls_id}")

                state = self._determine_freshness_state(label)
                if state == "rotten":
                    has_rotten = True
                elif state == "fresh":
                    has_fresh = True

                x1, y1, x2, y2 = xyxy
                detections.append(
                    {
                        "class_id": cls_id,
                        "label": label,
                        "state": state,
                        "confidence": round(conf, 4),
                        "bbox": {
                            "x1": int(x1),
                            "y1": int(y1),
                            "x2": int(x2),
                            "y2": int(y2),
                            "width": int(x2 - x1),
                            "height": int(y2 - y1),
                        },
                    }
                )

                if render_annotated and annotated_frame is not None:
                    color = (
                        self.COLOR_ROTTEN
                        if state == "rotten"
                        else self.COLOR_FRESH
                        if state == "fresh"
                        else self.COLOR_NEUTRAL
                    )
                    # Draw bounding box
                    cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, 2, lineType=cv2.LINE_AA)

                    # Draw label tag with background
                    display_text = f"{label} ({int(conf * 100)}%)"
                    (tw, th), _ = cv2.getTextSize(
                        display_text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1
                    )
                    cv2.rectangle(
                        annotated_frame,
                        (x1, max(0, y1 - 24)),
                        (x1 + tw + 6, max(0, y1)),
                        color,
                        -1,
                    )
                    cv2.putText(
                        annotated_frame,
                        display_text,
                        (x1 + 3, max(14, y1 - 6)),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5,
                        (255, 255, 255),
                        1,
                        cv2.LINE_AA,
                    )

        # Aggregate overall food safety status
        if has_rotten:
            overall_verdict = "Unsafe - Spoilage Detected"
            safety_status = "unsafe"
            safety_score = 15
        elif has_fresh:
            overall_verdict = "Safe to Consume"
            safety_status = "safe"
            safety_score = 95
        elif len(detections) > 0:
            overall_verdict = "Items Detected - Indeterminate Freshness"
            safety_status = "warning"
            safety_score = 50
        else:
            overall_verdict = "No Food Item Found"
            safety_status = "none"
            safety_score = 0

        # Encode annotated image back to base64
        base64_annotated: Optional[str] = None
        if render_annotated and annotated_frame is not None:
            _, buffer = cv2.imencode(".jpg", annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            base64_annotated = f"data:image/jpeg;base64,{base64.b64encode(buffer).decode('utf-8')}"

        return {
            "summary": {
                "verdict": overall_verdict,
                "status": safety_status,
                "safety_score": safety_score,
                "total_detected": len(detections),
            },
            "detections": detections,
            "annotated_image": base64_annotated,
        }
