import { Camera, Trash2, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  recognitionApi,
  RecognitionApiError,
  type RecognitionPhoto,
} from "../recognitionApi";
import { Button } from "./ui";
import { CameraCaptureModal } from "./CameraCaptureModal";

// Separate from the "Asset Photo" thumbnail section above it: this manages
// the reference photos used by the asset-recognition feature (0+ photos per
// asset, matched by best score across all of them -- more angles here means
// more reliable recognition later). Independent state, independent API
// (recognition-service, not the main backend), on purpose.
export function RecognitionPhotosSection({
  assetId,
  assetName,
}: {
  assetId: string;
  assetName: string;
}) {
  const [photos, setPhotos] = useState<RecognitionPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      setPhotos(await recognitionApi.listPhotos(assetId));
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load recognition photos",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);

  async function addPhoto(file: File) {
    setUploading(true);
    setError("");
    try {
      await recognitionApi.registerOrAddPhoto(assetId, assetName, file, file.name || "photo.jpg");
      await reload();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not upload recognition photo",
      );
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto(photoId: string) {
    setError("");
    try {
      await recognitionApi.deletePhoto(assetId, photoId);
      await reload();
    } catch (caught) {
      if (caught instanceof RecognitionApiError && caught.status === 400) {
        // Last remaining photo -- the service refuses to leave the asset
        // with zero reference photos via this endpoint.
        setError(caught.message);
      } else {
        setError(caught instanceof Error ? caught.message : "Could not remove photo");
      }
    }
  }

  return (
    <section className="form-section">
      <div className="form-section__heading">
        <span>03</span>
        <div>
          <h2>Images for recognition feature</h2>
          <p>
            Reference photos used to recognize this asset later (e.g. when it's
            returned). Separate from the Asset Photo above -- add a few
            different angles for more reliable recognition.
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
          {photos.map((photo) => (
            <div
              key={photo.photo_id}
              style={{ position: "relative", width: "72px", height: "72px" }}
            >
              <img
                src={recognitionApi.imageSrc(photo.image_url)}
                alt="Recognition reference"
                style={{
                  width: "72px",
                  height: "72px",
                  borderRadius: "8px",
                  objectFit: "cover",
                  border: "1px solid var(--line)",
                }}
              />
              <button
                type="button"
                className="icon-button icon-button--danger"
                title="Remove this reference photo"
                aria-label="Remove this reference photo"
                onClick={() => void removePhoto(photo.photo_id)}
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
          ))}
          {photos.length === 0 && (
            <p className="field__help">
              No recognition photos yet -- add at least one so this asset can be
              recognized later.
            </p>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
        <Button
          type="button"
          variant="secondary"
          disabled={uploading}
          onClick={() => setCameraOpen(true)}
        >
          <Camera size={17} /> Take photo
        </Button>
        <label className="button button--secondary button--md" style={{ cursor: "pointer" }}>
          <Upload size={17} />
          {uploading ? "Uploading…" : "Upload file"}
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = ""; // allow re-selecting the same file next time
              if (file) void addPhoto(file);
            }}
          />
        </label>
      </div>

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={async (file) => {
          setCameraOpen(false);
          await addPhoto(file);
        }}
      />
    </section>
  );
}
