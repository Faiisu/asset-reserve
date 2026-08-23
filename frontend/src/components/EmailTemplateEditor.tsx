import { Eye, RotateCcw } from "lucide-react";
import { useState } from "react";
import { api, ApiClientError } from "../api";
import type { EmailTemplate } from "../types";
import { Button, Field, Input, cx } from "./ui";
import { MarkdownLiteEditor } from "./MarkdownLiteEditor";

// Mirrors UpdateEmailTemplateRequest in
// docs/backend_spec/contracts/components/schemas/email-templates.yaml --
// cap here so an over-long draft is prevented rather than rejected with a
// 422 only once the admin hits Save.
const SUBJECT_MAX_LENGTH = 255;
const BODY_MAX_LENGTH = 10_000;

/**
 * One situation's editor -- subject, markdown-lite body, an explicit
 * Preview (rather than auto-debounced on every keystroke, to keep this
 * simple and avoid a request racing every character typed), Save, and
 * Reset to default. Owns its own draft state so the three templates on
 * NotificationsPage's Templates tab are fully independent of each other.
 */
export function EmailTemplateEditor({
  template,
  onUpdated,
}: {
  template: EmailTemplate;
  onUpdated: (updated: EmailTemplate) => void;
}) {
  const [subject, setSubject] = useState(template.subject);
  const [bodyMarkdown, setBodyMarkdown] = useState(template.bodyMarkdown);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);

  async function runPreview() {
    setError("");
    setPreviewing(true);
    try {
      const result = await api.previewEmailTemplate(template.situation, {
        subject,
        bodyMarkdown,
      });
      setPreview(result);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Unable to render a preview.");
    } finally {
      setPreviewing(false);
    }
  }

  async function save() {
    setError("");
    setSaving(true);
    try {
      const result = await api.updateEmailTemplate(template.situation, {
        subject,
        bodyMarkdown,
      });
      onUpdated(result);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Unable to save the template.");
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefault() {
    setError("");
    setResetting(true);
    try {
      const result = await api.resetEmailTemplate(template.situation);
      setSubject(result.subject);
      setBodyMarkdown(result.bodyMarkdown);
      setPreview(null);
      onUpdated(result);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Unable to reset the template.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <section className="form-section">
      <div className="form-section__heading">
        <div>
          <h2>{template.label}</h2>
          <p>
            {template.description} Sent to: {template.recipient}.
          </p>
        </div>
        <div
          className={cx(
            "status-badge",
            template.isCustomized ? "status-badge--active" : "status-badge--inactive",
          )}
        >
          <span className="status-badge__dot" aria-hidden />
          {template.isCustomized ? "Customized" : "Default"}
        </div>
      </div>

      <div className="form-stack">
        {error && (
          <div className="form-alert" role="alert">
            {error}
          </div>
        )}
        <Field label="Subject" required>
          <Input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={SUBJECT_MAX_LENGTH}
            required
          />
        </Field>
        <Field
          label="Body"
          hint={`Placeholders: ${template.placeholders.map((token) => `{{${token}}}`).join(", ")}`}
        >
          <MarkdownLiteEditor
            value={bodyMarkdown}
            onChange={setBodyMarkdown}
            placeholders={template.placeholders}
            maxLength={BODY_MAX_LENGTH}
          />
        </Field>

        <div className="form-submit" style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
          <Button
            type="button"
            variant="quiet"
            disabled={!template.isCustomized}
            loading={resetting}
            onClick={() => void resetToDefault()}
          >
            <RotateCcw size={15} />
            Reset to default
          </Button>
          <div style={{ display: "flex", gap: "10px" }}>
            <Button type="button" variant="secondary" loading={previewing} onClick={() => void runPreview()}>
              <Eye size={15} />
              Preview
            </Button>
            <Button type="button" loading={saving} onClick={() => void save()}>
              Save template
            </Button>
          </div>
        </div>

        {preview && (
          <div className="email-template-preview">
            <p className="email-template-preview__subject">Subject: {preview.subject}</p>
            <iframe
              sandbox=""
              srcDoc={preview.html}
              title={`${template.label} preview`}
              className="email-template-preview__frame"
            />
          </div>
        )}
      </div>
    </section>
  );
}
