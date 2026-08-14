-- CreateTable
CREATE TABLE "asset_templates" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "asset_template_id" UUID,
    "management_area_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "picture_url" TEXT,
    "total_quantity" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assets_total_quantity_check" CHECK ("total_quantity" >= 0)
);

-- CreateTable
CREATE TABLE "asset_transaction_batches" (
    "id" UUID NOT NULL,
    "description" TEXT,
    "performed_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_transaction_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_transactions" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "transaction_type" VARCHAR(30) NOT NULL,
    "quantity_delta" INTEGER NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_transactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "asset_transactions_type_check" CHECK ("transaction_type" IN ('ADD', 'REMOVE', 'LOST', 'BROKEN', 'REPAIR', 'RETURN', 'ADJUSTMENT'))
);

-- CreateTable
CREATE TABLE "management_areas" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "management_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "roles_name_check" CHECK ("name" IN ('ADMIN', 'MANAGER', 'USER'))
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "management_area_id" UUID,
    "assigned_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "event_name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reservations_date_range_check" CHECK ("end_at" > "start_at"),
    CONSTRAINT "reservations_status_check" CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'PARTIALLY_APPROVED', 'APPROVED', 'REJECTED', 'CANCELLED', 'ACTIVE', 'COMPLETED'))
);

-- CreateTable
CREATE TABLE "reservation_items" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "prepared_by" UUID,
    "prepared_at" TIMESTAMPTZ(6),
    "checked_out_by" UUID,
    "checked_out_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reservation_items_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "reservation_items_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'PREPARED', 'CHECKED_OUT', 'RETURNED'))
);

-- CreateTable
CREATE TABLE "reservation_participants" (
    "reservation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_participants_pkey" PRIMARY KEY ("reservation_id","user_id")
);

-- CreateTable
CREATE TABLE "reservation_item_approvals" (
    "id" UUID NOT NULL,
    "reservation_item_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_item_approvals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reservation_item_approvals_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED'))
);

-- CreateTable
CREATE TABLE "reservation_change_requests" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "change_data" JSONB NOT NULL,
    "reason" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_change_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reservation_change_requests_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'))
);

-- CreateTable
CREATE TABLE "returns" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "returned_by" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "returned_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "returns_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "returns_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'))
);

-- CreateTable
CREATE TABLE "return_items" (
    "id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "reservation_item_id" UUID NOT NULL,
    "quantity_returned" INTEGER NOT NULL DEFAULT 0,
    "quantity_broken" INTEGER NOT NULL DEFAULT 0,
    "quantity_lost" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "return_items_quantities_check" CHECK (
        "quantity_returned" >= 0 AND
        "quantity_broken" >= 0 AND
        "quantity_lost" >= 0
    )
);

