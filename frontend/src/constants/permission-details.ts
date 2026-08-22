export type PermissionDetail = {
  key: string;
  name: string;
  category: string;
  scopeType: "area" | "global" | "locked";
  scopeLabel: string;
  summary: string;
  details: string;
  capabilities: string[];
  example: string;
  impact: string;
};

export const PERMISSION_DETAILS: Record<string, PermissionDetail> = {
  "asset:create": {
    key: "asset:create",
    name: "Create Assets",
    category: "Assets",
    scopeType: "area",
    scopeLabel: "Area Scoped / Global",
    summary: "Allows registering new equipment and physical assets into inventory.",
    details:
      "Enables adding new equipment to authorized management areas, specifying titles, specifications, uploading photos, and setting initial quantity balances.",
    capabilities: [
      "Register new assets into managed areas",
      "Upload equipment photos and technical specifications",
    ],
    example:
      "A Media Lab officer adds two new Sony Alpha 7 IV camera kits to the equipment inventory.",
    impact:
      "Expands catalog items available for reservation within the assigned management area.",
  },
  "asset:view": {
    key: "asset:view",
    name: "View Assets",
    category: "Assets",
    scopeType: "area",
    scopeLabel: "Basic / Read-Only",
    summary: "Access and inspect asset details, specifications, and availability.",
    details:
      "Enables browsing the asset catalog, viewing technical specs, images, historical usage, and checking unallocated unit counts across schedules.",
    capabilities: [
      "Search and explore all accessible equipment in the catalog",
      "Inspect real-time availability across calendar date ranges",
      "Review equipment photos and detailed specifications",
    ],
    example:
      "A team member browses available portable projectors and checks schedule availability before booking.",
    impact:
      "Read-only access with zero modification to stock balances or existing bookings.",
  },
  "asset:update": {
    key: "asset:update",
    name: "Update Assets & Stock",
    category: "Assets",
    scopeType: "area",
    scopeLabel: "Area Scoped / Global",
    summary: "Modify asset metadata and record inventory adjustments.",
    details:
      "Allows editing asset information (name, description, picture) and executing batch inventory transactions (stock additions, recording damaged or lost units, or sending items for maintenance).",
    capabilities: [
      "Edit asset titles, descriptions, and pictures",
      "Execute batch inventory additions and deductions",
      "Log required audit reasons for every stock adjustment",
    ],
    example:
      "An inventory manager logs one microphone out of stock for external manufacturer servicing.",
    impact:
      "Immediately updates available equipment capacity across the reservation calendar.",
  },
  "asset:delete": {
    key: "asset:delete",
    name: "Deactivate / Delete Assets",
    category: "Assets",
    scopeType: "area",
    scopeLabel: "High Impact",
    summary: "Deactivate retired assets or remove obsolete catalog entries.",
    details:
      "When deactivated, equipment is hidden from booking workflows while preserving historical logs, return records, and reporting data intact.",
    capabilities: [
      "Deactivate obsolete or decommissioned equipment",
      "Reactivate previously disabled assets when ready",
      "Remove catalog items in accordance with organization policy",
    ],
    example:
      "An administrator deactivates an outdated projector model to prevent new reservation submissions.",
    impact:
      "Prevents future reservations without altering or deleting historical transaction logs.",
  },
  "reservation:create": {
    key: "reservation:create",
    name: "Create Reservations",
    category: "Reservations",
    scopeType: "area",
    scopeLabel: "Core Workflow",
    summary: "Create booking requests, select schedules, and submit for approval.",
    details:
      "Enables drafting reservation manifests, selecting multiple equipment items from authorized areas, adding collaborators/participants, and submitting requests.",
    capabilities: [
      "Draft and submit reservation requests",
      "Select multi-item asset manifests with requested quantities",
      "Add participants and co-organizers to bookings",
    ],
    example:
      "A project coordinator submits a reservation request for a PA speaker and wireless microphones for a town hall meeting.",
    impact:
      "Places temporary holds on inventory capacity pending manager review and approval.",
  },
  "reservation:update": {
    key: "reservation:update",
    name: "Manage Reservations",
    category: "Reservations",
    scopeType: "area",
    scopeLabel: "Area Scoped / Global",
    summary: "Manage and edit reservation records within authorized areas.",
    details:
      "Allows area managers and operators to update event details, adjust schedules, assist users with booking modifications, or cancel bookings in managed areas.",
    capabilities: [
      "Update reservation schedules and manifests",
      "Cancel bookings to restore inventory allocations",
      "Review reservation audit timeline and change history",
    ],
    example:
      "An area supervisor assists an organizer in rescheduling a setup window by 2 hours.",
    impact:
      "Schedule modifications dynamically re-evaluate asset conflict checks.",
  },
  "reservation:approve": {
    key: "reservation:approve",
    name: "Approve Reservations",
    category: "Reservations",
    scopeType: "area",
    scopeLabel: "Decision Maker",
    summary: "Review equipment requests and grant booking approvals.",
    details:
      "Enables area managers to verify item availability, review event context, and grant approvals per line item or in batch operations.",
    capabilities: [
      "Approve pending reservation items in assigned areas",
      "Execute batch approvals across multiple items",
      "Attach decision notes and preparation instructions",
    ],
    example:
      "The Media Lab manager approves camera kit bookings after verifying schedule availability.",
    impact:
      "Records an APPROVED decision, moves items to PREPARED, and locks equipment capacity.",
  },
  "reservation:reject": {
    key: "reservation:reject",
    name: "Reject Reservations",
    category: "Reservations",
    scopeType: "area",
    scopeLabel: "Decision Maker",
    summary: "Decline reservation requests due to conflicts or policy constraints.",
    details:
      "Used when requested assets are unavailable, schedules overlap, or policy criteria are not met, allowing feedback to be returned to the requester.",
    capabilities: [
      "Reject unfulfillable reservation items",
      "Provide rejection rationale and feedback",
      "Instantly release capacity holds back to the pool",
    ],
    example:
      "A manager rejects a speaker request that conflicts with a pre-booked corporate keynote.",
    impact:
      "Immediately frees unallocated units for other incoming requests.",
  },
  "return:approve": {
    key: "return:approve",
    name: "Approve & Complete Returns",
    category: "Returns",
    scopeType: "area",
    scopeLabel: "Area Scoped / Global",
    summary: "Inspect returned equipment, record condition, and close bookings.",
    details:
      "Allows staff to inspect physical gear after events, log intact, broken, or lost unit counts, and complete return check-ins.",
    capabilities: [
      "Process physical equipment returns",
      "Log broken or missing units with inspection notes",
      "Close out booking workflows and restore inventory",
    ],
    example:
      "A technician inspects video cables and microphones post-event and confirms the return.",
    impact:
      "Restores returned assets to active available inventory.",
  },
  "user:create": {
    key: "user:create",
    name: "Create Users",
    category: "Users",
    scopeType: "global",
    scopeLabel: "Admin / HR Scope",
    summary: "Provision new user accounts, emails, and profile credentials.",
    details:
      "Enables registering new organization members into the system, setting initial passwords, full names, and contact numbers.",
    capabilities: [
      "Provision new member accounts",
      "Set initial authentication credentials",
      "Record profile information and phone numbers",
    ],
    example:
      "An administrator registers a new team member to enable them to book equipment.",
    impact:
      "New users can immediately authenticate and create reservation drafts.",
  },
  "user:disable": {
    key: "user:disable",
    name: "Deactivate / Activate Users",
    category: "Users",
    scopeType: "locked",
    scopeLabel: "System Locked (Admin Only)",
    summary: "Disable user accounts or restore previously suspended access.",
    details:
      "A critical security permission used to immediately block access for departing personnel or compromised accounts while keeping historical audit trails intact.",
    capabilities: [
      "Instantly disable user authentication",
      "Reactivate suspended accounts",
      "Inspect active/inactive status across all users",
    ],
    example:
      "An administrator deactivates an account following an employee departure.",
    impact:
      "Disabled users are blocked from logging in or performing actions.",
  },
  "role:assign": {
    key: "role:assign",
    name: "Assign User Roles",
    category: "Roles",
    scopeType: "locked",
    scopeLabel: "System Locked (Admin Only)",
    summary: "Assign system roles and delegate management area scopes.",
    details:
      "Highest governance authority to assign roles (Admin, Manager, User, Custom) and link area scopes (e.g. granting Manager privileges specifically for Media Lab).",
    capabilities: [
      "Assign and revoke roles for any user",
      "Define management area authorization scopes",
      "Manage global and scoped permission boundaries",
    ],
    example:
      "An administrator appoints an audio lead as the Manager for Event Support.",
    impact:
      "Grants operational and approval authority per role and area boundaries.",
  },
};
