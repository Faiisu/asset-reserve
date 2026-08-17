export type EmailTemplateSituation =
  | "reservation_submitted"
  | "reservation_decided"
  | "return_decided";

export const EMAIL_TEMPLATE_SITUATIONS: readonly EmailTemplateSituation[] = [
  "reservation_submitted",
  "reservation_decided",
  "return_decided",
];

export function isEmailTemplateSituation(
  value: string,
): value is EmailTemplateSituation {
  return (EMAIL_TEMPLATE_SITUATIONS as readonly string[]).includes(value);
}

export type EmailTemplateMeta = {
  situation: EmailTemplateSituation;
  label: string;
  description: string;
  recipient: string;
  placeholders: string[];
  defaultSubject: string;
  defaultBodyMarkdown: string;
};

/**
 * Markdown-lite source shown as the starting point in the admin editor and
 * used by preview()/"reset to default" -- a plain-language equivalent of the
 * hardcoded HTML templates in ../email/email-templates.ts, not a literal
 * re-rendering of them. Those hardcoded functions remain the actual
 * fallback EmailService sends when no row is saved for a situation; this is
 * only what the editor shows before an admin has customized anything.
 */
/**
 * One shared sample-value map (rather than per-situation) since the same
 * placeholder name means the same kind of thing everywhere it appears --
 * used only to render the live preview against realistic-looking content,
 * never sent as a real email.
 */
export const EMAIL_TEMPLATE_SAMPLE_VALUES: Record<string, string> = {
  eventName: "Marketing Town Hall",
  requesterName: "Jamie Rivera",
  startAt: "Sep 1, 2026, 9:00 AM",
  endAt: "Sep 1, 2026, 11:00 AM",
  decision: "approved",
  status: "approved",
};

export const EMAIL_TEMPLATE_META: Record<EmailTemplateSituation, EmailTemplateMeta> = {
  reservation_submitted: {
    situation: "reservation_submitted",
    label: "Reservation submitted",
    description: "Sent to approvers when someone submits a reservation for their area.",
    recipient: "Approvers",
    placeholders: ["eventName", "requesterName", "startAt", "endAt"],
    defaultSubject: "Reservation awaiting your decision: {{eventName}}",
    defaultBodyMarkdown:
      "**{{requesterName}}** submitted a reservation for \"{{eventName}}\" that needs approval in an area you manage.\n\n" +
      "When: {{startAt}} to {{endAt}}\n\n" +
      "Sign in to review and approve or reject it.",
  },
  reservation_decided: {
    situation: "reservation_decided",
    label: "Reservation decided",
    description: "Sent to the requester once their reservation has been approved or rejected.",
    recipient: "Requester",
    placeholders: ["eventName", "startAt", "endAt", "decision", "status"],
    defaultSubject: "Reservation {{decision}}: {{eventName}}",
    defaultBodyMarkdown:
      "Your reservation \"**{{eventName}}**\" has been {{decision}}.\n\n" +
      "When: {{startAt}} to {{endAt}}\n\n" +
      "Current status: {{status}}. Sign in for the full breakdown.",
  },
  return_decided: {
    situation: "return_decided",
    label: "Return decided",
    description: "Sent to the requester once their asset return has been confirmed or rejected.",
    recipient: "Requester",
    placeholders: ["eventName", "decision"],
    defaultSubject: "Return {{decision}}: {{eventName}}",
    defaultBodyMarkdown:
      "The return you submitted for \"**{{eventName}}**\" was {{decision}}.\n\n" +
      "Sign in for the full breakdown.",
  },
};
