"""
Image -> vector embedding using OpenCLIP (ViT-B-32, OpenAI weights).

Loaded once per process (model load is the slow part, ~1-3s once weights
are cached locally). embed_image() returns an L2-normalized float32 vector
so that cosine similarity == dot product.
"""
from __future__ import annotations

import io
import os
import threading

import numpy as np
import open_clip
import torch
from PIL import Image

_MODEL_NAME = "ViT-B-32-quickgelu"
_PRETRAINED = "openai"
_CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".cache")

EMBEDDING_DIM = 512  # ViT-B-32 output width

_lock = threading.Lock()
_model = None
_preprocess = None
_device = "cuda" if torch.cuda.is_available() else "cpu"


def _load():
    global _model, _preprocess
    if _model is not None:
        return
    with _lock:
        if _model is not None:
            return
        model, _, preprocess = open_clip.create_model_and_transforms(
            _MODEL_NAME, pretrained=_PRETRAINED, cache_dir=_CACHE_DIR
        )
        model.eval().to(_device)
        _model = model
        _preprocess = preprocess


def warm_up() -> None:
    """Call at startup so the first API request isn't the one paying model-load cost."""
    _load()
    with torch.no_grad():
        dummy = Image.new("RGB", (224, 224), color=(128, 128, 128))
        embed_image(dummy)


def load_image_bytes(data: bytes) -> Image.Image:
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception as e:
        raise ValueError(f"Could not read image data: {e}") from e
    return img.convert("RGB")


def embed_image(image: Image.Image) -> np.ndarray:
    """Return a unit-length float32 embedding vector for a PIL image."""
    _load()
    tensor = _preprocess(image).unsqueeze(0).to(_device)
    with torch.no_grad():
        features = _model.encode_image(tensor)
        features = features / features.norm(dim=-1, keepdim=True)
    return features.squeeze(0).cpu().numpy().astype("float32")


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Both vectors are assumed unit-length already (as returned by embed_image)."""
    return float(np.dot(a, b))
