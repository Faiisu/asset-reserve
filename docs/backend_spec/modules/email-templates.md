# Email templates module

[← Backend specification](../README.md)

Global-admin management of the customizable subject/body for each outbound notification situation. Source: `backend/src/email-templates/`.

## Why this module exists

Three notification situations exist, fixed by `EmailTemplateSituation` (`reservation_submitted`, `reservation_decided`, `return_decided`) — see [software_spec/business-rules-and-validation.md §6](../../software_spec/business-rules-and-validation.md#6-recognition-email-templates-notification-settings). Each situation has a hardcoded default subject/body (in `email-templates.constants.ts`, also the actual fallback `EmailService` sends when no row is customized) and an optional customized override persisted in the `EmailTemplate` Prisma model, keyed by `situation`.

## Routes

5 routes under `/email-templates`, all requiring global admin (`@RequireGlobalAdmin()` at controller level). Full shapes: [contracts/paths/email-templates.yaml](../contracts/paths/email-templates.yaml), schemas in [contracts/components/schemas/email-templates.yaml](../contracts/components/schemas/email-templates.yaml).

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/email-templates` | Always one entry per known situation |
| GET | `/email-templates/{situation}` | 404 `EMAIL_TEMPLATE_NOT_FOUND` if situation unknown |
| PATCH | `/email-templates/{situation}` | Upserts the override row |
| DELETE | `/email-templates/{situation}` | Reset to default; idempotent (no-op, not an error, if nothing was customized) |
| POST | `/email-templates/{situation}/preview` | Renders subject+body against one shared sample-value map; sends nothing |

## Implementation notes

- `EmailTemplatesService.toResponse()` merges the persisted row (if any) with `EMAIL_TEMPLATE_META[situation]` — `isCustomized` is simply `Boolean(row)`.
- `resetToDefault()` deletes the override row and swallows Prisma's `P2025` (record-not-found) so the endpoint is safe to call repeatedly.
- `preview()` never touches the database or sends mail — it renders `dto.subject`/`dto.bodyMarkdown` (the *draft*, not the saved value) through `renderTemplateBody`/`renderTemplateSubject` against `EMAIL_TEMPLATE_SAMPLE_VALUES`, a single shared placeholder map (not per-situation) since the same placeholder name means the same kind of value everywhere it's used.
- Validation: `subject` 1–255 chars, `bodyMarkdown` 1–10 000 chars, both trimmed server-side (see [contracts/components/schemas/email-templates.yaml](../contracts/components/schemas/email-templates.yaml)).
