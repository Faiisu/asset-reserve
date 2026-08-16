// Thin client for the asset recognition service (recognition-service/), a
// separate Python/FastAPI process reached via the /recognition proxy (see
// vite.config.ts) -- same pattern as api.ts's /api proxy, kept in its own
// file/module rather than touching api.ts so the existing API client is
// untouched.
//
// We reuse the main app's own asset UUID as this service's asset_id, so the
// two systems stay 1:1 without needing a mapping table anywhere. The single
// extra bit of bookkeeping we need -- "which reference photo, if any, was
// derived from the main Asset Photo thumbnail" -- is stored in the
// recognition asset's own `extra` metadata as `{ mainPhotoId: "<photo_id>" }`,
// rather than anywhere in the main app's database, so that link travels with
// the recognition asset and needs no schema change on either side.

const ROOT = "/recognition/api";

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

export class RecognitionApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "RecognitionApiError";
  }
}

async function parseErrorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: string };
    return body.detail ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ROOT}${path}`, init);
  if (!res.ok) {
    throw new RecognitionApiError(res.status, await parseErrorDetail(res));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const recognitionApi = {
  /** Full URL prefix for displaying a recognition-service image (image_url
   * values it returns are already root-relative, e.g. "/api/photos/xxx/image",
   * so they need the same /recognition proxy prefix to load in the browser). */
  imageSrc(imageUrl: string): string {
    return `/recognition${imageUrl}`;
  },

  async getAsset(assetId: string): Promise<RecognitionAsset | null> {
    const res = await fetch(`${ROOT}/assets/${assetId}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new RecognitionApiError(res.status, await parseErrorDetail(res));
    return (await res.json()) as RecognitionAsset;
  },

  async listPhotos(assetId: string): Promise<RecognitionPhoto[]> {
    const res = await fetch(`${ROOT}/assets/${assetId}/photos`);
    if (res.status === 404) return []; // asset not registered with the recognition service yet
    if (!res.ok) throw new RecognitionApiError(res.status, await parseErrorDetail(res));
    return (await res.json()) as RecognitionPhoto[];
  },

  /** Renames/replaces the recognition asset's custom metadata (`extra` is
   * replaced wholesale by the service, not merged -- callers should read the
   * current value first if they need to preserve other keys). */
  async updateAsset(assetId: string, update: { name?: string; extra?: Record<string, unknown> }): Promise<RecognitionAsset> {
    return request(`/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
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
    const res = await request<{ photo_id: string }>(`/assets`, { method: "POST", body: form });
    return res.photo_id;
  },

  /** Adds another reference photo to an asset that's already registered.
   * Returns the new photo's id. */
  async addPhoto(assetId: string, file: File | Blob, filename = "photo.jpg"): Promise<string> {
    const form = new FormData();
    form.append("file", file, filename);
    const res = await request<{ photo_id: string }>(`/assets/${assetId}/photos`, { method: "POST", body: form });
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
    await request(`/assets/${assetId}/photos/${photoId}`, { method: "DELETE" });
  },

  /** Removes the asset from the recognition service entirely (all reference
   * photos with it) -- used when the last remaining photo is being removed,
   * since the service refuses to delete a lone photo standalone. */
  async deleteAsset(assetId: string): Promise<void> {
    await request(`/assets/${assetId}`, { method: "DELETE" });
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
