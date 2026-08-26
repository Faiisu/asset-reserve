"""
Asset Recognition API
======================
Core endpoints, meant to be called by a main application's backend:

  POST   /api/assets                    -- register a NEW asset from its first photo.
  POST   /api/assets/{asset_id}/photos  -- add another reference photo (different angle/
                                            side) to an existing asset. Optional but
                                            recommended for assets that look different
                                            from different sides.
  PATCH  /api/assets/{asset_id}         -- rename an asset and/or replace its custom
                                            metadata (no photo involved).

  POST /api/recognize        -- single dominant asset in the photo (fast path).
  POST /api/recognize/multi  -- photo may contain several assets; detects candidate
                                 objects first, then recognizes each one independently.

Everything else (GET/DELETE /api/assets...) is bookkeeping used by the demo UI
and useful for the real app's admin tooling later.

Run: uvicorn app.main:app --reload --port 8000
Docs: http://localhost:8000/docs
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app import detection, embedding, store
from app.schemas import (
    AssetOut,
    AssetUpdate,
    BoundingBox,
    DetectedItem,
    MatchOut,
    MultiRecognizeResponse,
    PhotoOut,
    RecognizeResponse,
    RegisterResponse,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("recognition_api")

DEFAULT_MATCH_THRESHOLD = float(os.environ.get("MATCH_THRESHOLD", "0.85"))
DEFAULT_MULTI_TOP_K = 3

app = FastAPI(
    title="Asset Recognition API",
    description="Upload a photo of an asset to register it; upload another photo later to recognize it.",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    logger.info("Warming up models (embedding + detector)...")
    embedding.warm_up()
    detection.warm_up()
    logger.info("Ready. %d asset(s) / %d photo(s) currently registered.", store.asset_count(), store.count())


# --- helpers ---------------------------------------------------------------

def _photo_image_url(photo_id: Optional[str]) -> Optional[str]:
    if not photo_id:
        return None
    return f"/api/photos/{photo_id}/image"


def _read_upload(file: UploadFile) -> bytes:
    data = file.file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    return data


def _save_image(asset_id: str, photo_id: str, filename: Optional[str], data: bytes) -> str:
    ext = os.path.splitext(filename or "")[1] or ".jpg"
    path = os.path.join(store.images_dir(), f"{asset_id}__{photo_id}{ext}")
    with open(path, "wb") as f:
        f.write(data)
    return path


def _parse_extra(raw: Optional[str]) -> dict:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"'extra' must be a JSON object string: {e}") from e
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="'extra' must be a JSON object, e.g. '{\"location\": \"HQ\"}'")
    return parsed


def _asset_to_out(a: dict) -> AssetOut:
    return AssetOut(
        asset_id=a["asset_id"],
        name=a["name"],
        created_at=a["created_at"],
        photo_count=a["photo_count"],
        image_url=_photo_image_url(a.get("cover_photo_id")),
        extra=a["extra"],
    )


def _match_to_out(m: store.AssetMatch) -> MatchOut:
    return MatchOut(
        asset_id=m.asset_id,
        name=m.name,
        similarity=m.similarity,
        created_at=m.created_at,
        photo_count=m.photo_count,
        image_url=_photo_image_url(m.matched_photo_id),
        extra=m.extra,
    )


# --- health ------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok", "assets_registered": store.asset_count(), "photos_registered": store.count()}


# --- registration --------------------------------------------------------

@app.post("/api/assets", response_model=RegisterResponse)
def register_asset(
    file: UploadFile = File(..., description="Photo of the asset"),
    name: str = Form(..., description="Human-readable asset name, e.g. 'Dell Latitude Laptop #12'"),
    asset_id: Optional[str] = Form(None, description="Optional caller-supplied ID (e.g. your app's asset PK)"),
    extra: Optional[str] = Form(None, description="Optional JSON object string of custom metadata, e.g. '{\"category\": \"tools\", \"location\": \"HQ\"}'"),
):
    """Register a brand-new asset from its first photo. To add more reference
    photos (different angles) to an asset that already exists, use
    POST /api/assets/{asset_id}/photos instead. To rename or edit metadata
    later without uploading a photo, use PATCH /api/assets/{asset_id}."""
    final_id = asset_id or str(uuid.uuid4())
    if store.asset_exists(final_id):
        raise HTTPException(
            status_code=409,
            detail=f"asset_id '{final_id}' already exists. Use POST /api/assets/{final_id}/photos to add another reference photo to it.",
        )
    extra_dict = _parse_extra(extra)

    data = _read_upload(file)
    try:
        image = embedding.load_image_bytes(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    vector = embedding.embed_image(image)
    photo_id = str(uuid.uuid4())
    image_path = _save_image(final_id, photo_id, file.filename, data)
    store.add_photo(embedding=vector, asset_id=final_id, name=name, image_path=image_path, photo_id=photo_id, extra=extra_dict)

    asset = store.get_asset(final_id)
    return RegisterResponse(
        asset_id=final_id,
        photo_id=photo_id,
        name=asset["name"],
        created_at=asset["created_at"],
        photo_count=asset["photo_count"],
        image_url=_photo_image_url(photo_id),
        embedding_dim=embedding.EMBEDDING_DIM,
        extra=asset["extra"],
    )


@app.post("/api/assets/{asset_id}/photos", response_model=RegisterResponse)
def add_asset_photo(
    asset_id: str,
    file: UploadFile = File(..., description="Another reference photo of the same asset (different angle/side)"),
):
    """Add another reference photo to an existing asset. Recognition compares an
    incoming photo against every stored view of every asset and takes the best
    score, so adding a few angles here materially improves match reliability
    for assets that look different from different sides.

    This endpoint never changes the asset's name or metadata -- it always
    inherits whatever is currently stored, so adding a photo can't accidentally
    rename the asset. Use PATCH /api/assets/{asset_id} to rename/edit metadata."""
    existing = store.get_asset(asset_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Asset not found. Register it first with POST /api/assets.")

    data = _read_upload(file)
    try:
        image = embedding.load_image_bytes(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    vector = embedding.embed_image(image)
    photo_id = str(uuid.uuid4())
    image_path = _save_image(asset_id, photo_id, file.filename, data)
    store.add_photo(
        embedding=vector,
        asset_id=asset_id,
        name=existing["name"],
        image_path=image_path,
        photo_id=photo_id,
        extra=existing["extra"],
    )

    asset = store.get_asset(asset_id)
    return RegisterResponse(
        asset_id=asset_id,
        photo_id=photo_id,
        name=asset["name"],
        created_at=asset["created_at"],
        photo_count=asset["photo_count"],
        image_url=_photo_image_url(photo_id),
        embedding_dim=embedding.EMBEDDING_DIM,
        extra=asset["extra"],
    )


@app.patch("/api/assets/{asset_id}", response_model=AssetOut)
def update_asset(asset_id: str, update: AssetUpdate):
    """Rename an asset and/or replace its custom metadata -- no photo required.
    This is the only endpoint that should change an asset's name."""
    if update.name is None and update.extra is None:
        raise HTTPException(status_code=400, detail="Provide at least one of: name, extra")
    if not store.asset_exists(asset_id):
        raise HTTPException(status_code=404, detail="Asset not found")
    store.update_asset(asset_id, name=update.name, extra=update.extra)
    return _asset_to_out(store.get_asset(asset_id))


