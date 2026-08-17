from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class AssetOut(BaseModel):
    asset_id: str
    name: str
    created_at: float
    photo_count: int
    image_url: Optional[str] = None
    extra: dict[str, Any] = Field(default_factory=dict)
    disabled: bool = Field(
        False,
        description="True if this asset is hidden from recognition matching (extra.disabled, surfaced here for convenience). Photos/embeddings are untouched either way.",
    )


class PhotoOut(BaseModel):
    photo_id: str
    created_at: float
    image_url: str


class RegisterResponse(BaseModel):
    asset_id: str
    photo_id: str
    name: str
    created_at: float
    photo_count: int
    image_url: Optional[str] = None
    embedding_dim: int
    extra: dict[str, Any] = Field(default_factory=dict)


class AssetUpdate(BaseModel):
    name: Optional[str] = Field(None, description="New name for the asset")
    extra: Optional[dict[str, Any]] = Field(None, description="Replaces the asset's custom metadata entirely (not merged)")


class SetDisabledRequest(BaseModel):
    disabled: bool = Field(
        ...,
        description="True to hide this asset from recognition matching; false to make it recognizable again. Reference photos and embeddings are preserved either way, so re-enabling is instant with no re-registration needed.",
    )


class MatchOut(BaseModel):
    asset_id: str
    name: str
    similarity: float = Field(..., description="Best cosine similarity across the asset's reference photos, in [-1, 1]")
    created_at: float
    photo_count: int
    image_url: Optional[str] = Field(None, description="The specific reference photo that produced the best score")
    extra: dict[str, Any] = Field(default_factory=dict)


class RecognizeResponse(BaseModel):
    is_match: bool = Field(..., description="True if the best match's similarity is >= threshold")
    threshold: float
    best_match: Optional[MatchOut] = None
    top_matches: list[MatchOut] = Field(default_factory=list)


class BoundingBox(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int


class DetectedItem(BaseModel):
    box: BoundingBox
    detector_label: str = Field(..., description="COCO category guessed by the detector; informational only, not used for matching")
    detector_score: float
    is_match: bool
    best_match: Optional[MatchOut] = None
    top_matches: list[MatchOut] = Field(default_factory=list)


class MultiRecognizeResponse(BaseModel):
    threshold: float
    object_count: int
    used_fallback_whole_image: bool = Field(
        ..., description="True if the detector found nothing and the whole photo was treated as a single object"
    )
    detections: list[DetectedItem] = Field(default_factory=list)
