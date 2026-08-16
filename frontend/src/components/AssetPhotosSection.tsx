import { Camera, Star, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { recognitionApi, type RecognitionPhoto } from "../recognitionApi";
import { Button } from "./ui";
import { CameraCaptureModal } from "./CameraCaptureModal";

export type PendingPhoto = { id: string; file: File };

/**
 * Unified photo manager for the asset form. Every photo attached to an
 * asset -- batch-uploaded or captured -- is both a potential thumbnail AND a
 * recognition reference photo; there's no separate single-photo "Asset
 * Photo" field anymore. Exactly one photo is marked as the thumbnail (used
 * as the asset's pictureUrl, shown everywhere else in the app); the rest
 * still feed the recognition feature even though nothing else displays them.
 *
 * Fully controlled by the parent (AssetFormPage): every action here only
 * stages a change locally -- no network call happens until Save changes is
 * clicked (the parent resolves everything then; see AssetFormPage's
 * resolvePictureUrl/syncAssetPhotos).
 */
export function AssetPhotosSection({
  existingPhotos,
  removedExistingIds,
  pendingAdds,
  thumbnailKey,
  loading,
  error,
  onAddFiles,
  onRemoveExisting,
  onRemovePending,
  onSelectThumbnail,
}: {
  existingPhotos: RecognitionPhoto[];
  removedExistingIds: Set<string>;
  pendingAdds: PendingPhoto[];
  thumbnailKey: string | null;
  loading: boolean;
  error: string;
  onAddFiles: (files: File[]) => void;
  onRemoveExisting: (photoId: string) => void;
  onRemovePending: (id: string) => void;
  onSelectThumbnail: (key: string) => void;
}) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const visibleExisting = existingPhotos.filter((p) => !removedExistingIds.has(p.photo_id));
  const total = visibleExisting.length + pendingAdds.length;

  return (
    <section className="form-section">
      <div className="form-section__heading">
        <span>02</span>
        <div>
          <h2>Asset Photos</h2>
          <p>
            Upload one or more photos (batch, or one at a time with the camera).
            They're also used to recognize this asset later -- pick which one
            shows as the thumbnail with the star.
          </p>
        </div>
      </div>

      {error && (
        <div className="form-alert" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className="field__help">Loading photos…</p>
      ) : (
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "14px" }}>
          {visibleExisting.map((photo) => {
            const key = `existing:${photo.photo_id}`;
            return (
              <PhotoThumb
                key={key}
                src={recognitionApi.imageSrc(photo.image_url)}
                isThumbnail={thumbnailKey === key}
                onRemove={() => onRemoveExisting(photo.photo_id)}
                onSelectThumbnail={() => onSelectThumbnail(key)}
              />
            );
          })}
          {pendingAdds.map((pending) => {
            const key = `pending:${pending.id}`;
            return (
              <PendingPhotoThumb
                key={key}
                file={pending.file}
                isThumbnail={thumbnailKey === key}
                onRemove={() => onRemovePending(pending.id)}
                onSelectThumbnail={() => onSelectThumbnail(key)}
              />
            );
          })}
          {total === 0 && <p className="field__help">No photos yet -- add at least one below.</p>}
        </div>
      )}

      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
        <Button type="button" variant="secondary" onClick={() => setCameraOpen(true)}>
          <Camera size={17} /> Take photo
        </Button>
        <label className="button button--secondary button--md" style={{ cursor: "pointer" }}>
          <Upload size={17} />
          Upload files
          <input
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(event) => {
              // Snapshot to a real array BEFORE clearing .value -- input.files
              // can be backed by a live FileList that gets mutated in place by
              // the reset below, which would otherwise empty this reference
              // out before it's used.
              const files = event.target.files ? Array.from(event.target.files) : [];
              event.target.value = ""; // allow re-selecting the same file(s) next time
              if (files.length > 0) onAddFiles(files);
            }}
          />
        </label>
      </div>

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => {
          setCameraOpen(false);
          onAddFiles([file]);
        }}
      />
    </section>
  );
}

function PendingPhotoThumb({
  file,
  isThumbnail,
  onRemove,
  onSelectThumbnail,
}: {
  file: File;
  isThumbnail: boolean;
  onRemove: () => void;
  onSelectThumbnail: () => void;
}) {
  // Create AND revoke the blob URL inside the same effect (not
  // useMemo+separate-cleanup-effect) so the URL survives React 18
  // StrictMode's dev-only double-invoke of effects. With the URL created in
  // useMemo, StrictMode's synthetic mount->cleanup->remount would revoke it
  // via the cleanup effect without useMemo ever creating a replacement
  // (it's still memoized on the same `file`), leaving <img> pointing at a
  // revoked blob URL -- the preview silently fails to load.
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  if (!src) return null;

  return (
    <PhotoThumb
      src={src}
      isThumbnail={isThumbnail}
      onRemove={onRemove}
      onSelectThumbnail={onSelectThumbnail}
      pending
    />
  );
}

function PhotoThumb({
  src,
  isThumbnail,
  onRemove,
  onSelectThumbnail,
  pending,
}: {
  src: string;
  isThumbnail: boolean;
  onRemove: () => void;
  onSelectThumbnail: () => void;
  pending?: boolean;
}) {
  return (
    <div style={{ position: "relative", width: "76px", height: "76px" }}>
      <img
        src={src}
        alt="Asset"
        style={{
          width: "76px",
          height: "76px",
          borderRadius: "8px",
          objectFit: "cover",
          border: isThumbnail ? "2px solid var(--blue)" : "1px solid var(--line)",
        }}
      />
      {pending && (
        <span
          style={{
            position: "absolute",
            bottom: "-8px",
            left: "4px",
            fontSize: "10px",
            background: "var(--blue)",
            color: "#fff",
            borderRadius: "4px",
            padding: "1px 5px",
            whiteSpace: "nowrap",
          }}
        >
          new
        </span>
      )}
      <button
        type="button"
        title={isThumbnail ? "Thumbnail photo" : "Use as thumbnail"}
        aria-label={isThumbnail ? "This is the thumbnail photo" : "Use as thumbnail"}
        aria-pressed={isThumbnail}
        onClick={onSelectThumbnail}
        style={{
          position: "absolute",
          top: "-8px",
          left: "-8px",
          width: "22px",
          height: "22px",
          borderRadius: "50%",
          background: isThumbnail ? "var(--blue)" : "var(--surface)",
          color: isThumbnail ? "#fff" : "var(--ink-faint)",
          border: "1px solid var(--line)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <Star size={12} fill={isThumbnail ? "currentColor" : "none"} />
      </button>
      <button
        type="button"
        className="icon-button icon-button--danger"
        title="Remove this photo"
        aria-label="Remove this photo"
        onClick={onRemove}
        style={{
          position: "absolute",
          top: "-8px",
          right: "-8px",
          background: "var(--surface)",
          borderRadius: "50%",
          boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
        }}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
