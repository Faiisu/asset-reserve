import {
  Archive,
  ArrowLeft,
  Camera,
  CopyPlus,
  Plus,
  Save,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiClientError } from "../api";
import { useAuth } from "../auth";
import { AssetPhotosSection, type PendingPhoto } from "../components/AssetPhotosSection";
import { CameraCaptureModal } from "../components/CameraCaptureModal";
import {
  AssetPicture,
  Breadcrumb,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Select,
  Textarea,
} from "../components/ui";
import { recognitionApi, type RecognitionPhoto } from "../recognitionApi";
import type { AssetDetail, ManagementArea } from "../types";

type FormValue = {
  name: string;
  partNumber: string;
  managementAreaId: string;
  description: string;
  isActive: boolean;
};

const emptyForm: FormValue = {
  name: "",
  partNumber: "",
  managementAreaId: "",
  description: "",
  isActive: true,
};

function pendingIdFromKey(key: string): string | null {
  return key.startsWith("pending:") ? key.slice("pending:".length) : null;
}

function existingIdFromKey(key: string): string | null {
  return key.startsWith("existing:") ? key.slice("existing:".length) : null;
}

export function AssetFormPage() {
  const { assetId } = useParams();
  const editing = Boolean(assetId);
  const navigate = useNavigate();
  const { session, hasPermission, hasGlobalPermission, isGlobalAdmin } =
    useAuth();
  const [form, setForm] = useState<FormValue>(emptyForm);
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [areas, setAreas] = useState<ManagementArea[]>([]);
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  // Serial units to register immediately after a brand-new asset is
  // created -- create mode only. One POST /assets/{id}/units call right
  // after POST /assets, same "register units" endpoint the asset-details
  // page uses, just chained into this same submit instead of requiring a
  // separate trip to the new asset's detail page.
  const [unitSerialNumbers, setUnitSerialNumbers] = useState("");
  const [unitReason, setUnitReason] = useState("");

  // Unified asset-photos state: every photo (batch-uploaded or captured) is
  // both a potential thumbnail and a recognition reference photo. Staged
  // locally, same as every other field here -- nothing hits either the main
  // backend's upload endpoint or the recognition service until Save is
  // clicked (see resolvePictureUrl / syncAssetPhotos below).
  const [existingPhotos, setExistingPhotos] = useState<RecognitionPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photosError, setPhotosError] = useState("");
  const [pendingAdds, setPendingAdds] = useState<PendingPhoto[]>([]);
  const [removedExistingIds, setRemovedExistingIds] = useState<Set<string>>(new Set());
  const [thumbnailKey, setThumbnailKey] = useState<string | null>(null);
  const [initialThumbnailKey, setInitialThumbnailKey] = useState<string | null>(null);

  const permittedAreaIds = useMemo(() => {
    if (
      isGlobalAdmin ||
      hasGlobalPermission("asset:create") ||
      session?.effectivePermissions?.global?.includes("asset:create")
    ) {
      return null;
    }
    return new Set(
      session?.effectivePermissions?.byManagementArea
        ?.filter((area) => area.permissions.includes("asset:create"))
        ?.map((area) => area.managementAreaId) ?? [],
    );
  }, [session, isGlobalAdmin, hasGlobalPermission]);

  const visibleAreas = useMemo(() => {
    if (permittedAreaIds === null) return areas;
    return areas.filter((area) => permittedAreaIds.has(area.id));
  }, [areas, permittedAreaIds]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const requests: [
      Promise<{ data: ManagementArea[] }>,
      Promise<AssetDetail | null>,
    ] = [
      api.areas(),
      assetId ? api.asset(assetId) : Promise.resolve(null),
    ];
    void Promise.all(requests)
      .then(([areaResponse, detail]) => {
        if (!active) return;
        setAreas(areaResponse.data);
        if (detail) {
          setAsset(detail);
          setForm({
            name: detail.name,
            partNumber: detail.partNumber ?? "",
            managementAreaId: detail.managementArea.id,
            description: detail.description ?? "",
            isActive: detail.isActive,
          });
        } else if (areaResponse.data.length > 0) {
          setForm((current) => ({
            ...current,
            managementAreaId:
              current.managementAreaId || areaResponse.data[0].id,
          }));
        }
      })
      .catch(setError)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [assetId]);

  // Loads this asset's existing recognition photos + which one is currently
  // the thumbnail (extra.mainPhotoId), once, when editing. Falls back to the
  // first photo if mainPhotoId is missing or stale.
  useEffect(() => {
    if (!assetId) return;
    let active = true;
    setPhotosLoading(true);
    Promise.all([recognitionApi.listPhotos(assetId), recognitionApi.getAsset(assetId)])
      .then(([photos, recognitionAsset]) => {
        if (!active) return;
        setExistingPhotos(photos);
        const mainPhotoId =
          recognitionAsset && typeof recognitionAsset.extra.mainPhotoId === "string"
            ? recognitionAsset.extra.mainPhotoId
            : undefined;
        const initialKey =
          mainPhotoId && photos.some((p) => p.photo_id === mainPhotoId)
            ? `existing:${mainPhotoId}`
            : photos[0]
              ? `existing:${photos[0].photo_id}`
              : null;
        setThumbnailKey(initialKey);
        setInitialThumbnailKey(initialKey);
      })
      .catch((caught) => {
        if (active) {
          setPhotosError(
            caught instanceof Error ? caught.message : "Could not load photos",
          );
        }
      })
      .finally(() => {
        if (active) setPhotosLoading(false);
      });
    return () => {
      active = false;
    };
  }, [assetId]);

  // Keeps the thumbnail selection valid as photos are added/removed: falls
  // back to the first remaining photo whenever the current selection no
  // longer exists (including the very first photo ever added, in create
  // mode -- this is what makes "first photo = thumbnail" the default).
  useEffect(() => {
    const visibleExisting = existingPhotos.filter((p) => !removedExistingIds.has(p.photo_id));
    const combinedKeys = [
      ...visibleExisting.map((p) => `existing:${p.photo_id}`),
      ...pendingAdds.map((p) => `pending:${p.id}`),
    ];
    if (thumbnailKey && combinedKeys.includes(thumbnailKey)) return;
    setThumbnailKey(combinedKeys[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingPhotos, removedExistingIds, pendingAdds]);

  useEffect(() => {
    if (!editing && visibleAreas.length > 0) {
      setForm((current) => {
        if (
          !current.managementAreaId ||
          !visibleAreas.some((a) => a.id === current.managementAreaId)
        ) {
          return { ...current, managementAreaId: visibleAreas[0].id };
        }
        return current;
      });
    }
  }, [editing, visibleAreas]);

  // Live preview of the currently-selected thumbnail, before anything is
  // actually uploaded. Existing photos are just a plain URL; a selected
  // pending (not-yet-uploaded) file needs a local blob URL, memoized on the
  // selected File itself and released whenever the selection changes.
  const selectedPendingFile = useMemo(() => {
    const id = thumbnailKey ? pendingIdFromKey(thumbnailKey) : null;
    if (!id) return null;
    return pendingAdds.find((p) => p.id === id)?.file ?? null;
  }, [thumbnailKey, pendingAdds]);
  // Create AND revoke inside the same effect (not useMemo + a separate
  // cleanup effect) so the URL survives React 18 StrictMode's dev-only
  // double-invoke -- see the matching comment on PendingPhotoThumb in
  // AssetPhotosSection.tsx for why the useMemo version silently breaks.
  const [selectedPendingPreviewUrl, setSelectedPendingPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedPendingFile) {
      setSelectedPendingPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedPendingFile);
    setSelectedPendingPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedPendingFile]);
  const previewSrc = useMemo(() => {
    if (selectedPendingPreviewUrl) return selectedPendingPreviewUrl;
    const existingId = thumbnailKey ? existingIdFromKey(thumbnailKey) : null;
    if (existingId) {
      const photo = existingPhotos.find((p) => p.photo_id === existingId);
      if (photo) return recognitionApi.imageSrc(photo.image_url);
    }
    return null;
  }, [selectedPendingPreviewUrl, thumbnailKey, existingPhotos]);

  function handleAddFiles(files: File[]) {
    setPendingAdds((current) => [
      ...current,
      ...files.map((file) => ({ id: crypto.randomUUID(), file })),
    ]);
  }

  function validate() {
    const nextFields: Record<string, string> = {};
    if (!form.name.trim()) {
      nextFields.name = "Asset name is required";
    } else if (form.name.trim().length > 40) {
      nextFields.name = "Asset name must be 40 characters or fewer";
    }
    if (form.partNumber.trim().length > 100) {
      nextFields.partNumber = "Part number must be 100 characters or fewer";
    }
    if (!form.managementAreaId)
      nextFields.managementAreaId = "Select a management area";
    if (!editing) {
      const parsedUnitSerials = unitSerialNumbers
        .split(/[\n,]/)
        .map((value) => value.trim())
        .filter(Boolean);
      if (parsedUnitSerials.length > 200) {
        nextFields.unitSerialNumbers = "Register at most 200 serial numbers at once";
      }
    }
    setFields(nextFields);
    return Object.keys(nextFields).length === 0;
  }

  // Resolves the currently-selected thumbnail into a real pictureUrl the
  // main backend can store, uploading to /uploads/ only when actually
  // needed:
  //  - a newly-added (pending) file -> upload it now, first time.
  //  - an existing photo the user didn't change -> reuse asset.pictureUrl
  //    as-is, no redundant re-upload.
  //  - an existing photo the user just switched TO as the new thumbnail ->
  //    pull its bytes back from the recognition service and upload fresh
  //    (the main app keeps its own copy, independent of recognition-service
  //    uptime, same reasoning as the original single-photo design).
  async function resolvePictureUrl(): Promise<string | null> {
    if (!thumbnailKey) return null;
    const pendingId = pendingIdFromKey(thumbnailKey);
    if (pendingId) {
      const pending = pendingAdds.find((p) => p.id === pendingId);
      if (!pending) return null;
      const res = await api.uploadImage(pending.file);
      return res.url;
    }
    const existingId = existingIdFromKey(thumbnailKey);
    if (!existingId) return null;
    if (editing && thumbnailKey === initialThumbnailKey) {
      return asset?.pictureUrl ?? null;
    }
    const photo = existingPhotos.find((p) => p.photo_id === existingId);
    if (!photo) return null;
    const file = await recognitionApi.fetchAsFile(
      recognitionApi.imageSrc(photo.image_url),
      `${existingId}.jpg`,
    );
    const res = await api.uploadImage(file);
    return res.url;
  }

  // Applies every staged photo change in one go, at Save time -- never
  // before. Best-effort throughout: the recognition service being slow or
  // unreachable, or one particular photo failing, should never block the
  // asset save itself (already succeeded by the time this runs) or stop the
  // other staged changes from being attempted.
  async function syncAssetPhotos(assetId: string, name: string) {
    const failures: string[] = [];
    let assetDeleted = false;

    // 1. Add new photos FIRST. Order matters: adding before removing means a
    // removal can never be blocked by "this is the asset's only remaining
    // photo" when there's really a net gain in photo count.
    const pendingServerIds = new Map<string, string>();
    for (const pending of pendingAdds) {
      try {
        const newId = await recognitionApi.registerOrAddPhoto(
          assetId,
          name,
          pending.file,
          pending.file.name || "photo.jpg",
        );
        pendingServerIds.set(pending.id, newId);
      } catch (caught) {
        failures.push(caught instanceof Error ? caught.message : `Could not add ${pending.file.name}`);
      }
    }

    // 2. Apply removals.
    for (const photoId of removedExistingIds) {
      try {
        await recognitionApi.deletePhoto(assetId, photoId);
      } catch (caught) {
        if (caught instanceof ApiClientError && caught.status === 400) {
          // Genuinely the only photo left -- remove the whole entry rather
          // than leave an orphan the service won't delete piecemeal.
          try {
            await recognitionApi.deleteAsset(assetId);
            assetDeleted = true;
          } catch (deleteCaught) {
            failures.push(
              deleteCaught instanceof Error ? deleteCaught.message : "Could not remove the recognition entry",
            );
          }
        } else {
          failures.push(caught instanceof Error ? caught.message : "Could not remove a photo");
        }
      }
    }

    // 3. Resolve and persist the final thumbnail pointer.
    if (!assetDeleted && thumbnailKey) {
      const pendingId = pendingIdFromKey(thumbnailKey);
      const finalPhotoId = pendingId ? pendingServerIds.get(pendingId) : existingIdFromKey(thumbnailKey);
      if (finalPhotoId) {
        try {
          await recognitionApi.updateAsset(assetId, { extra: { mainPhotoId: finalPhotoId } });
        } catch (caught) {
          failures.push(caught instanceof Error ? caught.message : "Could not save recognition metadata");
        }
      }
    }

    if (failures.length > 0) {
      console.warn("Asset photo sync had issues:", failures);
    }
    setPendingAdds([]);
    setRemovedExistingIds(new Set());
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setError(null);
    try {
      if (editing && asset) {
        const pictureUrl = await resolvePictureUrl();
        await api.updateAsset(asset.id, {
          name: form.name.trim(),
          partNumber: form.partNumber.trim() || null,
          managementAreaId: form.managementAreaId,
          description: form.description.trim() || null,
          pictureUrl,
          expectedUpdatedAt: asset.updatedAt,
        });
        await syncAssetPhotos(asset.id, form.name.trim());
        navigate(`/assets/${asset.id}`, {
          state: { notice: "Asset updated successfully" },
        });
      } else {
        // The selected thumbnail (if any) needs a real /uploads/ URL before
        // the asset can be created -- there are no "existing" photos to pick
        // from yet, so this only ever resolves a pending file.
        let pictureUrl: string | null = null;
        const pendingId = thumbnailKey ? pendingIdFromKey(thumbnailKey) : null;
        if (pendingId) {
          const pending = pendingAdds.find((p) => p.id === pendingId);
          if (pending) {
            const res = await api.uploadImage(pending.file);
            pictureUrl = res.url;
          }
        }

        const created = await api.createAsset({
          name: form.name.trim(),
          partNumber: form.partNumber.trim() || null,
          managementAreaId: form.managementAreaId,
          description: form.description.trim() || null,
          pictureUrl,
          isActive: true,
        });

        // Best-effort: register every attached photo with the recognition
        // service, tracking whichever one was chosen as the thumbnail.
        // Never blocks/fails asset creation itself.
        if (pendingAdds.length > 0) {
          let mainPhotoId: string | undefined;
          for (const pending of pendingAdds) {
            try {
              const newId = await recognitionApi.registerOrAddPhoto(
                created.id,
                created.name,
                pending.file,
                pending.file.name || "photo.jpg",
              );
              if (thumbnailKey === `pending:${pending.id}`) mainPhotoId = newId;
            } catch (caught) {
              console.warn(`Could not register photo ${pending.file.name} with recognition service:`, caught);
            }
          }
          if (mainPhotoId) {
            try {
              await recognitionApi.updateAsset(created.id, { extra: { mainPhotoId } });
            } catch (caught) {
              console.warn("Could not save recognition metadata:", caught);
            }
          }
        }

        // Register any serial units entered on this same form. The asset
        // itself is already created at this point, so a failure here must
        // not be silently swallowed like the best-effort photo sync above
        // -- surface it in the redirect notice so the user knows to retry
        // from the new asset's details page instead.
        const parsedUnitSerials = unitSerialNumbers
          .split(/[\n,]/)
          .map((value) => value.trim())
          .filter(Boolean);
        let unitWarning: string | null = null;
        if (parsedUnitSerials.length > 0) {
          try {
            await api.registerAssetUnits(
              created.id,
              parsedUnitSerials,
              unitReason.trim() || undefined,
            );
          } catch (caught) {
            unitWarning =
              caught instanceof ApiClientError
                ? caught.message
                : "Could not register the serial units";
          }
        }

        navigate(`/assets/${created.id}`, {
          state: {
            notice: unitWarning
              ? `New asset created. ${unitWarning} -- register the units again from this page.`
              : "New asset created",
          },
        });
      }
    } catch (caught) {
      if (caught instanceof ApiClientError) setFields(caught.fields);
      setError(caught);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-stack page-stack--form">
      <Breadcrumb
        items={[
          { label: "Assets", to: "/assets" },
          { label: editing ? `Edit ${asset?.name ?? ""}` : "Add asset" },
        ]}
      />

      <header className="page-header">
        <div>
          <h1>{editing ? `Edit ${asset?.name ?? "asset"}` : "Add new asset"}</h1>
          <p className="page-header__description">
            {editing
              ? "Update asset details and workspace location."
              : "Register an asset into your workspace inventory."}
          </p>
        </div>
        <div className="page-header__actions">
          <Link
            className="button button--secondary button--md"
            to={editing ? `/assets/${assetId}` : "/assets"}
          >
            <ArrowLeft size={16} />
            Cancel
          </Link>
        </div>
      </header>

      {!editing && hasPermission("asset:create") && (
        <div className="segmented" role="tablist" aria-label="Creation mode">
          <button
            role="tab"
            aria-selected={mode === "single"}
            className={mode === "single" ? "segmented--active" : ""}
            onClick={() => setMode("single")}
            type="button"
          >
            <Plus size={15} />
            Single asset
          </button>
          <button
            role="tab"
            aria-selected={mode === "batch"}
            className={mode === "batch" ? "segmented--active" : ""}
            onClick={() => setMode("batch")}
            type="button"
          >
            <CopyPlus size={15} />
            Multiple assets (Batch)
          </button>
        </div>
      )}

      {loading ? (
        <LoadingState label="Loading asset form" />
      ) : error ? (
        <ErrorState error={error} onRetry={() => navigate(0)} />
      ) : visibleAreas.length === 0 ? (
        <EmptyState
          icon={Archive}
          title="No management areas available"
          description="You do not have permission to add assets to any management area, or no management areas exist yet."
        />
      ) : mode === "batch" && !editing ? (
        <BatchAssetForm
          areas={visibleAreas}
          onCreated={(ids, unitWarning) =>
            navigate(ids[0] ? `/assets/${ids[0]}` : "/assets", {
              state: {
                notice: unitWarning
                  ? `Added ${ids.length} assets successfully. ${unitWarning}`
                  : `Added ${ids.length} assets successfully`,
              },
            })
          }
        />
      ) : (
        <form className="record-form" onSubmit={submit}>
          <div className="record-form__main">
            <section className="form-section">
              <div className="form-section__heading">
                <span>01</span>
                <div>
                  <h2>Asset details</h2>
                  <p>Enter asset information and assign a management area.</p>
                </div>
              </div>
              <Field
                label="Asset name"
                required
                hint={`${form.name.length}/40`}
                error={fields.name}
              >
                <Input
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder="For example, Sony FX3 Cinema Camera"
                  maxLength={40}
                  required
                />
              </Field>
              <div className="form-grid form-grid--2">
                <Field
                  label="Part number (P/N)"
                  hint={`${form.partNumber.length}/100`}
                  error={fields.partNumber}
                >
                  <Input
                    value={form.partNumber}
                    onChange={(event) =>
                      setForm({ ...form, partNumber: event.target.value })
                    }
                    placeholder="For example, EPS-PRJ-100"
                    maxLength={100}
                  />
                </Field>
                <Field
                  label="Management area"
                  required
                  error={fields.managementAreaId}
                >
                  <Select
                    value={form.managementAreaId}
                    onChange={(event) =>
                      setForm({ ...form, managementAreaId: event.target.value })
                    }
                    required
                  >
                    <option value="">Select a management area</option>
                    {visibleAreas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                {editing && (
                  <Field
                    label="Asset quantity"
                    hint="Register or retire serial units from the asset details page"
                  >
                    <Input
                      value={`${asset?.totalQuantity ?? 0} units`}
                      disabled
                    />
                  </Field>
                )}
              </div>
              <Field label="Description" error={fields.description}>
                <Textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  placeholder="Asset specifications, model numbers, included accessories, or storage location."
                  rows={3}
                />
              </Field>
            </section>

            <AssetPhotosSection
              existingPhotos={existingPhotos}
              removedExistingIds={removedExistingIds}
              pendingAdds={pendingAdds}
              thumbnailKey={thumbnailKey}
              loading={photosLoading}
              error={photosError}
              onAddFiles={handleAddFiles}
              onRemoveExisting={(photoId) =>
                setRemovedExistingIds((current) => new Set(current).add(photoId))
              }
              onRemovePending={(id) =>
                setPendingAdds((current) => current.filter((p) => p.id !== id))
              }
              onSelectThumbnail={setThumbnailKey}
            />

            {!editing && (
              <section className="form-section">
                <div className="form-section__heading">
                  <span>03</span>
                  <div>
                    <h2>Serial units (optional)</h2>
                    <p>
                      Register the physical, serial-numbered units for this
                      asset now, or skip and register them later from the
                      asset details page.
                    </p>
                  </div>
                </div>
                <Field
                  label="Serial numbers"
                  hint="One per line, or comma-separated"
                  error={fields.unitSerialNumbers}
                >
                  <Textarea
                    value={unitSerialNumbers}
                    onChange={(event) => setUnitSerialNumbers(event.target.value)}
                    placeholder={"One serial number per line, e.g.\nSN-001\nSN-002"}
                    rows={3}
                  />
                </Field>
                <Field label="Reason">
                  <Input
                    value={unitReason}
                    onChange={(event) => setUnitReason(event.target.value)}
                    placeholder="For example, new stock received"
                    maxLength={2000}
                  />
                </Field>
              </section>
            )}

            <div className="form-submit">
              <Button type="submit" loading={submitting}>
                <Save size={17} />
                {editing ? "Save changes" : "Add asset"}
              </Button>
            </div>
          </div>

          <aside className="record-preview">
            <p className="eyebrow">Live preview</p>
            <AssetPicture
              src={previewSrc}
              name={form.name || "Asset"}
              large
            />
            <h3>{form.name || "Asset name"}</h3>
            <p>{form.description || "The description will appear here."}</p>
            <dl>
              <div>
                <dt>P/N</dt>
                <dd>{form.partNumber || "—"}</dd>
              </div>
              <div>
                <dt>Area</dt>
                <dd>
                  {areas.find((area) => area.id === form.managementAreaId)
                    ?.name ?? "—"}
                </dd>
              </div>
              <div>
                <dt>Quantity</dt>
                <dd>{asset?.totalQuantity ?? 0} units</dd>
              </div>
            </dl>
          </aside>
        </form>
      )}
    </div>
  );
}

type BatchRow = {
  key: number;
  name: string;
  partNumber: string;
  description: string;
  // Every photo attached to a row is both a potential thumbnail AND a
  // recognition reference photo -- same model as the single-asset form, just
  // duplicated per row. Nothing is uploaded anywhere until Add assets is
  // clicked (see submit below): thumbnailId picks which one becomes the
  // asset's pictureUrl.
  photos: PendingPhoto[];
  thumbnailId: string | null;
  // Serial numbers to register for this row's asset right after it's
  // created, one POST /assets/{id}/units call per row -- same pattern as
  // the single-asset form's "Serial units" section.
  serialNumbers: string;
};

function newBatchRow(key: number): BatchRow {
  return {
    key,
    name: "",
    partNumber: "",
    description: "",
    photos: [],
    thumbnailId: null,
    serialNumbers: "",
  };
}

function BatchAssetForm({
  areas,
  onCreated,
}: {
  areas: ManagementArea[];
  onCreated: (ids: string[], unitWarning?: string) => void;
}) {
  const [areaId, setAreaId] = useState(areas[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<BatchRow[]>([newBatchRow(1), newBatchRow(2)]);
  const [submitting, setSubmitting] = useState(false);
  const [cameraRowKey, setCameraRowKey] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!areaId && areas.length > 0) {
      setAreaId(areas[0].id);
    }
  }, [areas, areaId]);

  function update(key: number, values: Partial<BatchRow>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...values } : row)),
    );
  }

  function addRowPhotos(key: number, files: File[]) {
    if (files.length === 0) return;
    setRows((current) =>
      current.map((row) => {
        if (row.key !== key) return row;
        const added = files.map((file) => ({ id: crypto.randomUUID(), file }));
        return {
          ...row,
          photos: [...row.photos, ...added],
          // First photo ever added to a row becomes its thumbnail by default.
          thumbnailId: row.thumbnailId ?? added[0].id,
        };
      }),
    );
  }

  function removeRowPhoto(key: number, photoId: string) {
    setRows((current) =>
      current.map((row) => {
        if (row.key !== key) return row;
        const photos = row.photos.filter((p) => p.id !== photoId);
        const thumbnailId =
          row.thumbnailId === photoId ? (photos[0]?.id ?? null) : row.thumbnailId;
        return { ...row, photos, thumbnailId };
      }),
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!areaId) {
      setError("Please select a management area.");
      return;
    }
    const emptyNameIndex = rows.findIndex((row) => !row.name.trim());
    if (emptyNameIndex !== -1) {
      setError(`Row ${emptyNameIndex + 1} requires an asset name.`);
      return;
    }

    const invalidLengthIndex = rows.findIndex(
      (row) => row.name.trim().length > 40,
    );
    if (invalidLengthIndex !== -1) {
      setError(
        `Row ${invalidLengthIndex + 1}: Asset name must be 40 characters or fewer.`,
      );
      return;
    }

    const invalidPartNumberIndex = rows.findIndex(
      (row) => row.partNumber.trim().length > 100,
    );
    if (invalidPartNumberIndex !== -1) {
      setError(
        `Row ${invalidPartNumberIndex + 1}: Part number must be 100 characters or fewer.`,
      );
      return;
    }

    const names = rows.map((row) => row.name.trim().toLowerCase());
    const duplicateIndex = names.findIndex((name, i) => names.indexOf(name) !== i);
    if (duplicateIndex !== -1) {
      setError(`Row ${duplicateIndex + 1} has a duplicate asset name.`);
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      // Resolve each row's chosen thumbnail to a real /uploads/ URL first --
      // the asset needs a pictureUrl at creation time, independent of
      // whether the recognition service is reachable.
      const pictureUrls = await Promise.all(
        rows.map(async (row) => {
          const thumb =
            row.photos.find((p) => p.id === row.thumbnailId) ?? row.photos[0];
          if (!thumb) return null;
          const res = await api.uploadImage(thumb.file);
          return res.url;
        }),
      );

      const response = await api.createAssets(
        rows.map((row, i) => ({
          name: row.name.trim(),
          partNumber: row.partNumber.trim() || null,
          managementAreaId: areaId,
          description: row.description.trim() || null,
          pictureUrl: pictureUrls[i],
          isActive: true,
        })),
        description.trim() || undefined,
      );
      const created = response.data;

      // Best-effort, per row: register every attached photo with the
      // recognition service, tracking whichever one was chosen as the
      // thumbnail. Never blocks/fails asset creation itself -- created
      // assets and their rows line up by submitted order.
      await Promise.all(
        rows.map(async (row, i) => {
          const assetId = created[i]?.id;
          if (!assetId || row.photos.length === 0) return;
          const thumb =
            row.photos.find((p) => p.id === row.thumbnailId) ?? row.photos[0];
          let mainPhotoId: string | undefined;
          for (const photo of row.photos) {
            try {
              const newId = await recognitionApi.registerOrAddPhoto(
                assetId,
                row.name.trim(),
                photo.file,
                photo.file.name || "photo.jpg",
              );
              if (thumb && photo.id === thumb.id) mainPhotoId = newId;
            } catch (caught) {
              console.warn(`Could not register a photo for "${row.name}":`, caught);
            }
          }
          if (mainPhotoId) {
            try {
              await recognitionApi.updateAsset(assetId, { extra: { mainPhotoId } });
            } catch (caught) {
              console.warn("Could not save recognition metadata:", caught);
            }
          }
        }),
      );

      // Register each row's serial units against its newly-created asset.
      // Unlike photos this isn't best-effort-and-forget: collect failures
      // and surface them in the redirect notice, since the units just
      // typed in are lost from this form once we navigate away.
      const unitFailures: string[] = [];
      await Promise.all(
        rows.map(async (row, i) => {
          const assetId = created[i]?.id;
          const parsedSerials = row.serialNumbers
            .split(/[\n,]/)
            .map((value) => value.trim())
            .filter(Boolean);
          if (!assetId || parsedSerials.length === 0) return;
          try {
            await api.registerAssetUnits(assetId, parsedSerials);
          } catch (caught) {
            unitFailures.push(
              `"${row.name.trim()}" (${
                caught instanceof ApiClientError
                  ? caught.message
                  : "could not register units"
              })`,
            );
          }
        }),
      );

      onCreated(
        created.map((asset) => asset.id),
        unitFailures.length > 0
          ? `Could not register units for: ${unitFailures.join(", ")}. Register them again from each asset's details page.`
          : undefined,
      );
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "Unable to add assets",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="batch-form" onSubmit={submit}>
      {error && (
        <div className="form-alert" role="alert">
          {error}
        </div>
      )}
      <section className="form-section">
        <div className="form-section__heading">
          <span>01</span>
          <div>
            <h2>Workspace settings</h2>
            <p>All batch assets will be assigned to this management area.</p>
          </div>
        </div>
        <div className="form-grid form-grid--2">
          <Field label="Management area" required>
            <Select
              value={areaId}
              onChange={(event) => setAreaId(event.target.value)}
              required
            >
              <option value="">Select an area</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Batch note">
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="For example, New lab gear intake"
            />
          </Field>
        </div>
      </section>
      <section className="form-section">
        <div className="form-section__heading form-section__heading--action">
          <span>02</span>
          <div>
            <h2>Assets to add</h2>
            <p>Enter the asset names, descriptions, photos, and quantities.</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setRows((current) => [...current, newBatchRow(Date.now())])}
          >
            <Plus size={15} />
            Add another asset
          </Button>
        </div>
        <div className="batch-rows">
          {rows.map((row, index) => (
            <div className="batch-row" key={row.key}>
              <div className="batch-row__header">
                <span className="batch-row__index">{index + 1}</span>
                <Field
                  label="Asset name"
                  required
                  hint={`${row.name.length}/40`}
                  className="batch-row__field--name"
                >
                  <Input
                    value={row.name}
                    onChange={(event) =>
                      update(row.key, { name: event.target.value })
                    }
                    placeholder="Asset name"
                    maxLength={40}
                    required
                  />
                </Field>
                <Field label="P/N" className="batch-row__field--part-number">
                  <Input
                    value={row.partNumber}
                    onChange={(event) =>
                      update(row.key, { partNumber: event.target.value })
                    }
                    placeholder="Part number"
                    maxLength={100}
                  />
                </Field>
                <Field label="Description" className="batch-row__field--description">
                  <Input
                    value={row.description}
                    onChange={(event) =>
                      update(row.key, { description: event.target.value })
                    }
                  />
                </Field>
                <button
                  className="icon-button icon-button--danger"
                  type="button"
                  disabled={rows.length === 1}
                  onClick={() =>
                    setRows((current) =>
                      current.filter((item) => item.key !== row.key),
                    )
                  }
                  aria-label={`Remove row ${index + 1}`}
                >
                  <Trash2 size={17} />
                </button>
              </div>

              <Field
                label="Serial numbers (optional)"
                hint="One per line, or comma-separated"
              >
                <Textarea
                  value={row.serialNumbers}
                  onChange={(event) =>
                    update(row.key, { serialNumbers: event.target.value })
                  }
                  placeholder={"One serial number per line, e.g.\nSN-001\nSN-002"}
                  rows={2}
                />
              </Field>

              <Field label="Photos" hint="First photo is used as the thumbnail -- pick another with the star.">
                <div className="batch-row__photos">
                  {row.photos.map((photo) => (
                    <BatchPhotoThumb
                      key={photo.id}
                      file={photo.file}
                      isThumbnail={row.thumbnailId === photo.id}
                      onRemove={() => removeRowPhoto(row.key, photo.id)}
                      onSelectThumbnail={() => update(row.key, { thumbnailId: photo.id })}
                    />
                  ))}
                  <button
                    className="icon-button"
                    type="button"
                    title="Take photo with camera"
                    aria-label={`Take photo for row ${index + 1}`}
                    onClick={() => setCameraRowKey(row.key)}
                  >
                    <Camera size={16} />
                  </button>
                  <label
                    className="icon-button"
                    style={{ cursor: "pointer", display: "inline-grid", placeItems: "center" }}
                    title="Upload image files"
                    aria-label={`Upload images for row ${index + 1}`}
                  >
                    <Upload size={16} />
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      style={{ display: "none" }}
                      onChange={(event) => {
                        // Snapshot before clearing .value -- input.files can
                        // be a live FileList mutated in place by the reset.
                        const files = event.target.files ? Array.from(event.target.files) : [];
                        event.target.value = "";
                        addRowPhotos(row.key, files);
                      }}
                    />
                  </label>
                </div>
              </Field>
            </div>
          ))}
        </div>
      </section>
      <div className="form-submit">
        <Button type="submit" loading={submitting}>
          <Plus size={17} />
          Add {rows.length} assets
        </Button>
      </div>
      <CameraCaptureModal
        open={cameraRowKey !== null}
        onClose={() => setCameraRowKey(null)}
        onCapture={(file) => {
          if (cameraRowKey === null) return;
          addRowPhotos(cameraRowKey, [file]);
          setCameraRowKey(null);
        }}
      />
    </form>
  );
}

