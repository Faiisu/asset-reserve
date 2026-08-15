import { Edit3, FileBox, Plus, Search } from "lucide-react";
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
  PageHeader,
  Textarea,
  formatDate,
} from "../components/ui";
import type { AssetTemplate } from "../types";

export function TemplatesPage() {
  const { hasPermission } = useAuth();
  const [templates, setTemplates] = useState<AssetTemplate[]>([]);
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<AssetTemplate | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTemplates((await api.templates(search)).data);
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [search]);
  useEffect(() => {
    if (hasPermission("asset:view")) void load();
  }, [hasPermission, load]);

  if (!hasPermission("asset:view"))
    return (
      <EmptyState
        title="You cannot view templates"
        description="You need asset:view access in at least one area."
      />
    );

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Inventory / reusable records"
        title="Asset templates"
        description="Reuse asset names and descriptions without images or inventory quantities."
        actions={
          hasPermission("asset:create") ? (
            <Button onClick={() => setEditing("new")}>
              <Plus size={17} />
              Create template
            </Button>
          ) : undefined
        }
      />
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
            placeholder="Search templates"
            aria-label="Search templates"
          />
          <button>Search</button>
        </form>
      </section>
      {loading ? (
        <LoadingState label="Loading templates" />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void load()} />
      ) : templates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          description="Create a template to reuse names and descriptions when adding assets."
          action={
            hasPermission("asset:create") ? (
              <Button onClick={() => setEditing("new")}>
                <Plus size={16} />
                Create your first template
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="template-grid">
          {templates.map((template) => (
            <article className="template-card" key={template.id}>
              <div className="template-card__icon">
                <FileBox size={23} />
              </div>
              <div className="template-card__main">
                <p className="eyebrow mono">
                  TPL-{template.id.slice(0, 6).toUpperCase()}
                </p>
                <h2>{template.name}</h2>
                <p>{template.description || "No description"}</p>
              </div>
              <footer>
                <span>Updated {formatDate(template.updatedAt)}</span>
                {hasPermission("asset:update") && (
                  <Button
                    variant="quiet"
                    size="sm"
                    onClick={() => setEditing(template)}
                  >
                    <Edit3 size={15} />
                    Edit
                  </Button>
                )}
              </footer>
            </article>
          ))}
        </div>
      )}
      <TemplateDialog
        template={editing}
        onClose={() => setEditing(null)}
        onSaved={async (message) => {
          setEditing(null);
          setNotice(message);
          await load();
        }}
      />
    </div>
  );
}

function TemplateDialog({
  template,
  onClose,
  onSaved,
}: {
  template: AssetTemplate | "new" | null;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const existing = template && template !== "new" ? template : null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setName(existing?.name ?? "");
    setDescription(existing?.description ?? "");
    setError("");
  }, [existing, template]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      if (existing)
        await api.updateTemplate(existing.id, {
          name: name.trim(),
          description: description.trim() || null,
          expectedUpdatedAt: existing.updatedAt,
        });
      else
        await api.createTemplate({
          name: name.trim(),
          description: description.trim() || null,
        });
      await onSaved(existing ? "Template updated" : "Template created");
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "Unable to save template",
      );
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <Dialog
      open={Boolean(template)}
      title={existing ? "Edit template" : "Create template"}
      description="Templates do not include images, quantities, or management areas."
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        {error && (
          <div className="form-alert" role="alert">
            {error}
          </div>
        )}
        <Field label="Template name" required>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={150}
            required
            autoFocus
          />
        </Field>
        <Field label="Description">
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={5}
            maxLength={10000}
          />
        </Field>
        <div className="dialog__actions">
          <Button type="button" variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {existing ? "Save changes" : "Create template"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
