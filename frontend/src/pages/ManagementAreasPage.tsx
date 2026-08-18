import { Building2, Edit3, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiClientError } from "../api";
import { useAuth } from "../auth";
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Notice,
  Textarea,
  formatDate,
} from "../components/ui";
import type { ManagementArea } from "../types";

export function ManagementAreasPage() {
  const { isGlobalAdmin, hasPermission } = useAuth();
  const [areas, setAreas] = useState<ManagementArea[]>([]);
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<ManagementArea | "new" | null>(null);
  const [deleting, setDeleting] = useState<ManagementArea | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.areas(search);
      setAreas(response.data);
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="page-stack">
      {notice && <Notice>{notice}</Notice>}
      <section className="toolbar">
        <form
          className="search-box"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(draftSearch.trim());
          }}
        >
          <Search size={18} />
          <input
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            placeholder="Search management areas"
            aria-label="Search management areas"
          />
          <button type="submit">Search</button>
        </form>
        {isGlobalAdmin && (
          <Button onClick={() => setEditing("new")}>
            <Plus size={17} />
            Create management area
          </Button>
        )}
      </section>

      {loading ? (
        <LoadingState label="Loading management areas" />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void load()} />
      ) : areas.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No management areas yet"
          description="Create a management area to organize assets and assign role boundaries."
          action={
            isGlobalAdmin ? (
              <Button onClick={() => setEditing("new")}>
                <Plus size={16} />
                Create your first management area
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="template-grid">
          {areas.map((area) => (
            <article className="template-card" key={area.id}>
              <div className="template-card__icon">
                <Building2 size={27} />
              </div>
              <div className="template-card__main">
                <p className="eyebrow mono">
                  AREA-{area.id.slice(0, 6).toUpperCase()}
                </p>
                <h2>{area.name}</h2>
                <p>{area.description || "No description provided."}</p>
              </div>
              <footer>
                <span>Updated {formatDate(area.updatedAt)}</span>
                {isGlobalAdmin && (
                  <div style={{ display: "flex", gap: "4px" }}>
                    <Button
                      variant="quiet"
                      size="sm"
                      onClick={() => setEditing(area)}
                      aria-label={`Edit ${area.name}`}
                    >
                      <Edit3 size={16} />
                      Edit
                    </Button>
                    <Button
                      variant="quiet"
                      size="sm"
                      onClick={() => setDeleting(area)}
                      style={{ color: "var(--red)" }}
                      aria-label={`Delete ${area.name}`}
                    >
                      <Trash2 size={16} />
                      Delete
                    </Button>
                  </div>
                )}
              </footer>
            </article>
          ))}
        </div>
      )}

      <AreaDialog
        area={editing}
        onClose={() => setEditing(null)}
        onSaved={async (message) => {
          setEditing(null);
          setNotice(message);
          await load();
        }}
      />

      <DeleteAreaDialog
        area={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={async (message) => {
          setDeleting(null);
          setNotice(message);
          await load();
        }}
      />
    </div>
  );
}

function AreaDialog({
  area,
  onClose,
  onSaved,
}: {
  area: ManagementArea | "new" | null;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const existing = area && area !== "new" ? area : null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setName(existing?.name ?? "");
    setDescription(existing?.description ?? "");
    setError("");
  }, [existing, area]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Area name is required.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      if (existing) {
        await api.updateArea(existing.id, {
          name: name.trim(),
          description: description.trim() || undefined,
        });
      } else {
        await api.createArea({
          name: name.trim(),
          description: description.trim() || undefined,
        });
      }
      await onSaved(
        existing ? "Management area updated" : "Management area created",
      );
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "Unable to save management area",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={Boolean(area)}
      title={existing ? "Edit management area" : "Create management area"}
      description="Define a physical workspace or team location where assets and roles are grouped."
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        {error && (
          <div className="form-alert" role="alert">
            {error}
          </div>
        )}
        <Field label="Area name" required>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="For example, Production Lab, Main Stage, Audio Studio"
            maxLength={150}
            required
            autoFocus
          />
        </Field>
        <Field label="Description">
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional workspace description or location details"
            rows={4}
            maxLength={1000}
          />
        </Field>
        <div className="dialog__actions">
          <Button type="button" variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {existing ? "Save changes" : "Create management area"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteAreaDialog({
  area,
  onClose,
  onDeleted,
}: {
  area: ManagementArea | null;
  onClose: () => void;
  onDeleted: (message: string) => void | Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
  }, [area]);

  async function handleDelete() {
    if (!area) return;
    setSubmitting(true);
    setError("");
    try {
      await api.deleteArea(area.id);
      await onDeleted("Management area deleted");
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "Unable to delete management area",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={Boolean(area)}
      title="Delete management area"
      description={`Are you sure you want to delete "${area?.name}"? Areas with active assets cannot be deleted.`}
      onClose={onClose}
    >
      <div className="form-stack">
        {error && (
          <div className="form-alert" role="alert">
            {error}
          </div>
        )}
        <div className="dialog__actions">
          <Button
            type="button"
            variant="quiet"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={() => void handleDelete()}
            loading={submitting}
          >
            Delete management area
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
