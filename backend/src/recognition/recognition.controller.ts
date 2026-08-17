import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AssetsService } from "../assets/assets.service.js";
import { CurrentActor, Public } from "../auth/auth.decorators.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { ApiException } from "../common/api-exception.js";
import { UpdateRecognitionAssetDto } from "./recognition.dto.js";
import {
  RecognitionService,
  type UploadedFilePart,
} from "./recognition.service.js";

async function readMultipart(
  req: FastifyRequest,
): Promise<{ file?: UploadedFilePart; fields: Record<string, string> }> {
  if (!req.isMultipart()) {
    throw new ApiException(
      400,
      "INVALID_MULTIPART",
      "Request must be multipart/form-data.",
    );
  }
  let file: UploadedFilePart | undefined;
  const fields: Record<string, string> = {};
  for await (const part of req.parts()) {
    if (part.type === "file") {
      file = {
        buffer: await part.toBuffer(),
        filename: part.filename,
        mimetype: part.mimetype,
      };
    } else {
      fields[part.fieldname] = String(part.value);
    }
  }
  return { file, fields };
}

/**
 * Proxies the frontend to the internal recognition-service, so that service
 * is never reachable except through this backend's own authentication and
 * per-asset access control (reusing AssetsService.get() -- the same check
 * the rest of the app already relies on for "can this actor see this
 * asset"). recognition-service itself has no auth of its own by design; this
 * controller is the only thing standing in front of it.
 *
 * The two image-serving routes are marked @Public() to match this app's
 * existing precedent for asset thumbnails (served statically via /uploads/
 * with no auth check either) -- static reference-photo bytes are treated as
 * no more sensitive than an asset's own photo.
 */
@Controller("recognition")
export class RecognitionController {
  constructor(
    private readonly recognition: RecognitionService,
    private readonly assets: AssetsService,
  ) {}

  @Post("assets")
  async registerAsset(
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: FastifyRequest,
  ) {
    const { file, fields } = await readMultipart(req);
    if (fields.asset_id) {
      await this.assets.get(actor, fields.asset_id);
    }
    return this.recognition.postMultipart("/assets", file, {
      name: fields.name,
      asset_id: fields.asset_id,
      extra: fields.extra,
    });
  }

  @Post("assets/:assetId/photos")
  async addPhoto(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("assetId", new ParseUUIDPipe()) assetId: string,
    @Req() req: FastifyRequest,
  ) {
    await this.assets.get(actor, assetId);
    const { file } = await readMultipart(req);
    return this.recognition.postMultipart(
      `/assets/${assetId}/photos`,
      file,
      {},
    );
  }

  @Patch("assets/:assetId")
  async updateAsset(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("assetId", new ParseUUIDPipe()) assetId: string,
    @Body() body: UpdateRecognitionAssetDto,
  ) {
    await this.assets.get(actor, assetId);
    return this.recognition.patchJson(`/assets/${assetId}`, body);
  }

  @Get("assets/:assetId")
  async getAsset(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("assetId", new ParseUUIDPipe()) assetId: string,
  ) {
    await this.assets.get(actor, assetId);
    const result = await this.recognition.getOrNull(`/assets/${assetId}`);
    if (result === null) {
      throw new ApiException(
        404,
        "NOT_FOUND",
        "This asset has no recognition data yet.",
      );
    }
    return result;
  }

  @Get("assets/:assetId/photos")
  async listPhotos(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("assetId", new ParseUUIDPipe()) assetId: string,
  ) {
    await this.assets.get(actor, assetId);
    const result = await this.recognition.getOrNull(
      `/assets/${assetId}/photos`,
    );
    return result ?? [];
  }

  @Delete("assets/:assetId")
  async deleteAsset(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("assetId", new ParseUUIDPipe()) assetId: string,
  ) {
    await this.assets.get(actor, assetId);
    return this.recognition.delete(`/assets/${assetId}`);
  }

  @Delete("assets/:assetId/photos/:photoId")
  async deletePhoto(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("assetId", new ParseUUIDPipe()) assetId: string,
    @Param("photoId") photoId: string,
  ) {
    await this.assets.get(actor, assetId);
    return this.recognition.delete(`/assets/${assetId}/photos/${photoId}`);
  }

  @Public()
  @Get("assets/:assetId/image")
  async getAssetImage(
    @Param("assetId") assetId: string,
    @Res() reply: FastifyReply,
  ) {
    const { buffer, contentType } = await this.recognition.getImage(
      `/assets/${assetId}/image`,
    );
    reply.header("Content-Type", contentType).send(buffer);
  }

  @Public()
  @Get("photos/:photoId/image")
  async getPhotoImage(
    @Param("photoId") photoId: string,
    @Res() reply: FastifyReply,
  ) {
    const { buffer, contentType } = await this.recognition.getImage(
      `/photos/${photoId}/image`,
    );
    reply.header("Content-Type", contentType).send(buffer);
  }

  @Post("recognize")
  async recognize(
    @CurrentActor() _actor: AuthenticatedActor,
    @Req() req: FastifyRequest,
  ) {
    const { file, fields } = await readMultipart(req);
    return this.recognition.postMultipart("/recognize", file, {
      threshold: fields.threshold,
      top_k: fields.top_k,
    });
  }

  @Post("recognize/multi")
  async recognizeMulti(
    @CurrentActor() _actor: AuthenticatedActor,
    @Req() req: FastifyRequest,
  ) {
    const { file, fields } = await readMultipart(req);
    return this.recognition.postMultipart("/recognize/multi", file, {
      threshold: fields.threshold,
      top_k: fields.top_k,
      min_box_score: fields.min_box_score,
      max_objects: fields.max_objects,
    });
  }
}
