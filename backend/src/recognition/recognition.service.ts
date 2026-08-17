import { Injectable } from "@nestjs/common";
import { appConfig } from "../config.js";
import { ApiException } from "../common/api-exception.js";

export type UploadedFilePart = {
  buffer: Buffer;
  filename: string;
  mimetype: string;
};

export type ImagePayload = {
  buffer: Buffer;
  contentType: string;
};

/**
 * Thin HTTP client to the internal recognition-service (Python/FastAPI).
 * Never exposed to the browser directly -- RecognitionController is the only
 * caller, so every method here assumes the request has already passed the
 * app's own authentication/access checks.
 *
 * Errors from the upstream service are re-thrown as ApiException so they
 * flow through the same ApiExceptionFilter envelope as every other error in
 * this API, rather than leaking FastAPI's own {detail: "..."} error shape.
 */
@Injectable()
export class RecognitionService {
  private url(path: string): string {
    return `${appConfig.recognitionServiceUrl}/api${path}`;
  }

  private async relay(res: globalThis.Response): Promise<unknown> {
    const text = await res.text();
    let body: unknown;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!res.ok) {
      const detail =
        body && typeof body === "object" && "detail" in body
          ? String((body as { detail: unknown }).detail)
          : res.statusText || "Recognition service request failed";
      throw new ApiException(res.status, "RECOGNITION_SERVICE_ERROR", detail);
    }
    return body;
  }

  async postMultipart(
    path: string,
    file: UploadedFilePart | undefined,
    fields: Record<string, string | undefined>,
  ): Promise<unknown> {
    const form = new FormData();
    if (file) {
      form.append(
        "file",
        new Blob([new Uint8Array(file.buffer)], { type: file.mimetype || "application/octet-stream" }),
        file.filename || "upload.jpg",
      );
    }
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) form.append(key, value);
    }
    let res: globalThis.Response;
    try {
      res = await fetch(this.url(path), { method: "POST", body: form });
    } catch {
      throw new ApiException(502, "RECOGNITION_SERVICE_UNREACHABLE", "The recognition service is unreachable.");
    }
    return this.relay(res);
  }

  /**
   * PATCH .../assets/:assetId, but merges `extra` with whatever is currently
   * stored server-side first. The recognition-service's own PATCH contract
   * *replaces* extra wholesale (see recognition-service/app/schemas.py) --
   * fine for a single direct caller, but this proxy has two independent
   * writers of extra (the frontend's mainPhotoId tracking, and
   * RecognitionLifecycleListener's disabled flag), and a raw passthrough
   * would let either one silently wipe out the other's key. Merging here,
   * once, means neither caller needs to know about the other.
   */
  async updateAssetMergingExtra(
    assetId: string,
    body: { name?: string; extra?: Record<string, unknown> },
  ): Promise<unknown> {
    if (body.extra === undefined) {
      return this.patchJson(`/assets/${assetId}`, body);
    }
    const current = await this.getOrNull(`/assets/${assetId}`);
    const currentExtra = this.extractExtra(current);
    return this.patchJson(`/assets/${assetId}`, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      extra: { ...currentExtra, ...body.extra },
    });
  }

  private extractExtra(asset: unknown): Record<string, unknown> {
    if (
      asset &&
      typeof asset === "object" &&
      "extra" in asset &&
      asset.extra &&
      typeof asset.extra === "object"
    ) {
      return asset.extra as Record<string, unknown>;
    }
    return {};
  }

  /**
   * Best-effort: hide/unhide an asset from recognition matching, mirroring
   * the main app's asset active-status. Never throws -- this runs as a side
   * effect of that status change (see RecognitionLifecycleListener) and
   * must not fail or block it just because the recognition service is
   * slow/unreachable, or because this particular asset was never registered
   * there in the first place (common -- not every asset has recognition
   * photos, and a 404 here just means there's nothing to disable).
   */
  async setDisabled(assetId: string, disabled: boolean): Promise<void> {
    try {
      await this.patchJson(`/assets/${assetId}/disabled`, { disabled });
    } catch (error) {
      if (error instanceof ApiException && error.getStatus() === 404) return;
      console.warn(
        `[recognition] could not set disabled=${disabled} for asset ${assetId}:`,
        error,
      );
    }
  }

  async patchJson(path: string, body: unknown): Promise<unknown> {
    let res: globalThis.Response;
    try {
      res = await fetch(this.url(path), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new ApiException(502, "RECOGNITION_SERVICE_UNREACHABLE", "The recognition service is unreachable.");
    }
    return this.relay(res);
  }

  async get(path: string): Promise<unknown> {
    let res: globalThis.Response;
    try {
      res = await fetch(this.url(path));
    } catch {
      throw new ApiException(502, "RECOGNITION_SERVICE_UNREACHABLE", "The recognition service is unreachable.");
    }
    return this.relay(res);
  }

  /** Like get(), but returns null on 404 instead of throwing (e.g. an asset
   * that hasn't been registered with the recognition service yet). */
  async getOrNull(path: string): Promise<unknown | null> {
    let res: globalThis.Response;
    try {
      res = await fetch(this.url(path));
    } catch {
      throw new ApiException(502, "RECOGNITION_SERVICE_UNREACHABLE", "The recognition service is unreachable.");
    }
    if (res.status === 404) return null;
    return this.relay(res);
  }

  async delete(path: string): Promise<unknown> {
    let res: globalThis.Response;
    try {
      res = await fetch(this.url(path), { method: "DELETE" });
    } catch {
      throw new ApiException(502, "RECOGNITION_SERVICE_UNREACHABLE", "The recognition service is unreachable.");
    }
    return this.relay(res);
  }

  async getImage(path: string): Promise<ImagePayload> {
    let res: globalThis.Response;
    try {
      res = await fetch(this.url(path));
    } catch {
      throw new ApiException(502, "RECOGNITION_SERVICE_UNREACHABLE", "The recognition service is unreachable.");
    }
    if (!res.ok) {
      throw new ApiException(res.status === 404 ? 404 : 502, "RECOGNITION_SERVICE_ERROR", "Image not found.");
    }
    const arrayBuffer = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
    };
  }
}
