# Asset Recognition Service

Recognizes whether a photographed asset has already been registered, by comparing
image embeddings (vectors) instead of exact-match hashes — so a photo taken from a
different angle, distance, or lighting than the original still matches.

**Real use case (yours):** a manager photographs an asset when it's lent out
(`POST /api/assets`). Everything about the loan itself lives in your main app.
When the borrower returns the asset, they photograph it on the table; your app
sends that photo here (`POST /api/recognize` or `POST /api/recognize/multi`) and
gets back which asset(s) it is and how confident the match is.

This repo is the standalone recognition service — a small HTTP API meant to be
called from your main app's backend. The `/demo` page is just a harness to poke
at the API by hand; you won't ship it.

## How it works

1. **Embed** — every uploaded image (or, for multi-object photos, every detected
   crop) is run through a pretrained CLIP model (`ViT-B-32`, OpenAI weights, via
   [open_clip](https://github.com/mlfoundations/open_clip)) to produce a
   512-dimensional vector that captures what the object looks like. No training
   or per-asset setup needed.
2. **Store** — an asset can have **one or more reference photos** (different
   angles/sides). Each photo's vector is stored in a local persistent
   [Chroma](https://www.trychroma.com/) vector index (`data/chroma/`), tagged
   with its `asset_id`.
3. **Recognize** — a new photo is embedded the same way and compared against
   *every stored reference photo of every asset*; each asset's best-scoring photo
   wins. `is_match` is `true` when that best score clears a threshold (default
   `0.85`, tunable per-request).
4. **Multi-object recognize** — `/api/recognize/multi` uses two box-proposal
   sources together, then crops each region and runs steps 1-3 on each crop
   independently:
   - a COCO-pretrained object detector (Faster R-CNN, MobileNetV3 backbone),
     good for cluttered scenes with common object types; and
   - contour/edge-based segmentation (classical CV, no model) that finds
     "things that stand out from the background" regardless of category or
     viewing angle. This matters because the COCO detector's training photos
     are overwhelmingly eye-level -- it can miss objects entirely in a steep
     top-down shot (exactly the natural angle for "photograph what's on the
     table"). Verified case: a hairbrush and glasses shot from directly above
     got zero candidate boxes from the COCO detector at any confidence down to
     0.05, but the contour path found and correctly matched both (90.9%, 90.6%).

   Contour-sourced boxes that don't end up matching anything are dropped from
   the response (they're typically floor seams/shadows, not real objects);
   COCO-sourced boxes are always kept even if unmatched, since a detector
   guess is informative either way. Falls back to treating the whole photo as
   one object if neither source finds anything.

## Validated with real photos (not synthetic renders — see caveat below)

- **Angle/lighting robustness:** the same object re-photographed (different
  crop/rotation/brightness) scored **~0.94** similarity; a genuinely different
  object scored **~0.57**. Wide, healthy margin around the default 0.85 threshold.
- **Multi-photo registration:** adding a second reference photo per asset and
  re-querying correctly picked the best-matching view per asset.
- **Multi-object photos:** a photo containing two different registered assets
  side by side was correctly split into two detections and each was matched to
  the right asset (94.8% and 92.2%) even though the detector's own COCO class
  guesses for both were wrong/irrelevant ("person", "kite") — which is expected
  and fine, since identity comes from the embedding match, not the detector's
  label.
- **Deformable/generic objects (e.g. cables) — a known failure mode:** the same
  real cable photo, geometrically warped so its path looks tangled instead of
  neatly coiled, dropped to **0.68** similarity — *lower* than two genuinely
  different cables of different colors (0.89-0.89). Whole-image embeddings
  capture overall shape/layout, so an object whose *pose* varies a lot between
  photos (cables, cords, anything you'd coil or tangle) is unreliable to match
  this way. See "Notes / limitations" below for mitigations.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

First run downloads the CLIP weights (~350MB) and detector weights (~74MB),
cached under `.cache/` / `~/.cache/torch` after that.

## Run

```bash
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

- API base: `http://localhost:8000/api`
- Interactive OpenAPI docs: `http://localhost:8000/docs`
- Demo UI: `http://localhost:8000/demo`

## API

### `POST /api/assets` — register a new asset

Manager uploads the asset's first photo. Computes its embedding and stores it.
409s if `asset_id` is supplied and already exists (use the endpoint below instead).

`multipart/form-data`:
| field | required | description |
|---|---|---|
| `file` | yes | image file |
| `name` | yes | human-readable asset name |
| `asset_id` | no | supply your own ID (e.g. your app's asset PK); otherwise a UUID is generated |

```bash
curl -X POST http://localhost:8000/api/assets \
  -F "file=@drill_front.jpg" \
  -F "name=Bosch Cordless Drill #14"
```

```json
{
  "asset_id": "a6b68017-410f-49a2-885f-b13871891127",
  "photo_id": "9c1e2f3a-...",
  "name": "Bosch Cordless Drill #14",
  "created_at": 1786771630.27,
  "photo_count": 1,
  "image_url": "/api/photos/9c1e2f3a-.../image",
  "embedding_dim": 512,
  "extra": {}
}
```

Optional `extra` field lets your app attach its own structured metadata (any
JSON object) that comes back on every read/match response:

```bash
curl -X POST http://localhost:8000/api/assets \
  -F "file=@drill_front.jpg" -F "name=Bosch Cordless Drill #14" \
  -F 'extra={"category": "power_tools", "location": "HQ Rack 3"}'
```

### `POST /api/assets/{asset_id}/photos` — add another reference photo

Add another angle/side of an asset that's already registered. Recognition
compares against every reference photo and takes the best score, so this
materially helps assets that look different from different sides (see
"Do assets need to be photographed from every side?" below).

`multipart/form-data`: `file` (required) — that's it. This endpoint **never**
touches the asset's name or metadata (it always inherits whatever's currently
stored), specifically so adding a photo can't accidentally rename the asset.
To rename, use `PATCH /api/assets/{asset_id}` below.

```bash
curl -X POST http://localhost:8000/api/assets/a6b68017-.../photos \
  -F "file=@drill_back.jpg"
```

Response shape is the same as `POST /api/assets`.

### `PATCH /api/assets/{asset_id}` — rename / edit metadata

The only endpoint that changes an asset's name. No photo involved — JSON body.

```bash
curl -X PATCH http://localhost:8000/api/assets/a6b68017-... \
  -H "Content-Type: application/json" \
  -d '{"name": "Bosch Cordless Drill #14 (repainted)"}'
```

| field | required | description |
|---|---|---|
| `name` | no* | new name |
| `extra` | no* | replaces the asset's custom metadata entirely (not merged) |

\*at least one of the two must be present, or it 400s. 404s if the asset
doesn't exist. Returns the updated `AssetOut`.

### `PATCH /api/assets/{asset_id}/disabled` — hide/unhide from recognition

Hides (or unhides) an asset from `/api/recognize` and `/api/recognize/multi`
matching, without touching its photos or embeddings. Meant to mirror the main
app's asset active/inactive status: deactivate the asset there, this asset
stops being recognizable; reactivate it, and it's recognizable again
instantly — nothing was ever deleted, so there's no re-registration needed.

```bash
curl -X PATCH http://localhost:8000/api/assets/a6b68017-.../disabled \
  -H "Content-Type: application/json" \
  -d '{"disabled": true}'
```

| field | required | description |
|---|---|---|
| `disabled` | yes | `true` to hide from matching, `false` to make recognizable again |

404s if the asset doesn't exist. Returns the updated `AssetOut` (also exposes
`disabled` as a top-level convenience field, alongside `extra.disabled`).
Bookkeeping endpoints (`GET /api/assets`, `GET /api/assets/{id}`) still show
disabled assets — only matching skips them.

### `POST /api/recognize` — recognize a returned asset (single dominant object)

Borrower uploads a photo assumed to show one asset. Compares it against every
registered asset (across all their reference photos).

`multipart/form-data`:
| field | required | description |
|---|---|---|
| `file` | yes | image file |
| `threshold` | no | min. cosine similarity to count as a match (default `0.85`) |
| `top_k` | no | how many nearest candidate assets to return (default `5`) |

```bash
curl -X POST http://localhost:8000/api/recognize \
  -F "file=@returned_photo.jpg" \
  -F "threshold=0.85"
```

```json
{
  "is_match": true,
  "threshold": 0.85,
  "best_match": {
    "asset_id": "a6b68017-410f-49a2-885f-b13871891127",
    "name": "Bosch Cordless Drill #14",
    "similarity": 0.9217,
    "created_at": 1786771630.27,
    "photo_count": 2,
    "image_url": "/api/photos/.../image",
    "extra": {}
  },
  "top_matches": [ /* up to top_k candidates, sorted by similarity desc */ ]
}
```

Always inspect `similarity` yourself if you want different confidence tiers
(e.g. auto-accept above 0.92, flag 0.80-0.92 for manual review, reject below).

### `POST /api/recognize/multi` — recognize multiple assets in one photo

Same idea, but for a photo that might show several assets at once (e.g. a batch
return). Detects candidate objects first, then recognizes each independently.

`multipart/form-data`:
| field | required | description |
|---|---|---|
| `file` | yes | image file |
| `threshold` | no | default `0.85` |
| `top_k` | no | candidates per detected object, default `3` |
| `min_box_score` | no | detector confidence cutoff, default `0.5` |
| `max_objects` | no | cap on objects considered, default `10` |

```json
{
  "threshold": 0.85,
  "object_count": 2,
  "used_fallback_whole_image": false,
  "detections": [
    {
      "box": {"x1": 106, "y1": 38, "x2": 407, "y2": 380},
      "detector_label": "person",
      "detector_score": 0.999,
      "is_match": true,
      "best_match": { "asset_id": "...", "name": "...", "similarity": 0.947, "...": "..." },
      "top_matches": [ "..." ]
    }
  ]
}
```

`detector_label`/`detector_score` come from whichever box-proposal source
found that region (a COCO category, or `"uncategorized region"` for a
contour-sourced box) — **identity always comes from the embedding match,
never from this label.** `used_fallback_whole_image: true` means neither
proposal source found anything and the whole photo was treated as a single
object, same as calling `/api/recognize`.

### Full endpoint list

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/assets` | Register a new asset from its first photo (+ optional `extra` metadata) |
| `POST` | `/api/assets/{asset_id}/photos` | Add another reference photo to an existing asset |
| `PATCH` | `/api/assets/{asset_id}` | Rename an asset and/or replace its `extra` metadata |
| `PATCH` | `/api/assets/{asset_id}/disabled` | Hide/unhide an asset from recognition matching (photos untouched) |
| `DELETE` | `/api/assets/{asset_id}` | Delete an asset and all its reference photos |
| `GET` | `/api/assets` | List all assets (name, `photo_count`, cover image, `extra`) |
| `GET` | `/api/assets/{asset_id}` | Get one asset |
| `GET` | `/api/assets/{asset_id}/photos` | List all of an asset's reference photos |
| `DELETE` | `/api/assets/{asset_id}/photos/{photo_id}` | Delete one reference photo (400s if it's the asset's last one — delete the asset instead) |
| `GET` | `/api/assets/{asset_id}/image` | Cover image (first-registered photo) |
| `GET` | `/api/photos/{photo_id}/image` | A specific reference photo |
| `POST` | `/api/recognize` | Recognize a photo assumed to show one asset |
| `POST` | `/api/recognize/multi` | Detect + recognize multiple assets in one photo |
| `GET` | `/api/health` | Liveness + counts (`assets_registered`, `photos_registered`) |

This is the complete surface — anything your main app needs to do (register,
add angles, rename, attach/query metadata, delete, recognize single or
multi-object) is reachable through one of the above; nothing requires touching
the demo or the store directly.

## Integrating into your main app

This service is deliberately stateless-per-request and side-effect-free beyond
its own vector store, so it can be called however fits your stack. What's
actually implemented in this repo:

- **backend-mediated (what's built):** `backend/src/recognition/` is a thin
  proxy module -- validates the app's own JWT auth, reuses `AssetsService.get()`
  for per-asset access control, then forwards to this service internally.
  The frontend never talks to this service directly; it calls
  `/api/v1/recognition/*` on the main backend, same as every other feature.
  This service has **no authentication of its own** by design -- it's not
  meant to be reachable from anywhere except that one backend module. The two
  image-serving routes are proxied as public (no auth) on the backend side,
  matching this app's existing precedent for asset thumbnails (`/uploads/`
  is also served with no auth check).
- `asset_id` accepts a caller-supplied value — the integration passes the main
  app's own asset UUID at registration time, so the two systems stay 1:1
  without a mapping table. The one extra bit of state that needs to survive
  between requests (which reference photo mirrors the main app's own asset
  thumbnail) is stored in this service's own `extra` metadata as
  `{"mainPhotoId": "<photo_id>"}` — see `frontend/src/recognitionApi.ts` and
  `AssetFormPage.tsx`'s `syncRecognitionPhotos` for the reconciliation logic.

CORS is wide open (`*`) here, but irrelevant in this deployment shape since
the browser never calls this service directly.

## Deployment

Follows the same shape as this repo's other services (`database/`, `backend/`,
`frontend/`): a standalone `docker-compose.yml` here that joins the shared
external `asset-reservation-network`, same as the others.

```bash
docker compose -f recognition-service/docker-compose.yml up -d --build
```

- **No host port is published.** This service has no auth of its own, so it's
  deliberately unreachable from outside the docker network -- only
  `backend`'s `RecognitionModule` can reach it (`RECOGNITION_SERVICE_URL` in
  `backend/.env`, defaults to `http://recognition-service:8000` in Docker).
  Uncomment the `ports:` block in `docker-compose.yml` if you need to hit it
  directly for local debugging.
- **Two named volumes** (`recognition-chroma-data`, `recognition-images-data`)
  persist the vector index and reference photos across container restarts --
  this service's actual "memory" lives there, not in Postgres.
- **Model weights (~430MB: CLIP + detector) are baked into the image at build
  time**, not downloaded on first request -- the `Dockerfile` runs a warm-up
  step during `docker build` specifically so the running container never
  needs outbound internet access. Matters for an on-prem deployment that may
  not have reliable internet at runtime.
- CPU-only inference; no GPU required. Image lands around 2-3GB (mostly
  PyTorch); expect roughly 1-2GB RAM once both models are loaded.

**Not yet done / worth knowing:** these Dockerfile and compose files haven't
been run through an actual `docker build` in this environment (Docker wasn't
installed where this was developed) — they were reviewed carefully against
this repo's existing Dockerfile/compose conventions and the YAML was syntax-
checked, but treat the first real build as the actual first test.

## Project layout

```
app/
  embedding.py   # CLIP model wrapper: image -> 512-d unit vector
  detection.py   # class-agnostic object box proposals for multi-object photos
  store.py       # Chroma-backed vector store: assets with 1+ reference photos each
  schemas.py     # Pydantic request/response models
  main.py        # FastAPI app + all endpoints
demo/
  index.html     # Self-contained demo UI (calls the API only, no separate backend)
data/
  chroma/        # persistent vector index (gitignored)
  images/        # stored original asset photos (gitignored)
```

## FAQ / limitations

**Can I see what the model currently recognizes?**
`GET /api/assets` — it's not a classifier with a fixed class list, it's a
similarity search against whatever's been registered, so "what it recognizes"
is exactly that list.

**Can I remove an asset, or just one of its photos?**
`DELETE /api/assets/{asset_id}` removes the whole thing. `DELETE
/api/assets/{asset_id}/photos/{photo_id}` removes a single reference photo
(blocked with a 400 if it's the asset's only photo, to avoid silently leaving
a nameless, invisible asset behind — delete the asset instead in that case).

**Do assets need to be photographed from every side?**
Not required, but a single photo isn't fully angle-invariant. A view similar to
the registration photo (crop/rotate/brightness variance) still scores ~0.94; a
genuinely different side of an object that looks different from that angle can
score meaningfully lower. For assets whose sides look very different, register
2-4 reference photos via `POST /api/assets/{asset_id}/photos` — recognition
takes the best score across all of them, so this is the main lever for
improving reliability on any given asset.

**Can it recognize multiple assets in one photo?**
Yes, via `/api/recognize/multi`, which detects candidate objects first (COCO
detector + contour-based segmentation, see "How it works" above) and matches
each independently. The COCO side is biased toward common object categories
and struggles with steep top-down angles; the contour side covers that gap for
plain-background photos (table/floor) at the cost of occasionally proposing a
noise box, which gets silently dropped if it doesn't match anything. If
neither source finds anything, the endpoint falls back to treating the whole
photo as one object rather than failing.

**Does it work for cables, cords, or other deformable/generic objects?**
Not reliably as-is. Two compounding problems: (1) shape itself changes a lot
between a neatly coiled photo and a tangled one, and whole-image embeddings are
sensitive to that — measured **0.68** similarity for the *same* cable
re-shaped, versus **0.89** between two *different* cables that both happened to
look coiled. (2) Even holding shape constant, two cables of the same
color/model are close to visually identical, so this approach can at best
confirm "a cable like this one" rather than a specific physical unit. If you
need this to work well:
  - Ask users to lay the item out the same rough way each time (cuts variance,
    doesn't eliminate it), or
  - Photograph/recognize a rigid, distinctive part of the item (e.g. the
    connector head or a printed label) instead of the whole deformable body, or
  - Attach a physical ID (sticker/QR/barcode) and read that instead of relying
    on appearance — the standard approach for generic-looking assets in real
    asset-tracking systems. That's a different pipeline (OCR/barcode read, not
    embedding similarity) and isn't built here, but could sit alongside this
    API as a separate endpoint if needed.

**CPU or GPU?**
CPU inference is fine for interactive use (well under a second per image on a
modern machine, and detection adds maybe another second on `/recognize/multi`);
no GPU required.

**Scaling the vector store**
The store is a single local file-backed index — fine for a single service
instance. If you outgrow that, swap `app/store.py`'s Chroma client for a hosted
vector DB; the rest of the API is unaffected since it only talks to the small
interface in that file.