# --- recognition -----------------------------------------------------------

@app.post("/api/recognize", response_model=RecognizeResponse)
def recognize_asset(
    file: UploadFile = File(..., description="Photo of the asset being returned"),
    threshold: float = Form(DEFAULT_MATCH_THRESHOLD, description="Minimum cosine similarity to count as a match"),
    top_k: int = Form(5, description="How many nearest candidate assets to return"),
):
    """Compare an uploaded photo (assumed to show ONE dominant asset) against all
    registered assets and return the closest match(es). For photos that may
    contain several assets at once, use /api/recognize/multi instead."""
    data = _read_upload(file)
    try:
        image = embedding.load_image_bytes(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    vector = embedding.embed_image(image)
    matches = store.query_similar(vector, top_k=top_k)

    top_matches = [_match_to_out(m) for m in matches]
    best = top_matches[0] if top_matches else None
    is_match = bool(best and best.similarity >= threshold)

    return RecognizeResponse(is_match=is_match, threshold=threshold, best_match=best, top_matches=top_matches)


@app.post("/api/recognize/multi", response_model=MultiRecognizeResponse)
def recognize_multi(
    file: UploadFile = File(..., description="Photo that may contain multiple assets"),
    threshold: float = Form(DEFAULT_MATCH_THRESHOLD, description="Minimum cosine similarity to count as a match"),
    top_k: int = Form(DEFAULT_MULTI_TOP_K, description="How many nearest candidate assets to return per detected object"),
    min_box_score: float = Form(detection.DEFAULT_SCORE_THRESHOLD, description="Minimum detector confidence to keep a candidate box"),
    max_objects: int = Form(detection.DEFAULT_MAX_OBJECTS, description="Cap on how many objects to consider in one photo"),
):
    """Detect candidate objects in the photo (COCO detector + contour-based
    segmentation, see app/detection.py), then run recognition independently on
    each one. Falls back to treating the whole photo as a single object if
    neither source finds anything -- see README for detector caveats."""
    data = _read_upload(file)
    try:
        image = embedding.load_image_bytes(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    detections = detection.detect_objects(image, score_threshold=min_box_score, max_objects=max_objects)
    used_fallback = False
    if not detections:
        used_fallback = True
        w, h = image.size
        detections = [detection.Detection(box=(0, 0, w, h), score=1.0, label="whole_image")]

    results: list[DetectedItem] = []
    for det in detections:
        crop_img = image if used_fallback else detection.crop(image, det.box)
        vector = embedding.embed_image(crop_img)
        matches = store.query_similar(vector, top_k=top_k)
        top_matches = [_match_to_out(m) for m in matches]
        best = top_matches[0] if top_matches else None
        is_match = bool(best and best.similarity >= threshold)

        # Contour-sourced boxes have no semantic signal of their own (unlike a
        # COCO box, which means "the detector thinks this might be an object"
        # even when unmatched) -- if one doesn't match anything, it was just
        # noise (a floor seam, a shadow, a rug edge), so drop it rather than
        # clutter the response/UI with candidates nobody asked about.
        if det.label == detection.CONTOUR_LABEL and not is_match and not used_fallback:
            continue

        x1, y1, x2, y2 = det.box
        results.append(
            DetectedItem(
                box=BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2),
                detector_label=det.label,
                detector_score=det.score,
                is_match=is_match,
                best_match=best,
                top_matches=top_matches,
            )
        )

    return MultiRecognizeResponse(
        threshold=threshold,
        object_count=len(results),
        used_fallback_whole_image=used_fallback,
        detections=results,
    )


# --- bookkeeping -------------------------------------------------------

@app.get("/api/assets", response_model=list[AssetOut])
def list_assets():
    return [_asset_to_out(a) for a in store.list_assets()]


@app.get("/api/assets/{asset_id}", response_model=AssetOut)
def get_asset(asset_id: str):
    a = store.get_asset(asset_id)
    if a is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    return _asset_to_out(a)


@app.get("/api/assets/{asset_id}/photos", response_model=list[PhotoOut])
def get_asset_photos(asset_id: str):
    if not store.asset_exists(asset_id):
        raise HTTPException(status_code=404, detail="Asset not found")
    photos = store.get_asset_photos(asset_id)
    return [PhotoOut(photo_id=p["photo_id"], created_at=p["created_at"], image_url=_photo_image_url(p["photo_id"])) for p in photos]


@app.get("/api/assets/{asset_id}/image")
def get_asset_cover_image(asset_id: str):
    a = store.get_asset(asset_id)
    if a is None or not a.get("cover_image_path") or not os.path.exists(a["cover_image_path"]):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(a["cover_image_path"])


@app.get("/api/photos/{photo_id}/image")
def get_photo_image(photo_id: str):
    photo = store.get_photo(photo_id)
    if photo is None or not photo.get("image_path") or not os.path.exists(photo["image_path"]):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(photo["image_path"])


@app.delete("/api/assets/{asset_id}")
def delete_asset(asset_id: str):
    ok = store.delete_asset(asset_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"deleted_asset": asset_id}


@app.delete("/api/assets/{asset_id}/photos/{photo_id}")
def delete_asset_photo(asset_id: str, photo_id: str):
    photos = store.get_asset_photos(asset_id)
    if not any(p["photo_id"] == photo_id for p in photos):
        raise HTTPException(status_code=404, detail="Photo not found for this asset")
    if len(photos) == 1:
        raise HTTPException(
            status_code=400,
            detail="This is the asset's only reference photo. Use DELETE /api/assets/{asset_id} to remove the whole asset instead.",
        )
    store.delete_photo(photo_id)
    return {"deleted_photo": photo_id, "asset_id": asset_id}


# --- Demo UI (static files only; talks to the API above like any other client) ---
_demo_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "demo")
if os.path.isdir(_demo_dir):
    app.mount("/demo", StaticFiles(directory=_demo_dir, html=True), name="demo")
