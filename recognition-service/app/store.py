"""
Persistent vector store for registered asset embeddings, backed by Chroma
(local, embedded — no external service to stand up).

Schema: one Chroma "document" = one REFERENCE PHOTO (not one asset). An asset
can have multiple reference photos (different angles/sides), all sharing the
same `asset_id` in their metadata. This lets recognition compare an incoming
photo against every stored view of every asset and take the best-scoring one,
which is much more robust than forcing a single canonical photo per asset.

  id        -> photo_id (uuid, unless caller supplies one)
  embedding -> 512-d unit vector from app.embedding.embed_image
  metadata  -> asset_id, name, created_at, image_path, extra (json-encoded dict)
"""
from __future__ import annotations

import json
import os
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

import chromadb

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
_DB_DIR = os.path.join(_DATA_DIR, "chroma")
_IMAGES_DIR = os.path.join(_DATA_DIR, "images")
_COLLECTION_NAME = "asset_photos"

os.makedirs(_DB_DIR, exist_ok=True)
os.makedirs(_IMAGES_DIR, exist_ok=True)

_client = chromadb.PersistentClient(path=_DB_DIR)
_collection = _client.get_or_create_collection(
    name=_COLLECTION_NAME,
    metadata={"hnsw:space": "cosine"},
)


@dataclass
class AssetMatch:
    asset_id: str
    name: str
    similarity: float               # best similarity across all of this asset's reference photos
    created_at: float               # when the asset was first registered
    matched_photo_id: str           # which specific reference photo produced the best score
    image_path: Optional[str]       # path of that best-matching reference photo
    photo_count: int
    extra: dict[str, Any] = field(default_factory=dict)


def images_dir() -> str:
    return _IMAGES_DIR


def _photo_to_meta_dict(photo_id: str, meta: dict) -> dict[str, Any]:
    return {
        "photo_id": photo_id,
        "asset_id": meta.get("asset_id", ""),
        "name": meta.get("name", ""),
        "created_at": meta.get("created_at", 0.0),
        "image_path": meta.get("image_path") or None,
        "extra": json.loads(meta.get("extra") or "{}"),
    }


def add_photo(
    embedding,
    asset_id: str,
    name: str,
    image_path: Optional[str] = None,
    extra: Optional[dict[str, Any]] = None,
    photo_id: Optional[str] = None,
) -> str:
    """Add one reference photo (and its embedding) under an asset_id. Creates the
    asset implicitly if this is the first photo for that asset_id."""
    photo_id = photo_id or str(uuid.uuid4())
    metadata = {
        "asset_id": asset_id,
        "name": name,
        "created_at": time.time(),
        "image_path": image_path or "",
        "extra": json.dumps(extra or {}),
    }
    _collection.upsert(
        ids=[photo_id],
        embeddings=[embedding.tolist()],
        metadatas=[metadata],
    )
    return photo_id


def asset_exists(asset_id: str) -> bool:
    result = _collection.get(where={"asset_id": asset_id}, limit=1)
    return len(result["ids"]) > 0


def get_asset_photos(asset_id: str) -> list[dict[str, Any]]:
    result = _collection.get(where={"asset_id": asset_id}, include=["metadatas"])
    photos = [_photo_to_meta_dict(pid, meta) for pid, meta in zip(result["ids"], result["metadatas"])]
    photos.sort(key=lambda p: p["created_at"])
    return photos


def query_similar(embedding, top_k: int = 5) -> list[AssetMatch]:
    """Compare against every stored reference photo, then collapse to one
    best-scoring result per asset (an asset can have several photos hit)."""
    total_photos = _collection.count()
    if total_photos == 0:
        return []
    # Over-fetch raw photo hits since several may belong to the same asset.
    n = min(total_photos, max(top_k * 6, 20))
    result = _collection.query(
        query_embeddings=[embedding.tolist()],
        n_results=n,
    )
    best_per_asset: dict[str, AssetMatch] = {}
    photo_counts: dict[str, int] = {}
    for photo_id, distance, meta in zip(result["ids"][0], result["distances"][0], result["metadatas"][0]):
        asset_id = meta.get("asset_id", "")
        similarity = 1.0 - distance  # Chroma cosine space: distance = 1 - cosine_similarity
        photo_counts[asset_id] = photo_counts.get(asset_id, 0) + 1
        existing = best_per_asset.get(asset_id)
        if existing is None or similarity > existing.similarity:
            best_per_asset[asset_id] = AssetMatch(
                asset_id=asset_id,
                name=meta.get("name", ""),
                similarity=similarity,
                created_at=meta.get("created_at", 0.0),
                matched_photo_id=photo_id,
                image_path=meta.get("image_path") or None,
                photo_count=0,  # filled in below (total photos for the asset, not just hits)
                extra=json.loads(meta.get("extra") or "{}"),
            )
    # photo_count should reflect the asset's total registered photos, not just how
    # many showed up in this particular query's hit list.
    for asset_id, match in best_per_asset.items():
        match.photo_count = len(get_asset_photos(asset_id))

    matches = sorted(best_per_asset.values(), key=lambda m: m.similarity, reverse=True)
    return matches[:top_k]