-- CreateTable
CREATE TABLE "return_approvals" (
    "id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_approvals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "return_approvals_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED'))
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "user_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "phone_number" VARCHAR(30),
    "profile_picture_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_auth_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "provider_user_id" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_auth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "asset_templates_name_key" ON "asset_templates"("name");

-- CreateIndex
CREATE UNIQUE INDEX "assets_management_area_id_name_key" ON "assets"("management_area_id", "name");

-- CreateIndex
CREATE INDEX "assets_asset_template_id_idx" ON "assets"("asset_template_id");

-- CreateIndex
CREATE INDEX "asset_transaction_batches_performed_by_idx" ON "asset_transaction_batches"("performed_by");

-- CreateIndex
CREATE INDEX "asset_transactions_asset_id_created_at_idx" ON "asset_transactions"("asset_id", "created_at");

-- CreateIndex
CREATE INDEX "asset_transactions_batch_id_idx" ON "asset_transactions"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "management_areas_name_key" ON "management_areas"("name");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_scoped_key" ON "user_roles"("user_id", "role_id", "management_area_id") WHERE ("management_area_id" IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_global_key" ON "user_roles"("user_id", "role_id") WHERE ("management_area_id" IS NULL);

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE INDEX "user_roles_management_area_id_idx" ON "user_roles"("management_area_id");

-- CreateIndex
CREATE INDEX "user_roles_assigned_by_idx" ON "user_roles"("assigned_by");

-- CreateIndex
CREATE INDEX "reservations_requester_id_created_at_idx" ON "reservations"("requester_id", "created_at");

-- CreateIndex
CREATE INDEX "reservations_start_at_end_at_idx" ON "reservations"("start_at", "end_at");

-- CreateIndex
CREATE INDEX "reservations_status_idx" ON "reservations"("status");

-- CreateIndex
CREATE INDEX "reservation_items_asset_id_status_idx" ON "reservation_items"("asset_id", "status");

-- CreateIndex
CREATE INDEX "reservation_items_reservation_id_status_idx" ON "reservation_items"("reservation_id", "status");

-- CreateIndex
CREATE INDEX "reservation_items_prepared_by_idx" ON "reservation_items"("prepared_by");

-- CreateIndex
CREATE INDEX "reservation_items_checked_out_by_idx" ON "reservation_items"("checked_out_by");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_items_reservation_id_asset_id_key" ON "reservation_items"("reservation_id", "asset_id");

-- CreateIndex
CREATE INDEX "reservation_participants_user_id_idx" ON "reservation_participants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_item_approvals_reservation_item_id_key" ON "reservation_item_approvals"("reservation_item_id");

-- CreateIndex
CREATE INDEX "reservation_item_approvals_approver_id_idx" ON "reservation_item_approvals"("approver_id");

-- CreateIndex
CREATE INDEX "reservation_change_requests_reservation_id_status_idx" ON "reservation_change_requests"("reservation_id", "status");

-- CreateIndex
CREATE INDEX "reservation_change_requests_requested_by_idx" ON "reservation_change_requests"("requested_by");

-- CreateIndex
CREATE INDEX "reservation_change_requests_reviewed_by_idx" ON "reservation_change_requests"("reviewed_by");

-- CreateIndex
CREATE INDEX "returns_reservation_id_idx" ON "returns"("reservation_id");

-- CreateIndex
CREATE INDEX "returns_status_idx" ON "returns"("status");

-- CreateIndex
CREATE INDEX "returns_returned_by_idx" ON "returns"("returned_by");

-- CreateIndex
CREATE UNIQUE INDEX "return_items_return_id_reservation_item_id_key" ON "return_items"("return_id", "reservation_item_id");

-- CreateIndex
CREATE INDEX "return_items_reservation_item_id_idx" ON "return_items"("reservation_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "return_approvals_return_id_key" ON "return_approvals"("return_id");

-- CreateIndex
CREATE INDEX "return_approvals_approver_id_idx" ON "return_approvals"("approver_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_auth_identities_provider_provider_user_id_key" ON "user_auth_identities"("provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_auth_identities_user_id_provider_key" ON "user_auth_identities"("user_id", "provider");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_asset_template_id_fkey" FOREIGN KEY ("asset_template_id") REFERENCES "asset_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_management_area_id_fkey" FOREIGN KEY ("management_area_id") REFERENCES "management_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_transaction_batches" ADD CONSTRAINT "asset_transaction_batches_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_transactions" ADD CONSTRAINT "asset_transactions_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "asset_transaction_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_transactions" ADD CONSTRAINT "asset_transactions_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_management_area_id_fkey" FOREIGN KEY ("management_area_id") REFERENCES "management_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_items" ADD CONSTRAINT "reservation_items_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_items" ADD CONSTRAINT "reservation_items_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_items" ADD CONSTRAINT "reservation_items_prepared_by_fkey" FOREIGN KEY ("prepared_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_items" ADD CONSTRAINT "reservation_items_checked_out_by_fkey" FOREIGN KEY ("checked_out_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_participants" ADD CONSTRAINT "reservation_participants_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_participants" ADD CONSTRAINT "reservation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_item_approvals" ADD CONSTRAINT "reservation_item_approvals_reservation_item_id_fkey" FOREIGN KEY ("reservation_item_id") REFERENCES "reservation_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_item_approvals" ADD CONSTRAINT "reservation_item_approvals_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_change_requests" ADD CONSTRAINT "reservation_change_requests_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_change_requests" ADD CONSTRAINT "reservation_change_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_change_requests" ADD CONSTRAINT "reservation_change_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_returned_by_fkey" FOREIGN KEY ("returned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_reservation_item_id_fkey" FOREIGN KEY ("reservation_item_id") REFERENCES "reservation_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_approvals" ADD CONSTRAINT "return_approvals_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_approvals" ADD CONSTRAINT "return_approvals_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_auth_identities" ADD CONSTRAINT "user_auth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
