import { Controller, Post, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { extname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { CurrentActor } from "../auth/auth.decorators.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { ApiException } from "../common/api-exception.js";

@Controller("uploads")
export class UploadsController {
  @Post("image")
  async uploadImage(
    @CurrentActor() _actor: AuthenticatedActor,
    @Req() req: FastifyRequest,
  ) {
    if (!req.isMultipart()) {
      throw new ApiException(
        400,
        "INVALID_MULTIPART",
        "Request must be a multipart/form-data payload.",
      );
    }
    const data = await req.file();
    if (!data) {
      throw new ApiException(
        400,
        "MISSING_FILE",
        "No image file was provided in the upload request.",
      );
    }

    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/pjpeg",
      "image/png",
      "image/x-png",
      "image/webp",
      "image/gif",
      "image/svg+xml",
      "image/avif",
      "image/bmp",
      "image/x-ms-bmp",
      "image/x-icon",
      "image/vnd.microsoft.icon",
      "image/heic",
      "image/heif",
    ];
    const mime = data.mimetype.toLowerCase();
    if (!allowedMimeTypes.includes(mime) && !mime.startsWith("image/")) {
      throw new ApiException(
        422,
        "INVALID_FILE_TYPE",
        "Only JPEG, PNG, WEBP, GIF, SVG, and other image formats are allowed.",
      );
    }

    const ext = extname(data.filename) || ".png";
    const filename = `${Date.now()}-${randomUUID()}${ext}`;
    const assetsDir = resolve(process.cwd(), "uploads", "assets");
    if (!existsSync(assetsDir)) {
      mkdirSync(assetsDir, { recursive: true });
    }

    const targetPath = resolve(assetsDir, filename);
    await pipeline(data.file, createWriteStream(targetPath));

    return {
      url: `/uploads/assets/${filename}`,
    };
  }
}
