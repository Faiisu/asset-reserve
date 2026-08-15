import { Archive, ArrowLeft, CopyPlus, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiClientError } from "../api";
import { useAuth } from "../auth";
import {
  AssetPicture,
  Breadcrumb,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Select,
  Textarea,
  cx,
} from "../components/ui";
import type {
  AssetDetail,
  AssetInput,
  AssetTemplate,
  ManagementArea,
} from "../types";

type FormValue = {
  name: string;
  managementAreaId: string;
  assetTemplateId: string;
  description: string;
  pictureUrl: string;
  totalQuantity: string;
  isActive: boolean;
};

const emptyForm: FormValue = {
  name: "",
  managementAreaId: "",
  assetTemplateId: "",
  description: "",
  pictureUrl: "",
  totalQuantity: "0",
  isActive: true,
};

export function AssetFormPage() {
  const { assetId } = useParams();
  const editing = Boolean(assetId);
  const navigate = useNavigate();
  const { session, hasPermission } = useAuth();
  const [form, setForm] = useState<FormValue>(emptyForm);
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [areas, setAreas] = useState<ManagementArea[]>([]);
  const [templates, setTemplates] = useState<AssetTemplate[]>([]);
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const permittedAreaIds = useMemo(() => {
    if (session?.effectivePermissions.global.includes("asset:create"))
      return null;
    return new Set(
      session?.effectivePermissions.byManagementArea
        .filter((area) => area.permissions.includes("asset:create"))
        .map((area) => area.managementAreaId),
    );
  }, [session]);
  const visibleAreas =
    permittedAreaIds === null
      ? areas
      : areas.filter((area) => permittedAreaIds.has(area.id));

  useEffect(() => {
    let active = true;
    setLoading(true);
    const requests: [
      Promise<{ data: ManagementArea[] }>,
      Promise<{ data: AssetTemplate[] }>,
      Promise<AssetDetail | null>,
    ] = [
      api.areas(),
      api.templates(),
      assetId ? api.asset(assetId) : Promise.resolve(null),
    ];
    void Promise.all(requests)
      .then(([areaResponse, templateResponse, detail]) => {
        if (!active) return;
        setAreas(areaResponse.data);
        setTemplates(templateResponse.data);
        if (detail) {
          setAsset(detail);
          setForm({
            name: detail.name,
            managementAreaId: detail.managementArea.id,
            assetTemplateId: detail.assetTemplate?.id ?? "",
            description: detail.description ?? "",
            pictureUrl: detail.pictureUrl ?? "",
            totalQuantity: String(detail.totalQuantity),
            isActive: detail.isActive,
          });
        } else if (areaResponse.data.length) {
          const first =
            permittedAreaIds === null
              ? areaResponse.data[0]
              : areaResponse.data.find((area) => permittedAreaIds.has(area.id));
          setForm((current) => ({
            ...current,
            managementAreaId: first?.id ?? "",
          }));
        }
      })
      .catch(setError)
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [assetId, permittedAreaIds]);

  if (loading)
    return (
      <LoadingState
        label={editing ? "Loading asset" : "Preparing form"}
      />
    );
  if (error && !asset) return <ErrorState error={error} />;
  if (
    (!editing && !hasPermission("asset:create")) ||
    (editing && asset && !asset.capabilities.canEdit)
  ) {
    return (
      <EmptyState
        title="You cannot edit this asset"
        description="This account does not have permission in the asset's management area."
        action={
          <Link className="button button--secondary button--md" to="/assets">
            Back to asset registry
          </Link>
        }
      />
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFields({});
    const input: AssetInput = {
      name: form.name.trim(),
      managementAreaId: form.managementAreaId,
      assetTemplateId: form.assetTemplateId || null,
      description: form.description.trim() || null,
      pictureUrl: form.pictureUrl.trim() || null,
      totalQuantity: Number(form.totalQuantity),
      isActive: form.isActive,
    };
    try {
      const result =
        editing && assetId && asset
          ? await api.updateAsset(assetId, {
              name: input.name,
              managementAreaId: input.managementAreaId,
              assetTemplateId: input.assetTemplateId,
              description: input.description,
              pictureUrl: input.pictureUrl,
              expectedUpdatedAt: asset.updatedAt,
            })
          : await api.createAsset(input);
      navigate(`/assets/${result.id}`, {
        replace: true,
        state: { notice: editing ? "Changes saved" : "Asset added" },
      });
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
          { label: "Asset registry", to: "/assets" },
          { label: editing ? (asset?.name ?? "Edit") : "Add asset" },
        ]}
      />
      <PageHeader
        eyebrow={editing ? "Asset / edit record" : "Asset / new record"}
        title={editing ? "Edit asset" : "Add asset"}
        description={
          editing
            ? "Adjust total quantity through the inventory ledger to preserve a complete history."
            : "Create one asset or add multiple assets to the ledger at once."
        }
        actions={
          <Link
            className="button button--quiet button--md"
            to={editing ? `/assets/${assetId}` : "/assets"}
          >
            <ArrowLeft size={17} />
            Cancel
          </Link>
        }
      />

      {!editing && (
        <div className="segmented" role="tablist" aria-label="Creation mode">
          <button
            role="tab"
            aria-selected={mode === "single"}
            className={cx(mode === "single" && "segmented--active")}
            onClick={() => setMode("single")}
          >
            <Plus size={16} />
            Single asset
          </button>
          <button
            role="tab"
            aria-selected={mode === "batch"}
            className={cx(mode === "batch" && "segmented--active")}
            onClick={() => setMode("batch")}
          >
            <CopyPlus size={16} />
            Multiple assets
          </button>
        </div>
      )}

      {!editing && mode === "batch" ? (
        <BatchAssetForm
          areas={visibleAreas}
          templates={templates}
          onCreated={(ids) =>
            navigate(`/assets/${ids[0]}`, {
              replace: true,
              state: { notice: `${ids.length} assets added` },
            })
          }
        />
      ) : (
        <form className="record-form" onSubmit={submit} noValidate>
          <div className="record-form__main">
            {Boolean(error) && (
              <div className="form-alert" role="alert">
                {error instanceof ApiClientError
                  ? error.message
                  : "Unable to save asset"}
              </div>
            )}
            <section className="form-section">
              <div className="form-section__heading">
                <span>01</span>
                <div>
                  <h2>Basic information</h2>
                  <p>The name and area identify this registry entry.</p>
                </div>
              </div>
              <div className="form-grid form-grid--2">
                <Field label="Asset name" required error={fields.name}>
                  <Input
                    value={form.name}
                    onChange={(event) =>
                      setForm({ ...form, name: event.target.value })
                    }
                    maxLength={150}
                    required
                    autoFocus
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
                    <option value="">Select an area</option>
                    {(editing ? areas : visibleAreas).map((area) => (
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
                  maxLength={10000}
                  rows={5}
                  placeholder="Usage notes or information the team should know"
                />
              </Field>
            </section>

            <section className="form-section">
              <div className="form-section__heading">
                <span>02</span>
                <div>
                  <h2>Classification and quantity</h2>
                  <p>
                    Templates fill in repeated details. The initial quantity is recorded in the ledger.
                  </p>
                </div>
              </div>
              <div className="form-grid form-grid--2">
                <Field label="Asset template">
                  <Select
                    value={form.assetTemplateId}
                    onChange={(event) =>
                      setForm({ ...form, assetTemplateId: event.target.value })
                    }
                  >
                    <option value="">No template</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                {!editing ? (
                  <Field
                    label="Initial quantity"
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
                    label="Total quantity"
                    hint="Adjust quantity from the asset details page"
                  >
                    <Input
                      value={`${asset?.totalQuantity ?? 0} units`}
                      disabled
                    />
                  </Field>
                )}
              </div>
            </section>

            <section className="form-section">
              <div className="form-section__heading">
                <span>03</span>
                <div>
                  <h2>Image</h2>
                  <p>Use an image URL from external storage.</p>
                </div>
              </div>
              <Field label="Picture URL" error={fields.pictureUrl}>
                <Input
                  type="url"
                  value={form.pictureUrl}
                  onChange={(event) =>
                    setForm({ ...form, pictureUrl: event.target.value })
                  }
                  placeholder="https://…"
                  maxLength={2048}
                />
              </Field>
            </section>
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
                <dt>Template</dt>
                <dd>
                  {templates.find(
                    (template) => template.id === form.assetTemplateId,
                  )?.name ?? "No template"}
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
  templates,
  onCreated,
}: {
  areas: ManagementArea[];
  templates: AssetTemplate[];
  onCreated: (ids: string[]) => void;
}) {
  const [areaId, setAreaId] = useState(areas[0]?.id ?? "");
  const [templateId, setTemplateId] = useState("");
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<BatchRow[]>([
    { key: 1, name: "", description: "", pictureUrl: "", quantity: "1" },
    { key: 2, name: "", description: "", pictureUrl: "", quantity: "1" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function update(key: number, values: Partial<BatchRow>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...values } : row)),
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await api.createAssets(
        rows.map((row) => ({
          name: row.name.trim(),
          managementAreaId: areaId,
          assetTemplateId: templateId || null,
          description: row.description.trim() || null,
          pictureUrl: row.pictureUrl.trim() || null,
          totalQuantity: Number(row.quantity),
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
            <h2>Shared batch settings</h2>
            <p>All assets will use the same area and template.</p>
          </div>
        </div>
        <div className="form-grid form-grid--3">
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
          <Field label="Template">
            <Select
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
            >
              <option value="">No template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Batch description">
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="For example, August equipment intake"
            />
          </Field>
        </div>
      </section>
      <section className="form-section">
        <div className="form-section__heading form-section__heading--action">
          <span>02</span>
          <div>
            <h2>Assets</h2>
            <p>Add up to 100 assets. Names must be unique within an area.</p>
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
            Add row
          </Button>
        </div>
        <div className="batch-rows">
          {rows.map((row, index) => (
            <div className="batch-row" key={row.key}>
              <span className="batch-row__index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <Field label="Name" required>
                <Input
                  value={row.name}
                  onChange={(event) =>
                    update(row.key, { name: event.target.value })
                  }
                  maxLength={150}
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
              <Field label="Picture URL">
                <Input
                  type="url"
                  value={row.pictureUrl}
                  onChange={(event) =>
                    update(row.key, { pictureUrl: event.target.value })
                  }
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
        <Button
          type="submit"
          loading={submitting}
          disabled={!areaId || rows.some((row) => !row.name.trim())}
        >
          <CopyPlus size={17} />
          Add {rows.length} assets
        </Button>
      </div>
    </form>
  );
}
