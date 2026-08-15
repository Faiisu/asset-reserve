"""
Class-agnostic object localization for "multiple assets in one photo".

Two proposal sources, merged:

1. COCO-pretrained Faster R-CNN (MobileNetV3 backbone) -- used purely as a box
   PROPOSAL generator: every box above a score threshold is kept regardless of
   its predicted COCO label. Good for cluttered/complex scenes, but COCO's
   training photos are overwhelmingly eye-level, everyday scenes -- it can
   completely miss objects in a steep top-down/overhead shot (the natural
   angle for "photograph what's on the table"), no matter how low the score
   threshold goes. Verified: a hairbrush and glasses in a real top-down test
   photo got zero candidate boxes from this model at any threshold down to 0.05.

2. Contour-based segmentation (classical CV, no model): Canny edges + dilation
   + external contours, filtered to plausible object-sized blobs. This has no
   category bias and doesn't care about viewing angle, so it reliably finds
   objects a category detector misses -- at the cost of also proposing some
   noise (floor seams, rug edges, shadows). That noise is harmless downstream:
   a crop of empty floor doesn't strongly match any registered asset, so it's
   naturally filtered out by the similarity threshold rather than needing to
   be filtered here. Best suited to the fairly plain/uniform backgrounds
   (table, floor) this app's photos are taken against -- expect more noise
   boxes on genuinely cluttered scenes.

Boxes from the two sources are merged with simple IoU dedup so the same object
doesn't get embedded and matched twice. Identity always comes from the CLIP
embedding + vector match done downstream on each crop, never from either
source's label/score -- those are kept around only as debug info.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass

import cv2
import numpy as np
import torch
from PIL import Image
from torchvision.models.detection import (
    FasterRCNN_MobileNet_V3_Large_FPN_Weights,
    fasterrcnn_mobilenet_v3_large_fpn,
)

_lock = threading.Lock()
_model = None
_weights = None
_device = "cuda" if torch.cuda.is_available() else "cpu"

DEFAULT_SCORE_THRESHOLD = 0.5
DEFAULT_MAX_OBJECTS = 10
CONTOUR_LABEL = "uncategorized region"  # no COCO class guess available for these


@dataclass
class Detection:
    box: tuple[int, int, int, int]  # x1, y1, x2, y2 in original image pixel coords
    score: float
    label: str  # COCO category, or CONTOUR_LABEL -- informational only


def _load():
    global _model, _weights
    if _model is not None:
        return
    with _lock:
        if _model is not None:
            return
        weights = FasterRCNN_MobileNet_V3_Large_FPN_Weights.DEFAULT
        model = fasterrcnn_mobilenet_v3_large_fpn(weights=weights, box_score_thresh=0.3)
        model.eval().to(_device)
        _model = model
        _weights = weights


def warm_up() -> None:
    _load()
    dummy = Image.new("RGB", (320, 320), color=(128, 128, 128))
    detect_objects(dummy)


def _detect_coco(image: Image.Image, score_threshold: float, max_objects: int) -> list[Detection]:
    _load()
    tensor = _weights.transforms()(image).to(_device)
    with torch.no_grad():
        output = _model([tensor])[0]

    categories = _weights.meta["categories"]
    detections: list[Detection] = []
    for box, score, label_idx in zip(output["boxes"], output["scores"], output["labels"]):
        score = float(score)
        if score < score_threshold:
            continue
        x1, y1, x2, y2 = [int(v) for v in box.tolist()]
        detections.append(
            Detection(
                box=(x1, y1, x2, y2),
                score=score,
                label=categories[int(label_idx)] if int(label_idx) < len(categories) else "object",
            )
        )
    detections.sort(key=lambda d: d.score, reverse=True)
    return detections[:max_objects]


def _detect_contours(
    image: Image.Image,
    min_area_frac: float = 0.002,
    max_area_frac: float = 0.5,
    max_objects: int = 15,
) -> list[Detection]:
    arr = np.array(image.convert("RGB"))
    gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
    blur = cv2.GaussianBlur(gray, (7, 7), 0)
    edges = cv2.Canny(blur, 30, 90)
    edges = cv2.dilate(edges, np.ones((9, 9), np.uint8), iterations=2)
    edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))

    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    h, w = gray.shape
    frame_area = w * h
    detections: list[Detection] = []
    for c in contours:
        x, y, cw, ch = cv2.boundingRect(c)
        area = cw * ch
        if area < min_area_frac * frame_area or area > max_area_frac * frame_area:
            continue
        # No real confidence signal here (no classifier involved) -- use
        # relative size as a stable, deterministic ordering so the largest
        # (most likely to be a real object, least likely to be a stray edge)
        # blobs are kept first when max_objects trims the list.
        detections.append(Detection(box=(x, y, x + cw, y + ch), score=area / frame_area, label=CONTOUR_LABEL))

    detections.sort(key=lambda d: d.score, reverse=True)
    return detections[:max_objects]


def _iou(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    area_a = (ax2 - ax1) * (ay2 - ay1)
    area_b = (bx2 - bx1) * (by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def detect_objects(
    image: Image.Image,
    score_threshold: float = DEFAULT_SCORE_THRESHOLD,
    max_objects: int = DEFAULT_MAX_OBJECTS,
) -> list[Detection]:
    """Hybrid box proposals: COCO detector boxes first, then contour-based
    boxes added for anything the detector didn't already cover (IoU < 0.5
    against every COCO box kept so far). Capped at max_objects total."""
    coco = _detect_coco(image, score_threshold, max_objects)
    contour = _detect_contours(image, max_objects=max_objects)

    merged = list(coco)
    for cand in contour:
        if len(merged) >= max_objects:
            break
        if any(_iou(cand.box, kept.box) > 0.5 for kept in merged):
            continue  # a COCO box (or an earlier, larger contour box) already covers this region
        merged.append(cand)

    return merged[:max_objects]


def crop(image: Image.Image, box: tuple[int, int, int, int], padding_frac: float = 0.06) -> Image.Image:
    """Crop a detected box out of the image with a little padding, clamped to bounds."""
    w, h = image.size
    x1, y1, x2, y2 = box
    pad_x = int((x2 - x1) * padding_frac)
    pad_y = int((y2 - y1) * padding_frac)
    x1 = max(0, x1 - pad_x)
    y1 = max(0, y1 - pad_y)
    x2 = min(w, x2 + pad_x)
    y2 = min(h, y2 + pad_y)
    return image.crop((x1, y1, x2, y2))
