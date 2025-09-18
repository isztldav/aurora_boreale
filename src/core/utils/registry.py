"""Centralized registry system for training configurations and transformations.

This module provides a unified registry for managing:
- GPU batch augmentations (Kornia-based)
- CPU color jitter presets
- Model architectures
- Loss functions
- Optimizers

The registry ensures synchronization between backend validation and UI options.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from typing import Dict, Any, List, Optional, Type, Callable, Union
from abc import ABC, abstractmethod


@dataclass
class ParameterSpec:
    """Specification for a parameter in a transformation or preset."""
    name: str
    type: str  # 'float', 'int', 'bool', 'str', 'list'
    description: str
    default: Any = None
    min_val: Optional[Union[int, float]] = None
    max_val: Optional[Union[int, float]] = None
    choices: Optional[List[Any]] = None
    required: bool = False


@dataclass
class TransformSpec:
    """Specification for a transformation operation."""
    name: str
    description: str
    parameters: List[ParameterSpec]
    category: str  # 'geometric', 'color', 'noise', etc.
    tags: List[str] = None  # Additional metadata tags


@dataclass
class PresetSpec:
    """Specification for a preset configuration."""
    name: str
    description: str
    config: Dict[str, Any]
    category: str  # 'fundus', 'natural', 'medical', etc.
    tags: List[str] = None


class Registry(ABC):
    """Base class for configuration registries."""

    def __init__(self):
        self._items: Dict[str, Any] = {}

    @abstractmethod
    def register_defaults(self):
        """Register default items for this registry."""
        pass

    def register(self, key: str, item: Any):
        """Register an item with the given key."""
        self._items[key] = item

    def get(self, key: str) -> Any:
        """Get an item by key."""
        return self._items.get(key)

    def list_all(self) -> Dict[str, Any]:
        """Get all registered items."""
        return self._items.copy()

    def to_json(self) -> str:
        """Export registry as JSON for UI consumption."""
        return json.dumps(self.to_dict(), indent=2, default=self._json_serializer)

    def to_dict(self) -> Dict[str, Any]:
        """Export registry as dictionary for UI consumption."""
        serializable = {}
        for key, item in self._items.items():
            serializable[key] = self._serialize_item(item)
        return serializable

    def _serialize_item(self, item: Any) -> Any:
        """Serialize an individual item to be JSON-compatible."""
        if hasattr(item, '__dataclass_fields__'):  # It's a dataclass
            return asdict(item)
        elif hasattr(item, '__dict__'):
            return item.__dict__
        elif isinstance(item, (list, tuple)):
            return [self._serialize_item(x) for x in item]
        elif isinstance(item, dict):
            return {k: self._serialize_item(v) for k, v in item.items()}
        else:
            return item

    @staticmethod
    def _json_serializer(obj: Any) -> Any:
        """Custom JSON serializer for non-standard types."""
        if hasattr(obj, '__dataclass_fields__'):  # It's a dataclass
            return asdict(obj)
        elif hasattr(obj, '__dict__'):
            return obj.__dict__
        else:
            return str(obj)


class GPUTransformRegistry(Registry):
    """Registry for GPU batch augmentations (Kornia-based)."""

    def register_defaults(self):
        """Register default GPU transforms."""
        # No-op transformation (empty/identity)
        self.register('Identity', TransformSpec(
            name='Identity',
            description='Identity transformation - no augmentation applied',
            parameters=[],
            category='none',
            tags=['safe', 'identity', 'no-op']
        ))

        # Geometric transforms (safe, size-preserving)
        self.register('RandomHorizontalFlip', TransformSpec(
            name='RandomHorizontalFlip',
            description='Randomly flip images horizontally',
            parameters=[
                ParameterSpec('p', 'float', 'Probability of applying the flip', 0.5, 0.0, 1.0, required=False)
            ],
            category='geometric',
            tags=['safe', 'common']
        ))

        self.register('RandomVerticalFlip', TransformSpec(
            name='RandomVerticalFlip',
            description='Randomly flip images vertically',
            parameters=[
                ParameterSpec('p', 'float', 'Probability of applying the flip', 0.5, 0.0, 1.0, required=False)
            ],
            category='geometric',
            tags=['safe']
        ))

        self.register('RandomRotation', TransformSpec(
            name='RandomRotation',
            description='Randomly rotate images by a given angle range',
            parameters=[
                ParameterSpec('degrees', 'float', 'Rotation range in degrees', 10.0, -180.0, 180.0, required=True),
                ParameterSpec('p', 'float', 'Probability of applying rotation', 1.0, 0.0, 1.0, required=False)
            ],
            category='geometric',
            tags=['safe', 'common']
        ))

        self.register('RandomAffine', TransformSpec(
            name='RandomAffine',
            description='Apply random affine transformation',
            parameters=[
                ParameterSpec('degrees', 'float', 'Rotation range in degrees', 0.0, -180.0, 180.0, required=False),
                ParameterSpec('translate', 'list', 'Translation as (tx, ty) fraction of image size', None, required=False),
                ParameterSpec('scale', 'list', 'Scale range as (min_scale, max_scale)', None, required=False),
                ParameterSpec('shear', 'float', 'Shear range in degrees', 0.0, -180.0, 180.0, required=False),
                ParameterSpec('align_corners', 'bool', 'Align corners for interpolation', False, required=False)
            ],
            category='geometric',
            tags=['safe', 'advanced']
        ))

        self.register('RandomPerspective', TransformSpec(
            name='RandomPerspective',
            description='Apply random perspective transformation',
            parameters=[
                ParameterSpec('distortion_scale', 'float', 'Perspective distortion scale', 0.1, 0.0, 1.0, required=False),
                ParameterSpec('p', 'float', 'Probability of applying transformation', 0.5, 0.0, 1.0, required=False)
            ],
            category='geometric',
            tags=['safe', 'advanced']
        ))


class GPUPresetRegistry(Registry):
    """Registry for GPU augmentation presets."""

    def register_defaults(self):
        """Register default GPU augmentation presets."""
        self.register('none', PresetSpec(
            name='none',
            description='No GPU augmentation - identity transformation only',
            config={
                'ops': [
                    {'name': 'Identity'}
                ]
            },
            category='none',
            tags=['identity', 'no-augmentation', 'baseline']
        ))

        self.register('cfp_dr_v1', PresetSpec(
            name='cfp_dr_v1',
            description='Color fundus photography preset for diabetic retinopathy detection',
            config={
                'ops': [
                    {'name': 'RandomHorizontalFlip', 'p': 0.5},
                    {
                        'name': 'RandomAffine',
                        'degrees': 12,
                        'translate': [0.04, 0.04],
                        'scale': [0.95, 1.05],
                        'shear': 5,
                        'align_corners': False
                    }
                ]
            },
            category='medical',
            tags=['fundus', 'retina', 'geometric-only']
        ))

        self.register('fundus_geometric_v1', PresetSpec(
            name='fundus_geometric_v1',
            description='Geometric-only augmentation for fundus images',
            config={
                'ops': [
                    {'name': 'RandomHorizontalFlip', 'p': 0.5},
                    {
                        'name': 'RandomAffine',
                        'degrees': 12,
                        'translate': [0.04, 0.04],
                        'scale': [0.95, 1.05],
                        'shear': 5,
                        'align_corners': False
                    }
                ]
            },
            category='medical',
            tags=['fundus', 'geometric-only']
        ))

        self.register('natural_light', PresetSpec(
            name='natural_light',
            description='Light geometric augmentation for natural images',
            config={
                'ops': [
                    {'name': 'RandomHorizontalFlip', 'p': 0.5},
                    {'name': 'RandomRotation', 'degrees': 5, 'p': 0.3}
                ]
            },
            category='natural',
            tags=['light', 'geometric-only']
        ))


class CPUColorJitterRegistry(Registry):
    """Registry for CPU color jitter presets."""

    def register_defaults(self):
        """Register default CPU color jitter presets."""
        self.register('none', PresetSpec(
            name='none',
            description='No color jitter - no color augmentation applied',
            config={
                'params': {
                    'brightness': 0.0,
                    'contrast': 0.0,
                    'saturation': 0.0,
                    'hue': 0.0
                },
                'p': 0.0
            },
            category='none',
            tags=['identity', 'no-augmentation', 'baseline']
        ))

        self.register('cfp_color_v1', PresetSpec(
            name='cfp_color_v1',
            description='Mild color jitter suitable for color fundus photography',
            config={
                'params': {
                    'brightness': 0.15,
                    'contrast': 0.15,
                    'saturation': 0.10,
                    'hue': 0.02
                },
                'p': 0.8
            },
            category='medical',
            tags=['fundus', 'color', 'mild']
        ))

        self.register('natural_color_v1', PresetSpec(
            name='natural_color_v1',
            description='Standard color jitter for natural images',
            config={
                'params': {
                    'brightness': 0.2,
                    'contrast': 0.2,
                    'saturation': 0.2,
                    'hue': 0.1
                },
                'p': 0.8
            },
            category='natural',
            tags=['color', 'standard']
        ))

        self.register('strong_color', PresetSpec(
            name='strong_color',
            description='Strong color augmentation for robust training',
            config={
                'params': {
                    'brightness': 0.4,
                    'contrast': 0.4,
                    'saturation': 0.3,
                    'hue': 0.15
                },
                'p': 0.9
            },
            category='general',
            tags=['color', 'strong']
        ))


class ModelRegistry(Registry):
    """Registry for supported model architectures."""

    def register_defaults(self):
        """Register default model architectures."""
        # Vision Transformers
        self.register('google/vit-base-patch16-224', {
            'name': 'ViT-Base (16x16 patches)',
            'description': 'Vision Transformer with 86M parameters, 224px input',
            'category': 'transformer',
            'input_size': 224,
            'tags': ['transformer', 'popular', 'pretrained']
        })

        self.register('google/vit-large-patch16-224', {
            'name': 'ViT-Large (16x16 patches)',
            'description': 'Vision Transformer with 307M parameters, 224px input',
            'category': 'transformer',
            'input_size': 224,
            'tags': ['transformer', 'large', 'pretrained']
        })

        # ConvNeXt models
        self.register('facebook/convnext-base-224', {
            'name': 'ConvNeXt-Base',
            'description': 'ConvNeXt model with 89M parameters, modern CNN architecture',
            'category': 'cnn',
            'input_size': 224,
            'tags': ['cnn', 'modern', 'pretrained']
        })

        # EfficientNet
        self.register('google/efficientnet-b0', {
            'name': 'EfficientNet-B0',
            'description': 'Efficient CNN with 5.3M parameters, good for mobile',
            'category': 'cnn',
            'input_size': 224,
            'tags': ['cnn', 'efficient', 'mobile', 'pretrained']
        })


class LossRegistry(Registry):
    """Registry for supported loss functions."""

    def register_defaults(self):
        """Register default loss functions from the losses module."""
        # Import here to avoid circular imports
        from .losses import get_supported_losses

        supported_losses = get_supported_losses()
        for loss_name, loss_info in supported_losses.items():
            self.register(loss_name, loss_info)


class OptimizerRegistry(Registry):
    """Registry for supported optimizers."""

    def register_defaults(self):
        """Register default optimizers from the optimizers module."""
        # Import here to avoid circular imports
        from .optimizers import get_supported_optimizers

        supported_optimizers = get_supported_optimizers()
        for optimizer_name, optimizer_info in supported_optimizers.items():
            self.register(optimizer_name, optimizer_info)


# Global registry instances
gpu_transforms = GPUTransformRegistry()
gpu_presets = GPUPresetRegistry()
cpu_color_presets = CPUColorJitterRegistry()
models = ModelRegistry()
losses = LossRegistry()
optimizers = OptimizerRegistry()


def initialize_registries():
    """Initialize all registries with default values."""
    gpu_transforms.register_defaults()
    gpu_presets.register_defaults()
    cpu_color_presets.register_defaults()
    models.register_defaults()
    losses.register_defaults()
    optimizers.register_defaults()


def get_registry_export() -> Dict[str, str]:
    """Export all registries as dictionaries for UI consumption."""
    return {
        'gpu_transforms': gpu_transforms.to_json(),
        'gpu_presets': gpu_presets.to_json(),
        'cpu_color_presets': cpu_color_presets.to_json(),
        'models': models.to_json(),
        'losses': losses.to_json(),
        'optimizers': optimizers.to_json()
    }


def validate_gpu_augmentation_spec(spec: Dict[str, Any]) -> tuple[bool, List[str]]:
    """Validate a GPU augmentation specification against the registry.

    Returns:
        (is_valid, error_messages)
    """
    errors = []

    if not isinstance(spec, dict):
        return False, ['Specification must be a dictionary']

    # Check if it's a preset
    if 'preset' in spec:
        preset_name = spec['preset']
        if not gpu_presets.get(preset_name):
            errors.append(f"Unknown preset: {preset_name}")
            return False, errors
        return True, []

    # Check if it's a custom ops list
    if 'ops' not in spec:
        errors.append("Specification must contain either 'preset' or 'ops'")
        return False, errors

    ops = spec['ops']
    if not isinstance(ops, list):
        errors.append("'ops' must be a list")
        return False, errors

    for i, op in enumerate(ops):
        if not isinstance(op, dict):
            errors.append(f"Operation {i} must be a dictionary")
            continue

        if 'name' not in op:
            errors.append(f"Operation {i} missing 'name' field")
            continue

        op_name = op['name']
        transform_spec = gpu_transforms.get(op_name)
        if not transform_spec:
            errors.append(f"Unknown transformation: {op_name}")
            continue

        # Validate parameters
        for param_name, param_value in op.items():
            if param_name == 'name':
                continue

            # Find parameter spec
            param_spec = None
            for p in transform_spec.parameters:
                if p.name == param_name:
                    param_spec = p
                    break

            if not param_spec:
                errors.append(f"Unknown parameter '{param_name}' for {op_name}")
                continue

            # Validate parameter value
            if param_spec.type == 'float' and not isinstance(param_value, (int, float)):
                errors.append(f"Parameter '{param_name}' for {op_name} must be a number")
            elif param_spec.type == 'bool' and not isinstance(param_value, bool):
                errors.append(f"Parameter '{param_name}' for {op_name} must be boolean")
            elif param_spec.type == 'list' and not isinstance(param_value, list):
                errors.append(f"Parameter '{param_name}' for {op_name} must be a list")

    return len(errors) == 0, errors


def validate_cpu_color_jitter_spec(spec: Dict[str, Any]) -> tuple[bool, List[str]]:
    """Validate a CPU color jitter specification against the registry.

    Returns:
        (is_valid, error_messages)
    """
    errors = []

    if not isinstance(spec, dict):
        return False, ['Specification must be a dictionary']

    # Check if it's a preset
    if 'preset' in spec:
        preset_name = spec['preset']
        if not cpu_color_presets.get(preset_name):
            errors.append(f"Unknown color jitter preset: {preset_name}")
            return False, errors
        return True, []

    # Check if it's custom parameters
    if 'params' not in spec:
        errors.append("Specification must contain either 'preset' or 'params'")
        return False, errors

    params = spec['params']
    if not isinstance(params, dict):
        errors.append("'params' must be a dictionary")
        return False, errors

    # Validate known color jitter parameters
    valid_params = {'brightness', 'contrast', 'saturation', 'hue'}
    for param_name, param_value in params.items():
        if param_name not in valid_params:
            errors.append(f"Unknown color jitter parameter: {param_name}")
            continue

        if not isinstance(param_value, (int, float)):
            errors.append(f"Color jitter parameter '{param_name}' must be a number")
            continue

        if param_value < 0:
            errors.append(f"Color jitter parameter '{param_name}' must be non-negative")

    # Validate probability if present
    if 'p' in spec:
        p = spec['p']
        if not isinstance(p, (int, float)) or not 0 <= p <= 1:
            errors.append("Probability 'p' must be a number between 0 and 1")

    return len(errors) == 0, errors


# Initialize registries on module import
initialize_registries()
