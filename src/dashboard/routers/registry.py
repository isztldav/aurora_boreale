"""API endpoints for configuration registry data.

Provides endpoints for the UI to access supported transforms, presets, and validation.
"""
from fastapi import APIRouter
from typing import Dict, Any, List
import json
import sys
import os

# Add the src directory to the path so we can import common modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from core.utils.registry import (
    get_registry_export,
    validate_gpu_augmentation_spec,
    validate_cpu_color_jitter_spec
)
from core.config import TrainConfig

router = APIRouter(prefix="/registry", tags=["registry"])


@router.get("/export")
def get_all_registries() -> Dict[str, Any]:
    """Get all registry data for UI consumption."""
    try:
        export_data = get_registry_export()
        # Parse JSON strings back to objects for cleaner API response
        parsed_data = {}
        for key, json_str in export_data.items():
            parsed_data[key] = json.loads(json_str)
        return {"success": True, "data": parsed_data}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/gpu-transforms")
def get_gpu_transforms() -> Dict[str, Any]:
    """Get supported GPU transforms."""
    try:
        export_data = get_registry_export()
        gpu_transforms_data = json.loads(export_data["gpu_transforms"])
        return {"success": True, "transforms": gpu_transforms_data}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/gpu-presets")
def get_gpu_presets() -> Dict[str, Any]:
    """Get available GPU augmentation presets."""
    try:
        export_data = get_registry_export()
        gpu_presets_data = json.loads(export_data["gpu_presets"])
        return {"success": True, "presets": gpu_presets_data}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/cpu-color-presets")
def get_cpu_color_presets() -> Dict[str, Any]:
    """Get available CPU color jitter presets."""
    try:
        export_data = get_registry_export()
        cpu_presets_data = json.loads(export_data["cpu_color_presets"])
        return {"success": True, "presets": cpu_presets_data}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/models")
def get_supported_models() -> Dict[str, Any]:
    """Get supported model architectures."""
    try:
        export_data = get_registry_export()
        models_data = json.loads(export_data["models"])
        return {"success": True, "models": models_data}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/losses")
def get_supported_losses() -> Dict[str, Any]:
    """Get supported loss functions."""
    try:
        export_data = get_registry_export()
        losses_data = json.loads(export_data["losses"])
        return {"success": True, "losses": losses_data}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/optimizers")
def get_supported_optimizers() -> Dict[str, Any]:
    """Get supported optimizers."""
    try:
        export_data = get_registry_export()
        optimizers_data = json.loads(export_data["optimizers"])
        return {"success": True, "optimizers": optimizers_data}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/validate/gpu-augmentation")
