import {
  Archive,
  ArrowLeft,
  Camera,
  CopyPlus,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiClientError } from "../api";
import { useAuth } from "../auth";
import { CameraCaptureModal } from "../components/CameraCaptureModal";
import { RecognitionPhotosSection } from "../components/RecognitionPhotosSection";
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
import { recognitionApi } from "../recognitionApi";
import type { AssetDetail, ManagementArea } from "../types";

type FormValue = {
  name: string;
  managementAreaId: string;
  description: string;
  pictureUrl: string;
  totalQuantity: string;
  isActive: boolean;
};

const emptyForm: FormValue = {
  name: "",
  managementAreaId: "",
  description: "",
  pictureUrl: "",
  totalQuantity: "1",
  isActive: true,
};

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
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleImageUpload(file: File) {
    setUploadingImage(true);
    setUploadError("");
    try {
      const res = await api.uploadImage(file);
      setForm((prev) => ({ ...prev, pictureUrl: res.url }));
    } catch (caught) {
      setUploadError(
        caught instanceof Error ? caught.message : "Image upload failed",
      );
    } finally {
      setUploadingImage(false);
    }
  }

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
            managementAreaId: detail.managementArea.id,
            description: detail.description ?? "",
            pictureUrl: detail.pictureUrl ?? "",
            totalQuantity: String(detail.totalQuantity),
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

  function validate() {
    const nextFields: Record<string, string> = {};
    if (!form.name.trim()) nextFields.name = "Asset name is required";
    if (!form.managementAreaId)
      nextFields.managementAreaId = "Select a management area";
    if (
      !editing &&
      (Number.isNaN(Number(form.totalQuantity)) ||
        Number(form.totalQuantity) < 0)
    ) {
      nextFields.totalQuantity = "Quantity must be 0 or more";
    }
    setFields(nextFields);
    return Object.keys(nextFields).length === 0;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setError(null);
    try {
      if (editing && asset) {
        await api.updateAsset(asset.id, {
          name: form.name.trim(),
          managementAreaId: form.managementAreaId,
          description: form.description.trim() || null,
          pictureUrl: form.pictureUrl.trim() || null,
          expectedUpdatedAt: asset.updatedAt,
        });
        navigate(`/assets/${asset.id}`, {
          state: { notice: "Asset updated successfully" },
        });
      } else {
        const created = await api.createAsset({
          name: form.name.trim(),
          managementAreaId: form.managementAreaId,
          description: form.description.trim() || null,
          pictureUrl: form.pictureUrl.trim() || null,
          totalQuantity: Number(form.totalQuantity) || 0,
          isActive: true,
        });
        // Best-effort: if a photo was attached, use that same photo to
        // register this asset with the recognition service too, so it's
        // ready to recognize without a separate step. Never blocks/fails
        // asset creation itself -- the recognition service being slow or
        // unreachable shouldn't stop the user from adding the asset.
        if (form.pictureUrl.trim()) {
          try {
            const file = await recognitionApi.fetchAsFile(
              form.pictureUrl.trim(),
              `${created.id}.jpg`,
            );
            await recognitionApi.registerOrAddPhoto(created.id, created.name, file);
          } catch (caught) {
            console.warn("Could not register asset with recognition service:", caught);
          }
        }
        navigate(`/assets/${created.id}`, {
          state: { notice: "New asset created" },
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
          onCreated={(ids) =>
            navigate(ids[0] ? `/assets/${ids[0]}` : "/assets", {
              state: { notice: `Added ${ids.length} assets successfully` },
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
                  <p>Enter asset information, quantity, and assign a management area.</p>
                </div>
              </div>
              <Field label="Asset name" required error={fields.name}>
                <Input
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder="For example, Sony FX3 Cinema Camera"
                  maxLength={150}
                  required
                />
              </Field>
              <div className="form-grid form-grid--2">
                {!editing ? (
                  <Field
                    label="Asset quantity"
                    required
                    error={fields.totalQuantity}
                  >
                    <Input
                      type="number"
                      min={0}
                      value={form.totalQuantity}
                      onChange={(event) =>
                        setForm({ ...form, totalQuantity: event.target.value })
                      }
                      required
                    />
                  </Field>
                ) : (
                  <Field
                    label="Asset quantity"
                    hint="Adjust quantity from the asset details page"
                  >
                    <Input
                      value={`${asset?.totalQuantity ?? 0} units`}
                      disabled
                    />
                  </Field>
                )}
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

            <section className="form-section">
              <div className="form-section__heading">
                <span>02</span>
                <div>
                  <h2>Asset Photo</h2>
                  <p>Take a photo using your camera or upload an image file.</p>
                </div>
              </div>
              <Field label="Photo" error={fields.pictureUrl || uploadError}>
                <div
                  style={{
                    display: "flex",
                    gap: "14px",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  {form.pictureUrl && (
                    <img
                      src={form.pictureUrl}
                      alt="Preview"
                      style={{
                        width: "60px",
                        height: "60px",
                        borderRadius: "8px",
                        objectFit: "cover",
                        border: "1px solid var(--line)",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                      }}
                    />
                  )}
                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={uploadingImage}
                      onClick={() => setCameraOpen(true)}
                      style={{ whiteSpace: "nowrap" }}
                    >
                      <Camera size={17} /> Take photo
                    </Button>
                    <label
                      className="button button--secondary button--md"
                      style={{
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Upload size={17} />
                      {uploadingImage ? "Uploading..." : "Upload file"}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        disabled={uploadingImage}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleImageUpload(file);
                        }}
                      />
                    </label>
                    {form.pictureUrl && (
                      <Button
                        type="button"
                        variant="quiet"
                        onClick={() =>
                          setForm((prev) => ({ ...prev, pictureUrl: "" }))
                        }
                        style={{ color: "var(--red)", gap: "5px" }}
                      >
                        <X size={15} /> Remove photo
                      </Button>
                    )}
                  </div>
                </div>
              </Field>
            </section>

            {editing && asset && (
              <RecognitionPhotosSection assetId={asset.id} assetName={asset.name} />
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
              src={form.pictureUrl || null}
              name={form.name || "Asset"}
              large
            />
            <h3>{form.name || "Asset name"}</h3>
            <p>{form.description || "The description will appear here."}</p>
            <dl>
              <div>
                <dt>Area</dt>
                <dd>
                  {areas.find((area) => area.id === form.managementAreaId)
                    ?.name ?? "—"}
                </dd>
              </div>
              <div>
                <dt>Quantity</dt>
                <dd>
                  {editing ? asset?.totalQuantity : form.totalQuantity || 0}{" "}
                  units
                </dd>
              </div>
            </dl>
          </aside>
        </form>
      )}
      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => handleImageUpload(file)}
      />
    </div>
  );
}

type BatchRow = {
  key: number;
  name: string;
  description: string;
  pictureUrl: string;
  quantity: string;
};

function BatchAssetForm({
  areas,
  onCreated,
}: {
  areas: ManagementArea[];
  onCreated: (ids: string[]) => void;
}) {
  const [areaId, setAreaId] = useState(areas[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<BatchRow[]>([
    { key: 1, name: "", description: "", pictureUrl: "", quantity: "1" },
    { key: 2, name: "", description: "", pictureUrl: "", quantity: "1" },
  ]);
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

    const names = rows.map((row) => row.name.trim().toLowerCase());
    const duplicateIndex = names.findIndex((name, i) => names.indexOf(name) !== i);
    if (duplicateIndex !== -1) {
      setError(`Row ${duplicateIndex + 1} has a duplicate asset name.`);
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await api.createAssets(
        rows.map((row) => ({
          name: row.name.trim(),
          managementAreaId: areaId,
          description: row.description.trim() || null,
          pictureUrl: row.pictureUrl.trim() || null,
          totalQuantity: Number(row.quantity) || 0,
          isActive: true,
        })),
        description.trim() || undefined,
      );
      onCreated(response.data.map((asset) => asset.id));
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
            onClick={() =>
              setRows((current) => [
                ...current,
                {
                  key: Date.now(),
                  name: "",
                  description: "",
                  pictureUrl: "",
                  quantity: "1",
                },
              ])
            }
          >
            <Plus size={15} />
            Add another asset
          </Button>
        </div>
        <div className="batch-rows">
          {rows.map((row, index) => (
            <div className="batch-row" key={row.key}>
              <span className="batch-row__index">{index + 1}</span>
              <Field label="Asset name" required>
                <Input
                  value={row.name}
                  onChange={(event) =>
                    update(row.key, { name: event.target.value })
                  }
                  required
                />
              </Field>
              <Field label="Quantity">
                <Input
                  type="number"
                  min={0}
                  value={row.quantity}
                  onChange={(event) =>
                    update(row.key, { quantity: event.target.value })
                  }
                  required
                />
              </Field>
              <Field label="Description">
                <Input
                  value={row.description}
                  onChange={(event) =>
                    update(row.key, { description: event.target.value })
                  }
                />
              </Field>
              <Field label="Photo">
                <div
                  style={{
                    display: "flex",
                    gap: "6px",
                    alignItems: "center",
                  }}
                >
                  {row.pictureUrl ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <img
                        src={row.pictureUrl}
                        alt="Preview"
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "7px",
                          objectFit: "cover",
                          border: "1px solid var(--line)",
                        }}
                      />
                      <button
                        className="icon-button icon-button--danger"
                        type="button"
                        title="Remove photo"
                        aria-label={`Remove photo for row ${index + 1}`}
                        onClick={() => update(row.key, { pictureUrl: "" })}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ) : (
                    <>
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
                        style={{
                          cursor: "pointer",
                          display: "inline-grid",
                          placeItems: "center",
                        }}
                        title="Upload image file"
                        aria-label={`Upload image for row ${index + 1}`}
                      >
                        <Upload size={16} />
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              try {
                                const res = await api.uploadImage(file);
                                update(row.key, { pictureUrl: res.url });
                              } catch (caught) {
                                setError(
                                  caught instanceof Error
                                    ? caught.message
                                    : "Upload failed",
                                );
                              }
                            }
                          }}
                        />
                      </label>
                    </>
                  )}
                </div>
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
        onCapture={async (file) => {
          if (cameraRowKey === null) return;
          try {
            const res = await api.uploadImage(file);
            update(cameraRowKey, { pictureUrl: res.url });
          } catch (caught) {
            setError(
              caught instanceof Error ? caught.message : "Image upload failed",
            );
          }
        }}
      />
    </form>
  );
}
