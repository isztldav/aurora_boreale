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

from common.registry import (
    get_registry_export,
    validate_gpu_augmentation_spec,
    validate_cpu_color_jitter_spec
)

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