# Recognition module

[← Backend specification](../README.md)

Proxies the frontend to an internal recognition-service (Python/FastAPI, image embeddings/object detection) so that service is never reachable directly. Source: `backend/src/recognition/`.

## Why this module exists

`recognition-service` has no authentication of its own by design. `RecognitionController` is the only thing standing in front of it: every route that references an existing asset first calls `AssetsService.get(actor, assetId)`, reusing the exact same asset-view access check the rest of the app relies on. `RecognitionService` is a thin HTTP client (multipart/JSON relay) with no business logic of its own — errors from the upstream service are re-thrown as `ApiException` so they flow through the same error envelope as the rest of this API instead of leaking FastAPI's `{detail: "..."}` shape.

Business-rule ownership (which routes require asset access, when the recognition-service policy is intentionally lenient) is documented once in [software_spec/business-rules-and-validation.md §6](../../software_spec/business-rules-and-validation.md#6-recognition-email-templates-notification-settings) — this file only covers implementation.

## Routes

11 routes under `/recognition`. Full request/response shapes: [contracts/paths/recognition.yaml](../contracts/paths/recognition.yaml), schemas in [contracts/components/schemas/recognition.yaml](../contracts/components/schemas/recognition.yaml).

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| POST | `/recognition/assets` | Authenticated | If `asset_id` given, asset-view check first |
| GET | `/recognition/assets/{assetId}` | Authenticated + asset-view | 404 if asset has no recognition data yet |
| PATCH | `/recognition/assets/{assetId}` | Authenticated + asset-view | |
| DELETE | `/recognition/assets/{assetId}` | Authenticated + asset-view | |
| GET | `/recognition/assets/{assetId}/photos` | Authenticated + asset-view | Returns `[]` if none |
| POST | `/recognition/assets/{assetId}/photos` | Authenticated + asset-view | Multipart, one file |
| DELETE | `/recognition/assets/{assetId}/photos/{photoId}` | Authenticated + asset-view | |
| GET | `/recognition/assets/{assetId}/image` | **Public** | Same precedent as static `/uploads/` asset thumbnails |
| GET | `/recognition/photos/{photoId}/image` | **Public** | Same precedent |
| POST | `/recognition/recognize` | Authenticated | Single best match |
| POST | `/recognition/recognize/multi` | Authenticated | Multi-object match across bounding boxes |

## Implementation notes

- All request bodies to the upstream service are `multipart/form-data` (image + string fields) except `PATCH /assets/{assetId}`, which is JSON.
- The upstream base URL comes from `appConfig.recognitionServiceUrl`; all calls target `${url}/api${path}`.
- Network failures to the recognition service surface as `502 RECOGNITION_SERVICE_UNREACHABLE`; non-2xx responses from the service surface as `ApiException(status, "RECOGNITION_SERVICE_ERROR", detail)`, where `detail` is taken from the upstream `{detail}` field when present.
- `getOrNull()` is used only for `GET /assets/{assetId}` so a never-registered asset returns `null` → this controller's own `404 NOT_FOUND`, distinct from an upstream 404 relayed as `RECOGNITION_SERVICE_ERROR`.
- Image routes stream `Content-Type` through from the upstream response rather than assuming a fixed MIME type.
- Response schemas for the upstream-owned shapes (`RecognitionAsset`, `RecognitionPhoto`) are intentionally loose (`additionalProperties: true`) in the OpenAPI contract — this backend does not validate or transform them, only relays.
