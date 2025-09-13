from transformers import AutoModelForImageClassification, AutoConfig

def _freeze_backbone(model):
    """
    Freezes all parameters in the model except the classification head.
    Works for models loaded with AutoModelForImageClassification.
    """
    # Freeze all parameters
    for param in model.parameters():
        param.requires_grad = False

    # Unfreeze classification head
    if hasattr(model, "classifier"):  # most ViT/DeiT, ConvNeXt, etc.
        for param in model.classifier.parameters():
            param.requires_grad = True
    elif hasattr(model, "fc"):  # some ResNet models
        for param in model.fc.parameters():
            param.requires_grad = True
    else:
        raise ValueError("Could not find classification head (classifier/fc) in model.")

    return model


def build_model(model_flavour: str, num_labels: int, id2label: dict, label2id: dict, load_pretrained: bool, freeze_backbone: bool = False):
    """
    Build an image classification model using Hugging Face Transformers.

    This function constructs an `AutoModelForImageClassification` either by:
      - Loading a pretrained model (with optional adaptation to new label mappings).
      - Initializing a new model from configuration if pretrained weights are not used.

    Args:
        model_flavour (str): 
            The model checkpoint name or path (e.g., "google/vit-base-patch16-224").
        num_labels (int): 
            The number of output labels for the classification task.
        id2label (dict): 
            A dictionary mapping integer class IDs to label names.
        label2id (dict): 
            A dictionary mapping label names to integer class IDs.
        load_pretrained (bool): 
            If True, load pretrained weights for the model. 
            If False, initialize the model from scratch using the configuration.
        freeze_backbone (bool, optional): 
            Intended to control whether the feature extractor backbone should be frozen during training.
            Defaults to False.

    Returns:
        AutoModelForImageClassification:
            A Hugging Face image classification model, ready for training or inference.
    """

    if load_pretrained:
        model = AutoModelForImageClassification.from_pretrained(
            model_flavour,
            num_labels=num_labels,
            id2label=id2label,
            label2id=label2id,
            ignore_mismatched_sizes=True
        )
    
    else:
        cfg = AutoConfig.from_pretrained(
            model_flavour,
            num_labels=num_labels,
            id2label=id2label,
            label2id=label2id,
        )
        model = AutoModelForImageClassification.from_config(cfg)

    if freeze_backbone:
        return _freeze_backbone(model)
    
    return model
