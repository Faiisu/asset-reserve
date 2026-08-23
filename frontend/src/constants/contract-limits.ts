/**
 * Every input limit the UI enforces, in one place, mirroring
 * docs/backend_spec/contracts/ -- the contract is the single source of truth
 * for these numbers (see docs/README.md).
 *
 * Why this file exists rather than literals scattered across forms: the
 * contract defines the boundary between client and server, but the client
 * cannot import YAML, so it necessarily holds a copy. A copy nobody checks
 * drifts silently -- the role description input capped typing at 500 while
 * the contract allowed 10000, quietly truncating pasted text, and the email
 * template fields enforced nothing at all and only failed on save with a
 * 422. Collecting the copies here makes them auditable, and
 * `npm run check:contract` at the repo root fails the build when any of
 * them stops matching the contract.
 *
 * Adding an entry: point `contractRef` at the schema field it mirrors, using
 * the same `Schema.property` form as the others. The checker resolves it
 * against components.schemas in the bundled contract.
 */

type Limit = {
  /** Value the UI enforces. */
  value: number;
  /** `SchemaName.property` in the contract, plus which keyword it mirrors. */
  contractRef: string;
  keyword: "maxLength" | "minLength" | "maximum" | "minimum";
};

const limit = (
  value: number,
  contractRef: string,
  keyword: Limit["keyword"] = "maxLength",
): Limit => ({ value, contractRef, keyword });

export const CONTRACT_LIMITS = {
  asset: {
    nameMax: limit(40, "CreateAssetRequest.name"),
    partNumberMax: limit(100, "CreateAssetRequest.partNumber"),
    descriptionMax: limit(10_000, "CreateAssetRequest.description"),
    unitReasonMax: limit(2_000, "RegisterAssetUnitsRequest.reason"),
    unitStatusReasonMax: limit(2_000, "UpdateAssetUnitStatusRequest.reason"),
  },
  managementArea: {
    nameMax: limit(150, "CreateManagementAreaRequest.name"),
    descriptionMax: limit(1_000, "CreateManagementAreaRequest.description"),
  },
  reservation: {
    eventNameMax: limit(200, "CreateReservationRequest.eventName"),
    descriptionMax: limit(10_000, "CreateReservationRequest.description"),
    itemQuantityMax: limit(200, "ReservationItemInput.quantity", "maximum"),
    cancelReasonMax: limit(2_000, "CancelReservationRequest.reason"),
  },
  role: {
    nameMax: limit(50, "CreateRoleRequest.name"),
    descriptionMax: limit(10_000, "CreateRoleRequest.description"),
  },
  user: {
    usernameMin: limit(3, "CreateUserRequest.username", "minLength"),
    usernameMax: limit(50, "CreateUserRequest.username"),
    passwordMin: limit(8, "CreateUserRequest.password", "minLength"),
    passwordMax: limit(128, "CreateUserRequest.password"),
    currentPasswordMax: limit(1_024, "ChangeMyPasswordRequest.currentPassword"),
  },
  emailTemplate: {
    subjectMax: limit(255, "UpdateEmailTemplateRequest.subject"),
    bodyMax: limit(10_000, "UpdateEmailTemplateRequest.bodyMarkdown"),
  },
} as const;

/** Unwraps a limit for use as an input attribute. */
export const cap = (entry: Limit): number => entry.value;
