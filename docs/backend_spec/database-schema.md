# Database schema

[← Backend specification](README.md) · [Database and concurrency](database-and-concurrency.md)

เอกสารนี้เป็นแหล่งอ้างอิงเดียว (canonical source) สำหรับตาราง, column, type, index และ relation ของฐานข้อมูล เขียนด้วย DBML-style syntax เพื่ออธิบาย schema ก่อนแปลงเป็น Prisma model จริงที่ [`backend/prisma/`](../../backend/prisma/) — ห้ามเอกสารอื่นใน `docs_v2/` restate ชื่อ column, enum value หรือ constraint SQL ซ้ำจากที่นี่ ให้ลิงก์กลับมาแทน

Business rationale ของแต่ละ status/flag (เช่น เหตุผลที่เอา `ACTIVE` ออกจาก asset) อยู่ใน [software_spec/lifecycle-and-state-machines.md](../software_spec/lifecycle-and-state-machines.md) และ [software_spec/business-rules-and-validation.md](../software_spec/business-rules-and-validation.md) — ที่นี่เก็บเฉพาะ persisted shape

Permission catalog ตัวอย่างใน `roles.permissions` เป็น persisted shape เท่านั้น ความหมายเชิงธุรกิจของแต่ละ permission key อยู่ที่ [software_spec/permissions-and-rbac.md](../software_spec/permissions-and-rbac.md)

