// Client for the asset recognition feature. Routed entirely through this
// app's own backend (/api/v1/recognition/*) rather than the recognition
// service directly -- that service has no auth of its own by design, so the
// backend's RecognitionController is the only thing allowed to reach it,
// same posture as any other internal dependency. Reuses api.ts's own
// request() helper (auth headers, 401 handling, error envelope parsing) so
// this behaves identically to the rest of the app rather than reimplementing
// that logic in parallel.
//
// We reuse the main app's own asset UUID as this service's asset_id, so the
// two systems stay 1:1 without needing a mapping table anywhere. The one
// extra bit of bookkeeping -- "which reference photo, if any, was derived
// from the main Asset Photo thumbnail" -- is stored in the recognition
// asset's own `extra` metadata as `{ mainPhotoId: "<photo_id>" }`.

import { ApiClientError, request } from "./api";

const ROOT = "/recognition";

export type RecognitionPhoto = {
  photo_id: string;
  created_at: number;
  image_url: string;
};

export type RecognitionAsset = {
  asset_id: string;
  name: string;
  photo_count: number;
  image_url: string | null;
  extra: Record<string, unknown>;
};

export const recognitionApi = {
  /** Full URL for displaying a recognition-service image. image_url values
   * are root-relative (e.g. "/api/photos/xxx/image" or "/photos/xxx/image"
   * depending on endpoint) -- normalize and route through this app's own
   * public image-proxy routes. */
  imageSrc(imageUrl: string): string {
    const path = imageUrl.startsWith("/api/") ? imageUrl.slice(4) : imageUrl;
    return `/api/v1${ROOT}${path}`;
  },

  async getAsset(assetId: string): Promise<RecognitionAsset | null> {
    try {
      return await request<RecognitionAsset>(`${ROOT}/assets/${assetId}`);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 404) return null;
      throw caught;
    }
  },

  async listPhotos(assetId: string): Promise<RecognitionPhoto[]> {
    try {
      return await request<RecognitionPhoto[]>(`${ROOT}/assets/${assetId}/photos`);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 404) return [];
      throw caught;
    }
  },

  async updateAsset(assetId: string, update: { name?: string; extra?: Record<string, unknown> }): Promise<RecognitionAsset> {
    return request(`${ROOT}/assets/${assetId}`, {
      method: "PATCH",
      body: JSON.stringify(update),
    });
  },

  /** Registers a brand-new asset (first reference photo) under a caller-chosen
   * asset_id -- used the very first time an asset gets a recognition photo.
   * Returns the new photo's id. */
  async registerAsset(
    assetId: string,
    name: string,
    file: File | Blob,
    filename = "photo.jpg",
    extra?: Record<string, unknown>,
  ): Promise<string> {
    const form = new FormData();
    form.append("file", file, filename);
    form.append("name", name);
    form.append("asset_id", assetId);
    if (extra) form.append("extra", JSON.stringify(extra));
    const res = await request<{ photo_id: string }>(`${ROOT}/assets`, { method: "POST", body: form });
    return res.photo_id;
  },

  /** Adds another reference photo to an asset that's already registered.
   * Returns the new photo's id. */
  async addPhoto(assetId: string, file: File | Blob, filename = "photo.jpg"): Promise<string> {
    const form = new FormData();
    form.append("file", file, filename);
    const res = await request<{ photo_id: string }>(`${ROOT}/assets/${assetId}/photos`, { method: "POST", body: form });
    return res.photo_id;
  },

  /** Registers the asset if this is its first recognition photo, otherwise
   * adds another reference photo to it -- the one function both the
   * asset-create flow and the edit-page photo section should call. Returns
   * the new photo's id. */
  async registerOrAddPhoto(assetId: string, name: string, file: File | Blob, filename = "photo.jpg"): Promise<string> {
    const existing = await recognitionApi.getAsset(assetId);
    if (existing) {
      return recognitionApi.addPhoto(assetId, file, filename);
    }
    return recognitionApi.registerAsset(assetId, name, file, filename);
  },

  async deletePhoto(assetId: string, photoId: string): Promise<void> {
    await request(`${ROOT}/assets/${assetId}/photos/${photoId}`, { method: "DELETE" });
  },

  /** Removes the asset from the recognition service entirely (all reference
   * photos with it) -- used when the last remaining photo is being removed,
   * since the service refuses to delete a lone photo standalone. */
  async deleteAsset(assetId: string): Promise<void> {
    await request(`${ROOT}/assets/${assetId}`, { method: "DELETE" });
  },

  /** Pulls an already-uploaded image (e.g. the asset's own thumbnail URL from
   * the main app's /uploads) back down as a File, so it can be forwarded to
   * this service without needing to keep the original file input around. */
  async fetchAsFile(url: string, filename = "photo.jpg"): Promise<File> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not fetch image at ${url}`);
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type || "image/jpeg" });
  },
};
