import { Camera, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { recognitionApi, type RecognitionPhoto } from "../recognitionApi";
import { Button } from "./ui";
import { CameraCaptureModal } from "./CameraCaptureModal";

// Separate from the "Asset Photo" thumbnail section above it: this manages
// the reference photos used by the asset-recognition feature (0+ photos per
// asset, matched by best score across all of them -- more angles here means
// more reliable recognition later). Independent state, independent API
// (recognition-service, not the main backend), on purpose.
//
// Fully CONTROLLED by the parent (AssetFormPage): adding/removing a photo
// here only stages the change locally (onAdd/onRemoveExisting/etc.) -- no
// network call happens until the parent applies the staged changes on Save,
// same as every other field on this form. Cancelling/navigating away simply
// discards the local state, same as the Asset Photo field above it.
export function RecognitionPhotosSection({
  existingPhotos,
  pendingAdds,
  pendingRemoveIds,
  loading,
  error,
  onAdd,
  onRemoveExisting,
  onRemovePendingAdd,
}: {
  existingPhotos: RecognitionPhoto[];
  pendingAdds: File[];
  pendingRemoveIds: Set<string>;
  loading: boolean;
  error: string;
  onAdd: (file: File) => void;
  onRemoveExisting: (photoId: string) => void;
  onRemovePendingAdd: (index: number) => void;
}) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const visibleExisting = existingPhotos.filter(
    (photo) => !pendingRemoveIds.has(photo.photo_id),
  );
  const totalAfterSave = visibleExisting.length + pendingAdds.length;

  return (
    <section className="form-section">
      <div className="form-section__heading">
        <span>03</span>
        <div>
          <h2>Images for recognition feature</h2>
          <p>
            Reference photos used to recognize this asset later (e.g. when it's
            returned). Separate from the Asset Photo above -- add a few
            different angles for more reliable recognition. Changes here are
            applied when you click Save changes below.
          </p>
        </div>
      </div>

      {error && (
        <div className="form-alert" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className="field__help">Loading recognition photos…</p>
      ) : (
        <div
          style={{
            display: "flex",
            gap: "14px",
            flexWrap: "wrap",
            marginBottom: "14px",
          }}
        >
          {visibleExisting.map((photo) => (
            <PhotoThumb
              key={photo.photo_id}
              src={recognitionApi.imageSrc(photo.image_url)}
              onRemove={() => onRemoveExisting(photo.photo_id)}
              removeLabel="Remove this reference photo"
            />
          ))}
          {pendingAdds.map((file, index) => (
            <PendingPhotoThumb
              key={`pending-${index}-${file.name}-${file.lastModified}`}
              file={file}
              onRemove={() => onRemovePendingAdd(index)}
            />
          ))}
          {totalAfterSave === 0 && (
            <p className="field__help">
              No recognition photos yet -- add at least one so this asset can be
              recognized later.
            </p>
          )}
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
              // Snapshot to a real array BEFORE clearing .value -- some
              // browsers back input.files with a live FileList that gets
              // mutated in place by the reset below, which would otherwise
              // silently empty out this same reference before forEach runs.
              const files = event.target.files ? Array.from(event.target.files) : [];
              event.target.value = ""; // allow re-selecting the same file(s) next time
              files.forEach(onAdd);
            }}
          />
        </label>
      </div>

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => {
          setCameraOpen(false);
          onAdd(file);
        }}
      />
    </section>
  );
}

function PendingPhotoThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  // Memoized per File instance (not recreated on every re-render) and
  // released when this thumbnail unmounts (removed, or replaced by a fresh
  // server-loaded list after Save), so preview blob URLs don't leak.
  const src = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(src), [src]);

  return (
    <PhotoThumb
      src={src}
      onRemove={onRemove}
      removeLabel="Cancel adding this reference photo"
      pending
    />
  );
}

function PhotoThumb({
  src,
  onRemove,
  removeLabel,
  pending,
}: {
  src: string;
  onRemove: () => void;
  removeLabel: string;
  pending?: boolean;
}) {
  return (
    <div style={{ position: "relative", width: "72px", height: "72px" }}>
      <img
        src={src}
        alt="Recognition reference"
        style={{
          width: "72px",
          height: "72px",
          borderRadius: "8px",
          objectFit: "cover",
          border: pending ? "2px dashed var(--blue)" : "1px solid var(--line)",
        }}
      />
      {pending && (
        <span
          style={{
            position: "absolute",
            bottom: "-8px",
            left: "50%",
            transform: "translateX(-50%)",
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
        className="icon-button icon-button--danger"
        title={removeLabel}
        aria-label={removeLabel}
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