def validate_gpu_augmentation(spec: Dict[str, Any]) -> Dict[str, Any]:
    """Validate a GPU augmentation specification."""
    try:
        is_valid, errors = validate_gpu_augmentation_spec(spec)
        return {
            "success": True,
            "is_valid": is_valid,
            "errors": errors
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/validate/cpu-color-jitter")
def validate_cpu_color_jitter(spec: Dict[str, Any]) -> Dict[str, Any]:
    """Validate a CPU color jitter specification."""
    try:
        is_valid, errors = validate_cpu_color_jitter_spec(spec)
        return {
            "success": True,
            "is_valid": is_valid,
            "errors": errors
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/gpu-preset-examples")
def get_gpu_preset_examples() -> Dict[str, Any]:
    """Get example configurations for GPU presets."""
    examples = {
        "cfp_dr_v1": {
            "description": "Medical fundus photography with geometric augmentation",
            "json": '{"preset": "cfp_dr_v1"}'
        },
        "natural_light": {
            "description": "Light augmentation for natural images",
            "json": '{"preset": "natural_light"}'
        },
        "custom_ops": {
            "description": "Custom operation list",
            "json": '''{\n  "ops": [\n    {"name": "RandomHorizontalFlip", "p": 0.5},\n    {\n      "name": "RandomAffine",\n      "degrees": 10,\n      "translate": [0.1, 0.1],\n      "scale": [0.9, 1.1]\n    }\n  ]\n}'''
        }
    }
    return {"success": True, "examples": examples}


@router.get("/cpu-color-preset-examples")
def get_cpu_color_preset_examples() -> Dict[str, Any]:
    """Get example configurations for CPU color jitter presets."""
    examples = {
        "cfp_color_v1": {
            "description": "Mild color jitter for medical images",
            "json": '{"preset": "cfp_color_v1"}'
        },
        "natural_color_v1": {
            "description": "Standard color jitter for natural images",
            "json": '{"preset": "natural_color_v1"}'
        },
        "custom_params": {
            "description": "Custom color jitter parameters",
            "json": '''{\n  "params": {\n    "brightness": 0.2,\n    "contrast": 0.2,\n    "saturation": 0.1,\n    "hue": 0.05\n  },\n  "p": 0.8\n}'''
        }
    }
    return {"success": True, "examples": examples}


@router.get("/config-schema")
def get_config_schema() -> Dict[str, Any]:
    """Get TrainConfig schema and default values for dynamic form generation."""
    try:
        # Get the Pydantic model schema
        schema = TrainConfig.model_json_schema()

        # Create a default instance to extract default values
        defaults = TrainConfig(
            root="",  # Required field, will be set by dataset selection
            model_flavour="google/vit-base-patch16-224",  # Required field with sensible default
            loss_name="cross_entropy"  # Required field with sensible default
        )

        # Extract default values from the model instance
        default_values = defaults.model_dump()

        # Organize field metadata for UI rendering
        field_groups = {
            "basic": {
                "title": "Basic Configuration",
                "description": "Basic configuration settings",
                "fields": ["root", "model_flavour", "loss_name"]
            },
            "dataset": {
                "title": "Dataset Configuration",
                "description": "Dataset and data loading parameters",
                "fields": [
                    "root", "max_datapoints_per_class", "num_workers",
                    "prefetch_factor", "persistent_workers"
                ]
            },
            "model": {
                "title": "Model Configuration",
                "description": "Model architecture and initialization",
                "fields": [
                    "model_flavour", "loss_name", "load_pretrained",
                    "freeze_backbone", "model_suffix", "hf_token"
                ]
            },
            "training": {
                "title": "Training Configuration",
                "description": "Basic training parameters",
                "fields": ["batch_size", "epochs", "seed", "autocast_dtype"]
            },
            "optimization": {
                "title": "Optimization Configuration",
                "description": "Optimizer and training dynamics",
                "fields": [
                    "optimizer", "lr", "weight_decay", "max_grad_norm",
                    "warmup_ratio", "grad_accum_steps"
                ]
            },
            "augmentation": {
                "title": "Data Augmentation",
                "description": "GPU batch augmentations and CPU color jitter",
                "fields": ["gpu_batch_aug", "cpu_color_jitter"]
            },
            "monitoring": {
                "title": "Monitoring & Checkpoints",
                "description": "Logging, monitoring, and checkpoint saving",
                "fields": [
                    "monitor_metric", "monitor_mode", "tb_root", "ckpt_dir",
                    "save_per_epoch_checkpoint", "run_name", "eval_topk"
                ]
            },
            "internal": {
                "title": "Internal Fields",
                "description": "Fields managed internally by the system",
                "fields": ["class_labels", "label2id", "id2label"]
            }
        }

        # Field display metadata
        field_metadata = {
            "root": {
                "ui_type": "dataset_selector",
                "label": "Dataset",
                "description": "Select dataset or provide custom path"
            },
            "model_flavour": {
                "ui_type": "model_selector",
                "label": "Model Architecture",
                "description": "HuggingFace model or local path"
            },
            "loss_name": {
                "ui_type": "select",
                "label": "Loss Function",
                "description": "Loss function for training"
            },
            "batch_size": {
                "ui_type": "number",
                "label": "Batch Size",
                "description": "Training batch size",
                "min": 1
            },
            "epochs": {
                "ui_type": "number",
                "label": "Epochs",
                "description": "Number of training epochs",
                "min": 1
            },
            "seed": {
                "ui_type": "number",
                "label": "Random Seed",
                "description": "Seed for reproducibility"
            },
            "optimizer": {
                "ui_type": "select",
                "label": "Optimizer",
                "description": "Optimization algorithm"
            },
            "lr": {
                "ui_type": "number",
                "label": "Learning Rate",
                "description": "Initial learning rate",
                "step": "any",
                "min": 0
            },
            "weight_decay": {
                "ui_type": "number",
                "label": "Weight Decay",
                "description": "L2 regularization strength",
                "step": "any",
                "min": 0
            },
            "warmup_ratio": {
                "ui_type": "number",
                "label": "Warmup Ratio",
                "description": "Fraction of training for warmup",
                "step": "any",
                "min": 0,
                "max": 1
            },
            "grad_accum_steps": {
                "ui_type": "number",
                "label": "Grad Accum Steps",
                "description": "Gradient accumulation steps",
                "min": 1
            },
            "max_grad_norm": {
                "ui_type": "number",
                "label": "Max Grad Norm",
                "description": "Maximum gradient norm for clipping",
                "step": "any",
                "min": 0
            },
            "max_datapoints_per_class": {
                "ui_type": "number",
                "label": "Max Samples per Class",
                "description": "Limit data for faster experimentation",
                "min": 1
            },
            "num_workers": {
                "ui_type": "number",
                "label": "Num Workers",
                "description": "Data loading processes",
                "min": 0
            },
            "prefetch_factor": {
                "ui_type": "number",
                "label": "Prefetch Factor",
                "description": "Batches to prefetch per worker",
                "min": 1
            },
            "persistent_workers": {
                "ui_type": "switch",
                "label": "Persistent Workers",
                "description": "Keep workers alive between epochs"
            },
            "load_pretrained": {
                "ui_type": "switch",
                "label": "Load Pretrained Weights",
                "description": "Use pretrained model weights"
            },
            "freeze_backbone": {
                "ui_type": "switch",
                "label": "Freeze Backbone",
                "description": "Train only classifier head"
            },
            "model_suffix": {
                "ui_type": "text",
                "label": "Model Suffix (Optional)",
                "description": "Added to saved model names",
                "placeholder": "e.g., -finetune"
            },
            "monitor_metric": {
                "ui_type": "select",
                "label": "Monitor Metric",
                "description": "Metric to monitor for checkpointing",
                "options": [
                    {"value": "val_acc@1", "label": "Validation Accuracy@1"},
                    {"value": "val_loss", "label": "Validation Loss"}
                ]
            },
            "monitor_mode": {
                "ui_type": "select",
                "label": "Monitor Mode",
                "description": "Optimization direction for monitored metric",
                "options": [
                    {"value": "max", "label": "Maximize (for accuracy)"},
                    {"value": "min", "label": "Minimize (for loss)"}
                ]
            },
            "tb_root": {
                "ui_type": "text",
                "label": "TensorBoard Root",
                "description": "TensorBoard logs directory",
                "placeholder": "runs"
            },
            "ckpt_dir": {
                "ui_type": "text",
                "label": "Checkpoint Directory",
                "description": "Model checkpoints directory",
                "placeholder": "checkpoints"
            },
            "save_per_epoch_checkpoint": {
                "ui_type": "switch",
                "label": "Save Per Epoch Checkpoint",
                "description": "Save model after every epoch (uses more disk space)"
            },
            "gpu_batch_aug": {
                "ui_type": "augmentation_config",
                "label": "GPU Batch Augmentation (Optional)",
                "description": "Kornia-based geometric augmentations applied to training batches on GPU"
            },
            "cpu_color_jitter": {
                "ui_type": "augmentation_config",
                "label": "CPU Color Jitter (Optional)",
                "description": "CPU-side color augmentation applied before normalization"
            }
        }

        return {
            "success": True,
            "schema": schema,
            "defaults": default_values,
            "field_groups": field_groups,
            "field_metadata": field_metadata
        }
    except Exception as e:
        return {"success": False, "error": str(e)}