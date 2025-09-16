"""Model testing service for inference on uploaded images."""

from __future__ import annotations

import os
import json
import tempfile
from typing import Dict, List, Optional, Tuple
from io import BytesIO
from PIL import Image
import torch
import torch.nn.functional as F
from transformers import AutoImageProcessor, AutoModelForImageClassification

from dashboard.db import SessionLocal
from dashboard import models
from common.config import TrainConfig


class ModelTester:
    """Service for testing trained models with uploaded images."""

    def __init__(self):
        self._datasets_root = os.environ.get("DATASETS_DIR", "/app/datasets")

    def test_image(self, run_id: str, image_data: bytes) -> Dict:
        """
        Test an uploaded image against a trained model checkpoint.

        Args:
            run_id: The training run ID
            image_data: Raw image bytes

        Returns:
            Dict containing predictions, confidence scores, and metadata
        """
        db = SessionLocal()
        try:
            # Get run information
            run = db.query(models.Run).filter(models.Run.id == run_id).first()
            if not run:
                raise ValueError(f"Run {run_id} not found")

            if run.state not in ["succeeded", "finished"]:
                raise ValueError(f"Run {run_id} is not completed (state: {run.state})")

            # Load checkpoint and config
            checkpoint_path, config = self._load_checkpoint_and_config(run)

            # Prepare image
            image = self._prepare_image(image_data)

            # Run inference
            predictions = self._run_inference(image, checkpoint_path, config)

            return {
                "run_id": run_id,
                "run_name": run.name,
                "predictions": predictions,
                "model_info": {
                    "model_flavour": config.get("model_flavour"),
                    "num_classes": len(config.get("class_labels", [])),
                    "epoch": run.epoch,
                    "best_value": run.best_value,
                    "monitor_metric": run.monitor_metric,
                }
            }

        except Exception as e:
            raise ValueError(f"Model testing failed: {str(e)}")
        finally:
            db.close()

    def _load_checkpoint_and_config(self, run: models.Run) -> Tuple[str, Dict]:
        """Load checkpoint path and training config for a run."""
        if not run.ckpt_dir:
            raise ValueError("No checkpoint directory found for this run")

        # Construct paths
        run_ckpt_dir = os.path.join(run.ckpt_dir, run.name)
        checkpoint_path = os.path.join(run_ckpt_dir, "best.pt")
        config_path = os.path.join(run_ckpt_dir, "train_config.json")

        # Check if files exist
        if not os.path.exists(checkpoint_path):
            raise ValueError(f"Checkpoint not found: {checkpoint_path}")

        if not os.path.exists(config_path):
            raise ValueError(f"Config not found: {config_path}")

        # Load config
        with open(config_path, 'r') as f:
            config = json.load(f)

        return checkpoint_path, config

    def _prepare_image(self, image_data: bytes) -> Image.Image:
        """Prepare uploaded image for inference."""
        try:
            # Load image from bytes
            image = Image.open(BytesIO(image_data))

            # Convert to RGB if needed
            if image.mode != "RGB":
                image = image.convert("RGB")

            return image

        except Exception as e:
            raise ValueError(f"Invalid image format: {str(e)}")

    def _run_inference(self, image: Image.Image, checkpoint_path: str, config: Dict) -> List[Dict]:
        """Run model inference on the prepared image."""
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        # Get model and labels info from config
        model_flavour = config.get("model_flavour")
        class_labels = config.get("class_labels", [])
        id2label = config.get("id2label", {})
        label2id = config.get("label2id", {})

        if not class_labels:
            raise ValueError("No class labels found in training config")

        # Load checkpoint
        checkpoint = torch.load(checkpoint_path, map_location=device)
        model_state = checkpoint["model_state"]

        # Recreate model architecture
        num_labels = len(class_labels)

        # Convert id2label keys to integers if they're strings
        if id2label and isinstance(next(iter(id2label.keys())), str):
            id2label = {int(k): v for k, v in id2label.items()}

        try:
            # Load model with HuggingFace
            model = AutoModelForImageClassification.from_pretrained(
                model_flavour,
                num_labels=num_labels,
                id2label=id2label,
                label2id=label2id,
                ignore_mismatched_sizes=True
            )
            processor = AutoImageProcessor.from_pretrained(model_flavour)

        except Exception as e:
            raise ValueError(f"Failed to load model architecture: {str(e)}")

        # Load trained weights
        try:
            model.load_state_dict(model_state)
            model.to(device)
            model.eval()
        except Exception as e:
            raise ValueError(f"Failed to load trained weights: {str(e)}")

        # Preprocess image
        try:
            inputs = processor(images=image, return_tensors="pt")
            inputs = {k: v.to(device) for k, v in inputs.items()}
        except Exception as e:
            raise ValueError(f"Image preprocessing failed: {str(e)}")

        # Run inference
        with torch.no_grad():
            outputs = model(**inputs)
            logits = outputs.logits

        # Get probabilities
        probabilities = F.softmax(logits, dim=-1)
        probs_np = probabilities.cpu().numpy()[0]

        # Create predictions list
        predictions = []
        for i, prob in enumerate(probs_np):
            label = class_labels[i] if i < len(class_labels) else f"class_{i}"
            predictions.append({
                "class_id": i,
                "class_name": label,
                "confidence": float(prob),
                "percentage": f"{prob * 100:.2f}%"
            })

        # Sort by confidence (highest first)
        predictions.sort(key=lambda x: x["confidence"], reverse=True)

        return predictions

    def get_run_info(self, run_id: str) -> Dict:
        """Get basic information about a run for testing."""
        db = SessionLocal()
        try:
            run = db.query(models.Run).filter(models.Run.id == run_id).first()
            if not run:
                raise ValueError(f"Run {run_id} not found")

            # Check if checkpoint exists
            has_checkpoint = False
            try:
                checkpoint_path, config = self._load_checkpoint_and_config(run)
                has_checkpoint = True
                class_labels = config.get("class_labels", [])
            except Exception:
                class_labels = []

            return {
                "run_id": run_id,
                "run_name": run.name,
                "state": run.state,
                "has_checkpoint": has_checkpoint,
                "num_classes": len(class_labels),
                "class_labels": class_labels,
                "epoch": run.epoch,
                "best_value": run.best_value,
                "monitor_metric": run.monitor_metric,
                "can_test": has_checkpoint and run.state in ["succeeded", "finished"]
            }

        finally:
            db.close()