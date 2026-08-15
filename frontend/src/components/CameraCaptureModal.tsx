import {
  AlertCircle,
  Camera,
  Check,
  RefreshCw,
  RotateCcw,
  SwitchCamera,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Dialog } from "./ui";

export interface CameraCaptureModalProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => Promise<void> | void;
}

export function CameraCaptureModal({
  open,
  onClose,
  onCapture,
}: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment",
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [processing, setProcessing] = useState(false);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore track stop errors
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(
    async (targetFacingMode?: "environment" | "user", deviceId?: string) => {
      stopStream();
      setCapturedImage(null);
      setCapturedBlob(null);
      setStatus("loading");
      setErrorMessage("");

      if (!navigator?.mediaDevices?.getUserMedia) {
        setStatus("error");
        setErrorMessage(
          "Camera access requires a secure connection (HTTPS) or is not supported by this browser.",
        );
        return;
      }

      const activeFacingMode = targetFacingMode ?? facingMode;

      try {
        let stream: MediaStream | null = null;

        // Strategy 1: Specific Device ID (if switching on desktop/multi-camera)
        if (deviceId) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                deviceId: { exact: deviceId },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
              audio: false,
            });
          } catch {
            stream = null;
          }
        }

        // Strategy 2: Exact Facing Mode (Mobile Back vs Front)
        if (!stream) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: { exact: activeFacingMode },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
              audio: false,
            });
          } catch {
            stream = null;
          }
        }

        // Strategy 3: Ideal Facing Mode
        if (!stream) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: { ideal: activeFacingMode },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
              audio: false,
            });
          } catch {
            stream = null;
          }
        }

        // Strategy 4: Simple Facing Mode
        if (!stream) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: activeFacingMode },
              audio: false,
            });
          } catch {
            stream = null;
          }
        }

        // Strategy 5: Generic video fallback
        if (!stream) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch {
            // Auto-play was prevented or handled
          }
        }
        setStatus("ready");

        // Enumerate video devices for camera switching
        const allDevices = await navigator.mediaDevices
          .enumerateDevices()
          .catch(() => []);
        const videoInputs = allDevices.filter((d) => d.kind === "videoinput");
        setDevices(videoInputs);

        const currentTrack = stream.getVideoTracks()[0];
        const currentSettings = currentTrack?.getSettings();
        if (currentSettings?.deviceId) {
          setSelectedDeviceId(currentSettings.deviceId);
        }
      } catch (err: unknown) {
        setStatus("error");
        const error = err as { name?: string; message?: string };
        if (
          error.name === "NotAllowedError" ||
          error.name === "PermissionDeniedError"
        ) {
          setErrorMessage(
            "Camera permission was blocked. Please grant camera access in your browser settings to take photos.",
          );
        } else if (
          error.name === "NotFoundError" ||
          error.name === "DevicesNotFoundError"
        ) {
          setErrorMessage("No camera device was detected on your system.");
        } else {
          setErrorMessage(error.message || "Failed to initialize camera.");
        }
      }
    },
    [facingMode, stopStream],
  );

  useEffect(() => {
    if (open) {
      void startCamera();
    } else {
      stopStream();
      setCapturedImage(null);
      setCapturedBlob(null);
    }
    return () => {
      stopStream();
    };
  }, [open, startCamera, stopStream]);

  function handleCapture() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Always draw in natural/non-flipped orientation
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCapturedImage(dataUrl);
    canvas.toBlob(
      (blob) => {
        if (blob) setCapturedBlob(blob);
      },
      "image/jpeg",
      0.92,
    );
  }

  function handleRetake() {
    setCapturedImage(null);
    setCapturedBlob(null);
  }

  async function handleConfirm() {
    if (!capturedBlob) return;
    setProcessing(true);
    try {
      const file = new File([capturedBlob], `asset-photo-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });
      stopStream();
      await onCapture(file);
      onClose();
    } finally {
      setProcessing(false);
    }
  }

  function handleFlipCamera() {
    const nextMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextMode);

    // If multiple devices exist (e.g. desktop USB + Built-in webcams), cycle to next device as well
    if (devices.length > 1) {
      const currentIndex = devices.findIndex(
        (d) => d.deviceId === selectedDeviceId,
      );
      const nextIndex = (currentIndex + 1) % devices.length;
      const nextDevice = devices[nextIndex];
      if (nextDevice?.deviceId) {
        setSelectedDeviceId(nextDevice.deviceId);
        void startCamera(nextMode, nextDevice.deviceId);
        return;
      }
    }

    void startCamera(nextMode);
  }

  function handleClose() {
    stopStream();
    onClose();
  }

  return (
    <Dialog
      open={open}
      title="Take asset photo"
      description="Capture a photo using your camera to upload directly as the asset image."
      onClose={handleClose}
      wide
    >
      <div className="camera-modal">
        <div className="camera-viewfinder">
          {status === "error" ? (
            <div className="camera-error-box">
              <AlertCircle size={36} color="#ef4444" />
              <strong>Camera unavailable</strong>
              <p>{errorMessage}</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void startCamera(facingMode, selectedDeviceId)}
              >
                <RefreshCw size={15} /> Try again
              </Button>
            </div>
          ) : capturedImage ? (
            <img src={capturedImage} alt="Captured preview (Non-flipped)" />
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={facingMode === "user" ? "is-mirrored" : ""}
                style={{ display: status === "ready" ? "block" : "none" }}
              />
              {status === "loading" && (
                <div className="camera-error-box">
                  <RefreshCw size={28} className="spin" color="#3b82f6" />
                  <p>Requesting camera...</p>
                </div>
              )}
              {status === "ready" && (
                <>
                  <div className="camera-viewfinder__overlay">
                    <span className="camera-viewfinder__crosshair" />
                  </div>
                  <span className="camera-viewfinder__badge">
                    <span className="camera-viewfinder__pulse" />
                    {facingMode === "user" ? "FRONT CAMERA" : "BACK CAMERA"}
                  </span>
                  <div className="camera-viewfinder__actions">
                    <button
                      type="button"
                      className="camera-viewfinder__action-btn"
                      onClick={handleFlipCamera}
                      title="Flip camera (Front / Back)"
                      aria-label="Flip camera"
                    >
                      <SwitchCamera size={14} /> Flip camera
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="camera-toolbar">
          {capturedImage ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={handleRetake}
                disabled={processing}
              >
                <RotateCcw size={16} /> Retake
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => void handleConfirm()}
                loading={processing}
              >
                <Check size={16} /> Use this photo
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleFlipCamera}
                disabled={status !== "ready"}
                aria-label="Flip camera"
              >
                <SwitchCamera size={16} /> Flip camera
              </Button>
              <div className="camera-shutter-container">
                <button
                  type="button"
                  className="camera-shutter-btn"
                  onClick={handleCapture}
                  disabled={status !== "ready"}
                  aria-label="Capture photo"
                >
                  <Camera size={26} />
                </button>
              </div>
              <Button
                type="button"
                variant="quiet"
                size="sm"
                onClick={handleClose}
              >
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