// Compact per-row photo preview for the batch form -- every photo here is
// always "pending" (batch rows never have existing/uploaded-already photos),
// so this only needs a blob-URL preview, not AssetPhotosSection's
// existing-vs-pending split. Memoized per File instance and revoked on
// unmount, same leak-avoidance pattern as AssetPhotosSection's version.
function BatchPhotoThumb({
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
  // Create AND revoke the blob URL inside the same effect -- see the
  // matching comment on AssetPhotosSection's PendingPhotoThumb for why a
  // useMemo-created URL + separate cleanup effect breaks under React 18
  // StrictMode's dev-only double-invoke (the preview silently fails to
  // load because the URL gets revoked with no replacement created).
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  if (!src) return null;

  return (
    <div style={{ position: "relative", width: "48px", height: "48px" }}>
      <img
        src={src}
        alt="Asset"
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "7px",
          objectFit: "cover",
          border: isThumbnail ? "2px solid var(--blue)" : "1px solid var(--line)",
        }}
      />
      <button
        type="button"
        title={isThumbnail ? "Thumbnail photo" : "Use as thumbnail"}
        aria-label={isThumbnail ? "This is the thumbnail photo" : "Use as thumbnail"}
        aria-pressed={isThumbnail}
        onClick={onSelectThumbnail}
        style={{
          position: "absolute",
          top: "-7px",
          left: "-7px",
          width: "18px",
          height: "18px",
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
        <Star size={10} fill={isThumbnail ? "currentColor" : "none"} />
      </button>
      <button
        type="button"
        className="icon-button icon-button--danger"
        title="Remove this photo"
        aria-label="Remove this photo"
        onClick={onRemove}
        style={{
          position: "absolute",
          top: "-7px",
          right: "-7px",
          width: "18px",
          height: "18px",
          background: "var(--surface)",
          borderRadius: "50%",
          boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
        }}
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}