def _summarize(asset_id: str, photos: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    """Collapse an asset's reference photos (as returned by get_asset_photos,
    already sorted by created_at ascending) into one asset-level summary."""
    if not photos:
        return None
    first = photos[0]   # earliest photo -> registration time + cover image
    last = photos[-1]   # most recent photo -> "last write wins" for name/extra
    return {
        "asset_id": asset_id,
        "name": last["name"],
        "created_at": first["created_at"],
        "cover_photo_id": first["photo_id"],
        "cover_image_path": first["image_path"],
        "extra": last["extra"],
        "photo_count": len(photos),
    }


def list_assets() -> list[dict[str, Any]]:
    result = _collection.get(include=["metadatas"])
    by_asset: dict[str, list[dict[str, Any]]] = {}
    for photo_id, meta in zip(result["ids"], result["metadatas"]):
        asset_id = meta.get("asset_id", "")
        by_asset.setdefault(asset_id, []).append(_photo_to_meta_dict(photo_id, meta))

    out = []
    for asset_id, photos in by_asset.items():
        photos.sort(key=lambda p: p["created_at"])
        out.append(_summarize(asset_id, photos))
    out.sort(key=lambda a: a["created_at"], reverse=True)
    return out


def get_photo(photo_id: str) -> Optional[dict[str, Any]]:
    result = _collection.get(ids=[photo_id], include=["metadatas"])
    if not result["ids"]:
        return None
    return _photo_to_meta_dict(photo_id, result["metadatas"][0])


def get_asset(asset_id: str) -> Optional[dict[str, Any]]:
    """O(photos for this asset), not a full collection scan -- uses the same
    `where` filter as get_asset_photos rather than list_assets()."""
    return _summarize(asset_id, get_asset_photos(asset_id))


def update_asset(asset_id: str, name: Optional[str] = None, extra: Optional[dict[str, Any]] = None) -> bool:
    """Rename an asset and/or replace its custom metadata. Writes the change to
    EVERY reference photo's metadata (not just one), so the asset's name/extra
    stays consistent no matter which photo a future query happens to match
    against -- this is the single place identity edits should go through."""
    if name is None and extra is None:
        return False
    photos = get_asset_photos(asset_id)
    if not photos:
        return False
    ids = [p["photo_id"] for p in photos]
    metadatas = []
    for p in photos:
        metadatas.append(
            {
                "asset_id": asset_id,
                "name": name if name is not None else p["name"],
                "created_at": p["created_at"],
                "image_path": p["image_path"] or "",
                "extra": json.dumps(extra if extra is not None else p["extra"]),
            }
        )
    _collection.update(ids=ids, metadatas=metadatas)
    return True


def delete_asset(asset_id: str) -> bool:
    existing = _collection.get(where={"asset_id": asset_id})
    if not existing["ids"]:
        return False
    _collection.delete(ids=existing["ids"])
    for meta in existing["metadatas"]:
        image_path = meta.get("image_path")
        if image_path and os.path.exists(image_path):
            try:
                os.remove(image_path)
            except OSError:
                pass
    return True


def delete_photo(photo_id: str) -> bool:
    existing = _collection.get(ids=[photo_id])
    if not existing["ids"]:
        return False
    image_path = existing["metadatas"][0].get("image_path") if existing["metadatas"] else None
    _collection.delete(ids=[photo_id])
    if image_path and os.path.exists(image_path):
        try:
            os.remove(image_path)
        except OSError:
            pass
    return True


def count() -> int:
    """Total number of registered reference PHOTOS (not unique assets)."""
    return _collection.count()


def asset_count() -> int:
    """Number of unique assets (each may have 1+ reference photos)."""
    return len(list_assets())