```dbml
// =====================================================
// USERS
// =====================================================

Table users {
  id uuid [pk]

  username varchar(50) [not null, unique, note: 'Login identifier, set once at creation and never supplied by Google/Microsoft']
  email varchar(255) [unique, note: 'Nullable -- no longer collected at account creation, populated the first time the user links a Google/Microsoft account']
  password_hash text [note: 'NULL ได้สำหรับ user ที่ใช้ external authentication only']

  is_active boolean [not null, default: true]

  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]
}


Table user_profiles {
  user_id uuid [pk]

  name varchar(150) [not null]
  phone_number varchar(30)
  profile_picture_url text

  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]
}


Table user_auth_identities {
  id uuid [pk]

  user_id uuid [not null]

  provider varchar(30) [not null, note: 'google, microsoft, etc.']
  provider_user_id varchar(255) [not null]

  created_at timestamptz [not null, default: `now()`]

  indexes {
    (provider, provider_user_id) [unique]
    (user_id, provider) [unique]
  }
}


// =====================================================
// MANAGEMENT AREA
// =====================================================

Table management_areas {
  id uuid [pk]

  name varchar(150) [not null, unique]
  description text

  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]
}


// =====================================================
// RBAC
// =====================================================

Table roles {
  id uuid [pk]

  name varchar(50) [not null, unique, note: '''
    ADMIN
    MANAGER
    USER
  ''']

  description text

  permissions jsonb [not null, default: `[]`, note: '''
    ตัวอย่าง:

    ADMIN:
    [
      "asset:create",
      "asset:view",
      "asset:update",
      "asset:delete",

      "reservation:create",
      "reservation:update",
      "reservation:approve",
      "reservation:reject",

      "return:approve",

      "user:create",
      "user:disable",

      "role:assign"
    ]

    MANAGER:
    [
      "asset:create",
      "asset:view",
      "asset:update",

      "reservation:create",
      "reservation:update",
      "reservation:approve",
      "reservation:reject",

      "return:approve"
    ]

    USER:
    [
      "asset:view",
      "reservation:create",
      "reservation:update"
    ]
  ''']

  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]
}


Table user_roles {
  id uuid [pk]

  user_id uuid [not null]
  role_id uuid [not null]

  management_area_id uuid [note: '''
    NULL = Global Role

    ตัวอย่าง:
    ADMIN + NULL
    = Admin ทั้งระบบ

    MANAGER + Area A
    = Manager เฉพาะ Area A
  ''']

  assigned_by uuid

  created_at timestamptz [not null, default: `now()`]

  indexes {
    (user_id, role_id, management_area_id) [unique]
  }
}


// IMPORTANT:
//
// PostgreSQL UNIQUE ปกติยอมให้ NULL ซ้ำได้
//
// migration จริงควรมี:
//
// UNIQUE (user_id, role_id, management_area_id)
// WHERE management_area_id IS NOT NULL
//
// และ
//
// UNIQUE (user_id, role_id)
// WHERE management_area_id IS NULL
//
// หรือ PostgreSQL 15+ ใช้ NULLS NOT DISTINCT


// =====================================================
// ASSETS (part-number catalog entry -- NOT a physical item)
// =====================================================

Table assets {
  id uuid [pk]

  management_area_id uuid [not null]
  created_by uuid [note: 'Owner shown in the UI; SET NULL when the user is removed']

  name varchar(40) [not null]
  part_number varchar(100) [note: 'Optional; unique per management area when present']
  description text
  picture_url text

  is_active boolean [not null, default: true]

  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    (management_area_id, name) [unique]
    (management_area_id, part_number) [unique, note: 'Partial: WHERE part_number IS NOT NULL']
    (created_by)
    (management_area_id, is_active)
  }

  note: '''
    No quantity or status column here anymore. "Total"/"available" quantity and
    status are derived by counting this asset's asset_units rows (see AssetUnit
    below) -- one Asset = one catalog/part-number entry that can have many
    physical, serial-numbered units.
  '''
}


// =====================================================
// ASSET UNITS (one row per physical, serial-numbered item)
// =====================================================

Table asset_units {
  id uuid [pk]

  asset_id uuid [not null]

  serial_number varchar(100) [not null, unique, note: 'Globally unique across the whole system, not just per asset']

  status varchar(20) [not null, default: 'ACTIVE', note: '''
    ACTIVE
    RESERVED
    CHECKED_OUT
    BROKEN
    LOST
    IN_REPAIR
    INACTIVE
  ''']

  note text

  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    (asset_id, status)
  }
}


// =====================================================
// ASSET UNIT EVENT BATCH
// =====================================================

Table asset_unit_event_batches {
  id uuid [pk]

  description text

  performed_by uuid [not null]

  created_at timestamptz [not null, default: `now()`]

  indexes {
    (performed_by)
  }
}


// =====================================================
// ASSET UNIT EVENT LEDGER (per-serial, identity-based -- replaces the old
// quantity-delta asset_transactions ledger)
// =====================================================

Table asset_unit_events {
  id uuid [pk]

  batch_id uuid [not null]
  asset_unit_id uuid [not null]

  event_type varchar(30) [not null, note: '''
    REGISTERED
    RETIRED
    REACTIVATED
    RESERVED
    CHECKED_OUT
    RETURNED_GOOD
    RETURNED_BROKEN
    RETURNED_LOST
    REPAIRED
    ADJUSTMENT
  ''']

  from_status varchar(20)
  to_status varchar(20)

  reservation_item_id uuid [note: 'Set when the event was caused by a reservation lifecycle transition']

  reason text

  created_at timestamptz [not null, default: `now()`]

  indexes {
    (asset_unit_id, created_at)
    (batch_id)
    (reservation_item_id)
  }
}


// =====================================================
// RESERVATION
// =====================================================

Table reservations {
  id uuid [pk]

  requester_id uuid [not null]

  event_name varchar(200) [not null]
  description text

  start_at timestamptz [not null]
  end_at timestamptz [not null]

  status varchar(30) [not null, default: 'DRAFT', note: '''
    DRAFT
    PENDING_APPROVAL
    PARTIALLY_APPROVED
    APPROVED
    DELIVERY_CONFIRMED
    RETURN_PENDING
    RETURN_CONFIRMED
    COMPLETED
    REJECTED
    CANCELLED
  ''']

  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    (requester_id, created_at)
    (start_at, end_at)
    (status)
  }
}


// CHECK:
// end_at > start_at


// =====================================================
// RESERVATION ITEMS
// =====================================================

Table reservation_items {
  id uuid [pk]

  reservation_id uuid [not null]
  asset_id uuid [not null]

  quantity int [not null, note: 'ต้อง > 0']

  status varchar(30) [not null, default: 'PENDING', note: '''
    PENDING
    APPROVED
    REJECTED
    PREPARED
    DELIVERED
    RETURNED
  ''']

  prepared_by uuid
  prepared_at timestamptz

  checked_out_by uuid
  checked_out_at timestamptz

  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    (reservation_id, asset_id) [unique]

    (asset_id, status)
    (reservation_id, status)
  }
}


// =====================================================
// RESERVATION ITEM UNITS (specific serials assigned at prepare time)
// =====================================================

Table reservation_item_units {
  id uuid [pk]

  reservation_item_id uuid [not null]
  asset_unit_id uuid [not null]

  status varchar(20) [not null, default: 'ASSIGNED', note: '''
    ASSIGNED
    CHECKED_OUT
    RETURNED_GOOD
    RETURNED_BROKEN
    RETURNED_LOST
  ''']

  assigned_by uuid [not null]
  assigned_at timestamptz [not null, default: `now()`]
  checked_out_at timestamptz
  returned_at timestamptz

  indexes {
    (reservation_item_id, asset_unit_id) [unique]
    (asset_unit_id)
    (reservation_item_id, status)
  }
}


// UNIQUE (partial, added in raw migration SQL, not expressible in this ERD tool):
// one active (status IN ('ASSIGNED','CHECKED_OUT')) assignment per asset_unit_id
// -- this is what stops the same physical serial being handed out to two
// reservations at once.


// =====================================================
// RESERVATION PARTICIPANTS
// =====================================================

Table reservation_participants {
  reservation_id uuid [not null]
  user_id uuid [not null]

  created_at timestamptz [not null, default: `now()`]

  indexes {
    (reservation_id, user_id) [pk]
  }
}


// =====================================================
// RESERVATION ITEM APPROVAL
// =====================================================

Table reservation_item_approvals {
  id uuid [pk]

  reservation_item_id uuid [not null, unique]

  approver_id uuid [not null]

  status varchar(20) [not null, default: 'PENDING', note: '''
    PENDING
    APPROVED
    REJECTED
  ''']

  comment text

  decided_at timestamptz

  created_at timestamptz [not null, default: `now()`]
}


// =====================================================
// RESERVATION CHANGE REQUEST
// =====================================================

Table reservation_change_requests {
  id uuid [pk]

  reservation_id uuid [not null]
  requested_by uuid [not null]

  change_data jsonb [not null]

  reason text

  status varchar(20) [not null, default: 'PENDING', note: '''
    PENDING
    APPROVED
    REJECTED
    CANCELLED
  ''']

  reviewed_by uuid
  reviewed_at timestamptz

  created_at timestamptz [not null, default: `now()`]

  indexes {
    (reservation_id, status)
  }
}


// =====================================================
// RETURN
// =====================================================

Table returns {
  id uuid [pk]

  reservation_id uuid [not null]

  returned_by uuid [not null]

  status varchar(20) [not null, default: 'PENDING', note: '''
    PENDING
    APPROVED
    REJECTED
    COMPLETED
  ''']

  returned_at timestamptz

  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    (reservation_id)
    (status)
  }
}


// =====================================================
// RETURN ITEMS
// =====================================================

Table return_items {
  id uuid [pk]

  return_id uuid [not null]
  reservation_item_id uuid [not null]

  description text
  picture_url text

  created_at timestamptz [not null, default: `now()`]

  indexes {
    (return_id, reservation_item_id) [unique]
    (reservation_item_id)
  }
}


// =====================================================
// RETURN ITEM UNITS (per-serial drop-off + condition -- replaces the old
// quantity_returned/quantity_broken/quantity_lost counters)
// =====================================================

Table return_item_units {
  id uuid [pk]

  return_item_id uuid [not null]
  reservation_item_unit_id uuid [not null, unique, note: 'A checked-out unit can be settled by exactly one return_item_unit, ever']

  condition varchar(10) [note: '''
    GOOD
    BROKEN
    LOST

    NULL until the return is inspected and decided at return-approval time;
    set at drop-off submission only if already known, otherwise decided later.
  ''']

  picture_url text
  note text

  created_at timestamptz [not null, default: `now()`]

  indexes {
    (return_item_id)
  }
}


// =====================================================
// RETURN APPROVAL
// =====================================================

Table return_approvals {
  id uuid [pk]

  return_id uuid [not null, unique]

  approver_id uuid [not null]

  status varchar(20) [not null, default: 'PENDING', note: '''
    PENDING
    APPROVED
    REJECTED
  ''']

  description text

  decided_at timestamptz

  created_at timestamptz [not null, default: `now()`]
}


// =====================================================
// ACTIVITY LOG
// =====================================================

Table activity_logs {
  id uuid [pk]

  reservation_id uuid [note: 'SET NULL not modeled here -- Prisma onDelete: Cascade, deleted when the reservation is deleted']
  actor_id uuid [not null]

  action varchar(60) [not null]
  entity_type varchar(40) [not null]
  entity_id uuid

  details jsonb

  created_at timestamptz [not null, default: `now()`]

  indexes {
    (reservation_id, created_at)
    (actor_id, created_at)
    (action, created_at)
  }
}


// =====================================================
// EMAIL TEMPLATES
// =====================================================

Table email_templates {
  situation varchar(50) [pk, note: 'Fixed keys, not a generated id: reservation_submitted, reservation_decided, return_decided']

  subject varchar(255) [not null]
  body_markdown text [not null]

  updated_by uuid

  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]
}


// =====================================================
// NOTIFICATION SETTINGS
// =====================================================

Table notification_settings {
  id uuid [pk, note: 'Singleton row, always looked up/upserted by one fixed id']

  smtp_host varchar(255) [not null]
  smtp_port int [not null]
  smtp_user varchar(255) [not null]
  smtp_app_password_cipher text [not null, note: 'AES-256-GCM ciphertext -- never the raw App Password']
  from_email varchar(255) [not null]
  from_name varchar(255) [not null]

  updated_by uuid

  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]
}


// =====================================================
// REFERENCES
// =====================================================


// USER

Ref: user_profiles.user_id - users.id
Ref: user_auth_identities.user_id > users.id


// RBAC
Ref: user_roles.user_id > users.id
Ref: user_roles.role_id > roles.id
Ref: user_roles.management_area_id > management_areas.id
Ref: user_roles.assigned_by > users.id


// ASSET

Ref: assets.management_area_id > management_areas.id
Ref: assets.created_by > users.id


// ASSET UNIT

Ref: asset_units.asset_id > assets.id


// ASSET UNIT EVENT

Ref: asset_unit_event_batches.performed_by > users.id

Ref: asset_unit_events.batch_id > asset_unit_event_batches.id
Ref: asset_unit_events.asset_unit_id > asset_units.id
Ref: asset_unit_events.reservation_item_id > reservation_items.id


// RESERVATION

Ref: reservations.requester_id > users.id

Ref: reservation_items.reservation_id > reservations.id
Ref: reservation_items.asset_id > assets.id

Ref: reservation_items.prepared_by > users.id
Ref: reservation_items.checked_out_by > users.id

Ref: reservation_item_units.reservation_item_id > reservation_items.id
Ref: reservation_item_units.asset_unit_id > asset_units.id
Ref: reservation_item_units.assigned_by > users.id

Ref: reservation_participants.reservation_id > reservations.id
Ref: reservation_participants.user_id > users.id


// RESERVATION APPROVAL

Ref: reservation_item_approvals.reservation_item_id > reservation_items.id
Ref: reservation_item_approvals.approver_id > users.id


// RESERVATION CHANGE

Ref: reservation_change_requests.reservation_id > reservations.id
Ref: reservation_change_requests.requested_by > users.id
Ref: reservation_change_requests.reviewed_by > users.id


// RETURN

Ref: returns.reservation_id > reservations.id
Ref: returns.returned_by > users.id

Ref: return_items.return_id > returns.id
Ref: return_items.reservation_item_id > reservation_items.id

Ref: return_item_units.return_item_id > return_items.id
Ref: return_item_units.reservation_item_unit_id > reservation_item_units.id

Ref: return_approvals.return_id > returns.id
Ref: return_approvals.approver_id > users.id


// ACTIVITY LOG

Ref: activity_logs.reservation_id > reservations.id
Ref: activity_logs.actor_id > users.id


// EMAIL TEMPLATES / NOTIFICATION SETTINGS

Ref: email_templates.updated_by > users.id
Ref: notification_settings.updated_by > users.id
```
