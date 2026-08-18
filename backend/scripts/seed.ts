import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "argon2";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { PrismaClient } from "../generated/prisma/client.js";
import { ensureSeedImages, seedImages } from "./seed-images.js";

config({ path: join(import.meta.dirname, "../.env") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const roles = [
  {
    name: "ADMIN",
    description:
      "Administer users, roles, assets, reservations, and returns globally.",
    permissions: [
      "asset:create",
      "asset:view",
      "asset:update",
      "asset:delete",
      "reservation:create",
      "reservation:view",
      "reservation:update",
      "reservation:approve",
      "reservation:reject",
      "return:approve",
      "user:create",
      "user:disable",
      "role:assign",
    ],
  },
  {
    name: "MANAGER",
    description: "Manage assets and workflows in assigned areas.",
    permissions: [
      "asset:create",
      "asset:view",
      "asset:update",
      "reservation:create",
      "reservation:view",
      "reservation:update",
      "reservation:approve",
      "reservation:reject",
      "return:approve",
    ],
  },
  {
    name: "USER",
    description: "View assets and manage their own reservations.",
    // No reservation:view — regular users can only see their own reservations.
    permissions: ["asset:view", "reservation:create", "reservation:update"],
  },
] as const;

const ids = {
  users: {
    admin: "00000000-0000-4000-8000-000000000100",
    ae: "00000000-0000-4000-8000-000000000101",
    mk: "00000000-0000-4000-8000-000000000102",
    hr: "00000000-0000-4000-8000-000000000103",
    wh: "00000000-0000-4000-8000-000000000106",
    user1: "00000000-0000-4000-8000-000000000104",
    user2: "00000000-0000-4000-8000-000000000105",
  },
  areas: {
    hr: "00000000-0000-4000-8000-000000000201",
    ae: "00000000-0000-4000-8000-000000000202",
    marketing: "00000000-0000-4000-8000-000000000203",
    warehouse: "00000000-0000-4000-8000-000000000204",
  },
  assets: {
    logicAnalyzer: "00000000-0000-4000-8000-000000000401",
    oscilloscope: "00000000-0000-4000-8000-000000000402",
    camera: "00000000-0000-4000-8000-000000000403",
    wirelessMic: "00000000-0000-4000-8000-000000000404",
    onboardingKit: "00000000-0000-4000-8000-000000000405",
    ergonomicChair: "00000000-0000-4000-8000-000000000406",
    palletJack: "00000000-0000-4000-8000-000000000407",
    handTruck: "00000000-0000-4000-8000-000000000408",
    barcodeScanner: "00000000-0000-4000-8000-000000000409",
    platformCart: "00000000-0000-4000-8000-000000000410",
  },
  batch: "00000000-0000-4000-8000-000000000501",
  transactions: [
    "00000000-0000-4000-8000-000000000511",
    "00000000-0000-4000-8000-000000000512",
    "00000000-0000-4000-8000-000000000513",
    "00000000-0000-4000-8000-000000000514",
    "00000000-0000-4000-8000-000000000515",
    "00000000-0000-4000-8000-000000000516",
    "00000000-0000-4000-8000-000000000517",
    "00000000-0000-4000-8000-000000000518",
    "00000000-0000-4000-8000-000000000519",
    "00000000-0000-4000-8000-000000000520",
  ],
  reservations: {
    completed: "00000000-0000-4000-8000-000000000601",
    approved: "00000000-0000-4000-8000-000000000602",
    pending: "00000000-0000-4000-8000-000000000603",
    pendingApproval: "00000000-0000-4000-8000-000000000603",
    draft: "00000000-0000-4000-8000-000000000604",
    pendingReview: "00000000-0000-4000-8000-000000000605",
    partiallyApproved: "00000000-0000-4000-8000-000000000606",
    deliveryConfirmed: "00000000-0000-4000-8000-000000000607",
    active: "00000000-0000-4000-8000-000000000608",
    returnPhase: "00000000-0000-4000-8000-000000000609",
    returnPending: "00000000-0000-4000-8000-00000000060a",
    returnConfirmed: "00000000-0000-4000-8000-00000000060b",
    rejected: "00000000-0000-4000-8000-00000000060c",
    cancelled: "00000000-0000-4000-8000-00000000060d",
  },
  handovers: {
    completed: "00000000-0000-4000-8000-000000000641",
    deliveryConfirmed: "00000000-0000-4000-8000-000000000642",
    active: "00000000-0000-4000-8000-000000000643",
    returnPhase: "00000000-0000-4000-8000-000000000644",
    returnPending: "00000000-0000-4000-8000-000000000645",
    returnConfirmed: "00000000-0000-4000-8000-000000000646",
  },
  items: {
    completedLogic: "00000000-0000-4000-8000-000000000611",
    completedKit: "00000000-0000-4000-8000-000000000612",
    approvedCamera: "00000000-0000-4000-8000-000000000613",
    pendingOscilloscope: "00000000-0000-4000-8000-000000000614",
    approvedMic: "00000000-0000-4000-8000-000000000615",
    draftMic: "00000000-0000-4000-8000-000000000616",
    draftScanner: "00000000-0000-4000-8000-000000000617",
    pendingScanner: "00000000-0000-4000-8000-000000000618",
    pendingTruck: "00000000-0000-4000-8000-000000000619",
    partialCamera: "00000000-0000-4000-8000-00000000061a",
    partialAnalyzer: "00000000-0000-4000-8000-00000000061b",
    deliveryAnalyzer: "00000000-0000-4000-8000-00000000061c",
    deliveryKit: "00000000-0000-4000-8000-00000000061d",
    activeCart: "00000000-0000-4000-8000-00000000061e",
    activeScanner: "00000000-0000-4000-8000-00000000061f",
    returnPhaseCart: "00000000-0000-4000-8000-000000000630",
    returnPhaseTruck: "00000000-0000-4000-8000-000000000631",
    returnPendingChair: "00000000-0000-4000-8000-000000000632",
    returnConfirmedJack: "00000000-0000-4000-8000-000000000633",
    rejectedOscilloscope: "00000000-0000-4000-8000-000000000634",
    cancelledCamera: "00000000-0000-4000-8000-000000000635",
    cancelledMic: "00000000-0000-4000-8000-000000000636",
  },
  approvals: {
    completedLogic: "00000000-0000-4000-8000-000000000621",
    completedKit: "00000000-0000-4000-8000-000000000622",
    approvedCamera: "00000000-0000-4000-8000-000000000623",
    pendingOscilloscope: "00000000-0000-4000-8000-000000000624",
    approvedMic: "00000000-0000-4000-8000-000000000625",
    draftMic: "00000000-0000-4000-8000-000000000626",
    draftScanner: "00000000-0000-4000-8000-000000000627",
    pendingScanner: "00000000-0000-4000-8000-000000000628",
    pendingTruck: "00000000-0000-4000-8000-000000000629",
    partialCamera: "00000000-0000-4000-8000-00000000062a",
    partialAnalyzer: "00000000-0000-4000-8000-00000000062b",
    deliveryAnalyzer: "00000000-0000-4000-8000-00000000062c",
    deliveryKit: "00000000-0000-4000-8000-00000000062d",
    activeCart: "00000000-0000-4000-8000-00000000062e",
    activeScanner: "00000000-0000-4000-8000-00000000062f",
    returnPhaseCart: "00000000-0000-4000-8000-000000000650",
    returnPhaseTruck: "00000000-0000-4000-8000-000000000651",
    returnPendingChair: "00000000-0000-4000-8000-000000000652",
    returnConfirmedJack: "00000000-0000-4000-8000-000000000653",
    rejectedOscilloscope: "00000000-0000-4000-8000-000000000654",
    cancelledCamera: "00000000-0000-4000-8000-000000000655",
    cancelledMic: "00000000-0000-4000-8000-000000000656",
  },
  changeRequests: {
    approvedExt: "00000000-0000-4000-8000-000000000671",
  },
  returns: {
    completed: "00000000-0000-4000-8000-000000000701",
    returnPhase: "00000000-0000-4000-8000-000000000702",
    returnPending: "00000000-0000-4000-8000-000000000703",
    returnConfirmed: "00000000-0000-4000-8000-000000000704",
  },
  returnItems: {
    completedLogic: "00000000-0000-4000-8000-000000000711",
    completedKit: "00000000-0000-4000-8000-000000000712",
    returnPhaseCart: "00000000-0000-4000-8000-000000000713",
    returnPhaseTruck: "00000000-0000-4000-8000-000000000714",
    returnPendingChair: "00000000-0000-4000-8000-000000000715",
    returnConfirmedJack: "00000000-0000-4000-8000-000000000716",
  },
  returnApprovals: {
    completed: "00000000-0000-4000-8000-000000000721",
    returnPhase: "00000000-0000-4000-8000-000000000722",
    returnPending: "00000000-0000-4000-8000-000000000723",
    returnConfirmed: "00000000-0000-4000-8000-000000000724",
  },
  return: "00000000-0000-4000-8000-000000000701",
  returnItemsLegacy: [
    "00000000-0000-4000-8000-000000000711",
    "00000000-0000-4000-8000-000000000712",
  ],
  returnApproval: "00000000-0000-4000-8000-000000000721",
} as const;

async function seedRoles(): Promise<void> {
  for (const role of roles) {
    const permissions = [...role.permissions].sort();
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description, permissions },
      create: { id: randomUUID(), ...role, permissions },
    });
  }
}

async function seedBootstrapAdmin(): Promise<void> {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@example.com")
    .trim()
    .toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "00000000";
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "System Admin";

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        id: ids.users.admin,
        // Derived from the email local-part, same convention the
        // 20260817130000_username_accounts migration uses to backfill
        // pre-existing rows -- keeps a fresh seed and a migrated database
        // producing the same username for this account.
        username: email.split("@")[0]!,
        email,
        passwordHash: await hash(password, { type: 2 }),
        profile: { create: { name } },
      },
    });
  }

  const admin = await prisma.role.findUniqueOrThrow({
    where: { name: "ADMIN" },
  });
  const adminAssignment = await prisma.userRole.findFirst({
    where: { userId: user.id, roleId: admin.id, managementAreaId: null },
  });
  if (!adminAssignment) {
    await prisma.userRole.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        roleId: admin.id,
        managementAreaId: null,
        assignedBy: user.id,
      },
    });
  }

  const userRole = await prisma.role.findUniqueOrThrow({
    where: { name: "USER" },
  });
  const userAssignment = await prisma.userRole.findFirst({
    where: { userId: user.id, roleId: userRole.id, managementAreaId: null },
  });
  if (!userAssignment) {
    await prisma.userRole.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        roleId: userRole.id,
        managementAreaId: null,
        assignedBy: user.id,
      },
    });
  }
  console.log(`Global admin ${email} is ready.`);
}

async function ensureRoleAssignment(data: {
  id: string;
  userId: string;
  roleId: string;
  managementAreaId: string | null;
  assignedBy: string;
}): Promise<void> {
  const existing = await prisma.userRole.findFirst({
    where: {
      userId: data.userId,
      roleId: data.roleId,
      managementAreaId: data.managementAreaId,
    },
  });
  if (!existing) await prisma.userRole.create({ data });
}

async function seedMockData(): Promise<void> {
  if (process.env.LOAD_MOCK_DATA !== "true") {
    console.log("LOAD_MOCK_DATA is not true; mock data creation skipped.");
    return;
  }

  const password = process.env.MOCK_USER_PASSWORD || "password123456";
  const passwordHash = await hash(password, { type: 2 });

  // 1. Create Accounts: ae, mk, hr, user
  const mockUsers = [
    {
      id: ids.users.ae,
      email: "ae@example.com",
      name: "AE Manager",
      phoneNumber: "+66 81 000 0101",
    },
    {
      id: ids.users.mk,
      email: "mk@example.com",
      name: "Marketing Manager",
      phoneNumber: "+66 81 000 0102",
    },
    {
      id: ids.users.hr,
      email: "hr@example.com",
      name: "HR Manager",
      phoneNumber: "+66 81 000 0103",
    },
    {
      id: ids.users.wh,
      email: "wh@example.com",
      name: "Warehouse Manager",
      phoneNumber: "+66 81 000 0106",
    },
    {
      id: ids.users.user1,
      email: "user1@example.com",
      name: "User One",
      phoneNumber: "+66 81 000 0104",
    },
    {
      id: ids.users.user2,
      email: "user2@example.com",
      name: "User Two",
      phoneNumber: "+66 81 000 0105",
    },
  ] as const;

  const userMap: Record<string, string> = {};
  for (const userData of mockUsers) {
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: {
        id: userData.id,
        username: userData.email.split("@")[0]!,
        email: userData.email,
        passwordHash,
      },
    });
    userMap[userData.email] = user.id;
    await prisma.userProfile.upsert({
      where: { userId: user.id },
      update: { name: userData.name, phoneNumber: userData.phoneNumber },
      create: {
        userId: user.id,
        name: userData.name,
        phoneNumber: userData.phoneNumber,
      },
    });
  }

  const adminEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@example.com")
    .trim()
    .toLowerCase();
  const adminUser = await prisma.user.findUniqueOrThrow({
    where: { email: adminEmail },
  });

  // 2. Create Management Areas: Human Resource, Application Engineer, Marketing, Warehouse
  const hrArea = await prisma.managementArea.upsert({
    where: { name: "Human Resource" },
    update: { description: "Human Resource management and office assets." },
    create: {
      id: ids.areas.hr,
      name: "Human Resource",
      description: "Human Resource management and office assets.",
    },
  });

  const aeArea = await prisma.managementArea.upsert({
    where: { name: "Application Engineer" },
    update: {
      description: "Application Engineer development tools and lab equipment.",
    },
    create: {
      id: ids.areas.ae,
      name: "Application Engineer",
      description: "Application Engineer development tools and lab equipment.",
    },
  });

  const marketingArea = await prisma.managementArea.upsert({
    where: { name: "Marketing" },
    update: {
      description: "Marketing, event, and media production equipment.",
    },
    create: {
      id: ids.areas.marketing,
      name: "Marketing",
      description: "Marketing, event, and media production equipment.",
    },
  });

  const warehouseArea = await prisma.managementArea.upsert({
    where: { name: "Warehouse" },
    update: {
      description:
        "Warehouse storage, logistics, and heavy handling equipment.",
    },
    create: {
      id: ids.areas.warehouse,
      name: "Warehouse",
      description:
        "Warehouse storage, logistics, and heavy handling equipment.",
    },
  });

  // 3. Assign Roles
  const managerRole = await prisma.role.findUniqueOrThrow({
    where: { name: "MANAGER" },
  });
  const userRole = await prisma.role.findUniqueOrThrow({
    where: { name: "USER" },
  });

  // Manager role assignments
  await ensureRoleAssignment({
    id: "00000000-0000-4000-8000-000000000121",
    userId: userMap["ae@example.com"]!,
    roleId: managerRole.id,
    managementAreaId: aeArea.id,
    assignedBy: adminUser.id,
  });
  await ensureRoleAssignment({
    id: "00000000-0000-4000-8000-000000000122",
    userId: userMap["mk@example.com"]!,
    roleId: managerRole.id,
    managementAreaId: marketingArea.id,
    assignedBy: adminUser.id,
  });
  await ensureRoleAssignment({
    id: "00000000-0000-4000-8000-000000000123",
    userId: userMap["hr@example.com"]!,
    roleId: managerRole.id,
    managementAreaId: hrArea.id,
    assignedBy: adminUser.id,
  });
  await ensureRoleAssignment({
    id: "00000000-0000-4000-8000-000000000124",
    userId: userMap["wh@example.com"]!,
    roleId: managerRole.id,
    managementAreaId: warehouseArea.id,
    assignedBy: adminUser.id,
  });

  // Default USER role assignments for every account
  for (const email of [
    "ae@example.com",
    "mk@example.com",
    "hr@example.com",
    "wh@example.com",
    "user1@example.com",
    "user2@example.com",
  ]) {
    await ensureRoleAssignment({
      id: randomUUID(),
      userId: userMap[email]!,
      roleId: userRole.id,
      managementAreaId: null,
      assignedBy: adminUser.id,
    });
  }

  // Ensure sample images are created in uploads/assets directory
  ensureSeedImages(join(import.meta.dirname, "../uploads/assets"));

  // 4. Create Assets
  const assetInputs = [
    {
      id: ids.assets.logicAnalyzer,
      managementAreaId: aeArea.id,
      name: "Saleae Logic Pro 16",
      description: "16-channel USB logic analyzer with probes.",
      pictureUrl: seedImages.logicAnalyzer.url,
      totalQuantity: 5,
      status: "ACTIVE",
      createdById: userMap["ae@example.com"]!,
    },
    {
      id: ids.assets.oscilloscope,
      managementAreaId: aeArea.id,
      name: "Rigol 4-Channel Digital Oscilloscope",
      description: "100MHz digital storage oscilloscope.",
      pictureUrl: seedImages.oscilloscope.url,
      totalQuantity: 4,
      status: "ACTIVE",
      createdById: userMap["ae@example.com"]!,
    },
    {
      id: ids.assets.camera,
      managementAreaId: marketingArea.id,
      name: "Sony Alpha 7 IV Kit",
      description: "Full-frame mirrorless camera with 24-70mm lens.",
      pictureUrl: seedImages.camera.url,
      totalQuantity: 3,
      status: "ACTIVE",
      createdById: userMap["mk@example.com"]!,
    },
    {
      id: ids.assets.wirelessMic,
      managementAreaId: marketingArea.id,
      name: "Rode Wireless GO II Dual Kit",
      description: "Dual channel compact wireless microphone system.",
      pictureUrl: seedImages.wirelessMic.url,
      totalQuantity: 6,
      status: "ACTIVE",
      createdById: userMap["mk@example.com"]!,
    },
    {
      id: ids.assets.onboardingKit,
      managementAreaId: hrArea.id,
      name: "New Hire Onboarding Tech Kit",
      description: "USB-C multi-port dock, wireless mouse, and keyboard.",
      pictureUrl: seedImages.onboardingKit.url,
      totalQuantity: 10,
      status: "ACTIVE",
      createdById: userMap["hr@example.com"]!,
    },
    {
      id: ids.assets.ergonomicChair,
      managementAreaId: hrArea.id,
      name: "Herman Miller Aeron Chair (Trial Unit)",
      description: "Adjustable ergonomic task chair for assessment.",
      pictureUrl: seedImages.ergonomicChair.url,
      totalQuantity: 2,
      status: "ACTIVE",
      createdById: userMap["hr@example.com"]!,
    },
    {
      id: ids.assets.palletJack,
      managementAreaId: warehouseArea.id,
      name: "Electric Pallet Jack 2.5T",
      description:
        "Heavy-duty electric powered pallet truck for warehouse logistics.",
      pictureUrl: seedImages.palletJack.url,
      totalQuantity: 3,
      status: "ACTIVE",
      createdById: userMap["wh@example.com"]!,
    },
    {
      id: ids.assets.handTruck,
      managementAreaId: warehouseArea.id,
      name: "Heavy-Duty Hand Truck 300kg",
      description: "Dual-handle industrial sack barrow with pneumatic wheels.",
      pictureUrl: seedImages.handTruck.url,
      totalQuantity: 6,
      status: "ACTIVE",
      createdById: userMap["wh@example.com"]!,
    },
    {
      id: ids.assets.barcodeScanner,
      managementAreaId: warehouseArea.id,
      name: "Zebra Industrial Barcode Scanner",
      description:
        "Rugged wireless barcode and QR code scanner gun with charging cradle.",
      pictureUrl: seedImages.barcodeScanner.url,
      totalQuantity: 8,
      status: "ACTIVE",
      createdById: userMap["wh@example.com"]!,
    },
    {
      id: ids.assets.platformCart,
      managementAreaId: warehouseArea.id,
      name: "Foldable Platform Trolley Cart",
      description: "300kg capacity steel platform trolley with folding handle.",
      pictureUrl: seedImages.platformCart.url,
      totalQuantity: 4,
      status: "ACTIVE",
      createdById: userMap["wh@example.com"]!,
    },
  ] as const;

  for (const asset of assetInputs) {
    await prisma.asset.upsert({
      where: { id: asset.id },
      update: { createdById: asset.createdById },
      create: asset,
    });
  }

  // 6. Asset Initial Transactions
  await prisma.assetTransactionBatch.upsert({
    where: { id: ids.batch },
    update: {},
    create: {
      id: ids.batch,
      description:
        "Initial inventory load for AE, Marketing, HR, and Warehouse",
      performedBy: adminUser.id,
    },
  });

  for (const [index, asset] of assetInputs.entries()) {
    await prisma.assetTransaction.upsert({
      where: { id: ids.transactions[index]! },
      update: {},
      create: {
        id: ids.transactions[index]!,
        batchId: ids.batch,
        assetId: asset.id,
        transactionType: "ADD",
        quantityDelta: asset.totalQuantity,
        reason: "Opening balance for deployment mock data",
      },
    });
  }

  // 7. Seed Reservations covering ALL 13 statuses
  const reservations = [
    {
      id: ids.reservations.completed,
      eventName: "Q2 Firmware Testing Session",
      description:
        "Completed lab session with logic analyzer and onboarding kit returned.",
      startAt: new Date("2026-07-20T02:00:00.000Z"),
      endAt: new Date("2026-07-20T10:00:00.000Z"),
      status: "COMPLETED",
      requesterEmail: "user1@example.com",
    },
    {
      id: ids.reservations.approved,
      eventName: "Product Launch Video Shoot",
      description:
        "Approved camera and audio reservation for marketing content.",
      startAt: new Date("2026-09-10T02:00:00.000Z"),
      endAt: new Date("2026-09-10T11:00:00.000Z"),
      status: "APPROVED",
      requesterEmail: "user1@example.com",
    },
    {
      id: ids.reservations.pendingApproval,
      eventName: "Field Hardware Diagnostics",
      description: "Pending oscilloscope request awaiting AE manager approval.",
      startAt: new Date("2026-08-25T06:00:00.000Z"),
      endAt: new Date("2026-08-25T10:00:00.000Z"),
      status: "PENDING_APPROVAL",
      requesterEmail: "user2@example.com",
    },
    {
      id: ids.reservations.draft,
      eventName: "Internal Team Tech Workshop (Draft)",
      description:
        "Draft reservation for upcoming internal tech workshop and demonstration.",
      startAt: new Date("2026-09-01T02:00:00.000Z"),
      endAt: new Date("2026-09-01T10:00:00.000Z"),
      status: "DRAFT",
      requesterEmail: "user1@example.com",
    },
    {
      id: ids.reservations.pendingReview,
      eventName: "Q3 Inventory Barcode Audit",
      description:
        "Warehouse equipment check and audit session awaiting manager assignment.",
      startAt: new Date("2026-08-28T01:30:00.000Z"),
      endAt: new Date("2026-08-28T09:30:00.000Z"),
      status: "PENDING_APPROVAL",
      requesterEmail: "user1@example.com",
    },
    {
      id: ids.reservations.partiallyApproved,
      eventName: "Cross-Department Hackathon & Live Stream",
      description:
        "Multi-area reservation: camera approved by Marketing, while logic analyzer is pending AE review.",
      startAt: new Date("2026-09-05T01:00:00.000Z"),
      endAt: new Date("2026-09-06T10:00:00.000Z"),
      status: "PARTIALLY_APPROVED",
      requesterEmail: "user1@example.com",
    },
    {
      id: ids.reservations.deliveryConfirmed,
      eventName: "Regional Partner Demo Day",
      description:
        "Equipment prepared and handed over to requester; delivery confirmed.",
      startAt: new Date("2026-08-18T01:00:00.000Z"),
      endAt: new Date("2026-08-19T10:00:00.000Z"),
      status: "DELIVERY_CONFIRMED",
      requesterEmail: "user1@example.com",
    },
    {
      id: ids.reservations.active,
      eventName: "Annual Tech Expo On-site Operations",
      description:
        "Equipment handed over and dispatched for conference center operations.",
      startAt: new Date("2026-08-16T01:00:00.000Z"),
      endAt: new Date("2026-08-18T11:00:00.000Z"),
      status: "DELIVERY_CONFIRMED",
      requesterEmail: "user2@example.com",
    },
    {
      id: ids.reservations.returnPhase,
      eventName: "Office Relocation Logistics Phase 1",
      description:
        "Heavy carts used for office relocation, now in return pending stage.",
      startAt: new Date("2026-08-15T02:00:00.000Z"),
      endAt: new Date("2026-08-17T05:00:00.000Z"),
      status: "RETURN_PENDING",
      requesterEmail: "user1@example.com",
    },
    {
      id: ids.reservations.returnPending,
      eventName: "New Team Ergonomics Assessment",
      description:
        "Ergonomic chairs tested during trial period, return submitted and awaiting HR manager inspection.",
      startAt: new Date("2026-08-14T01:00:00.000Z"),
      endAt: new Date("2026-08-16T10:00:00.000Z"),
      status: "RETURN_PENDING",
      requesterEmail: "user2@example.com",
    },
    {
      id: ids.reservations.returnConfirmed,
      eventName: "Warehouse Storage Reorganization",
      description:
        "Electric pallet jack used for reorganization; return inspected and confirmed.",
      startAt: new Date("2026-08-12T02:00:00.000Z"),
      endAt: new Date("2026-08-14T10:00:00.000Z"),
      status: "RETURN_CONFIRMED",
      requesterEmail: "user1@example.com",
    },
    {
      id: ids.reservations.rejected,
      eventName: "High-Frequency Circuit Validation",
      description:
        "Oscilloscope request rejected due to scheduled lab maintenance conflict.",
      startAt: new Date("2026-08-10T02:00:00.000Z"),
      endAt: new Date("2026-08-10T10:00:00.000Z"),
      status: "REJECTED",
      requesterEmail: "user2@example.com",
    },
    {
      id: ids.reservations.cancelled,
      eventName: "Executive Offsite Media Coverage",
      description:
        "Video kit reservation cancelled by organizer due to rescheduled meeting.",
      startAt: new Date("2026-08-22T03:00:00.000Z"),
      endAt: new Date("2026-08-22T08:00:00.000Z"),
      status: "CANCELLED",
      requesterEmail: "user1@example.com",
    },
  ] as const;

  for (const reservation of reservations) {
    const { requesterEmail, ...resData } = reservation;
    await prisma.reservation.upsert({
      where: { id: resData.id },
      update: {
        eventName: resData.eventName,
        description: resData.description,
        startAt: resData.startAt,
        endAt: resData.endAt,
        status: resData.status,
      },
      create: { ...resData, requesterId: userMap[requesterEmail]! },
    });
  }

  // 8. Seed Participants (for collaborative events only)
  await prisma.reservationParticipant.deleteMany({});
  const collaborativeParticipants = [
    {
      reservationId: ids.reservations.partiallyApproved,
      userId: userMap["user2@example.com"]!,
    },
    {
      reservationId: ids.reservations.active,
      userId: userMap["user1@example.com"]!,
    },
  ];
  for (const p of collaborativeParticipants) {
    await prisma.reservationParticipant.create({
      data: {
        reservationId: p.reservationId,
        userId: p.userId,
      },
    });
  }

  // 9. Seed Handovers (for delivered, active, and returned reservations)
  const handoverInputs = [
    {
      id: ids.handovers.completed,
      reservationId: ids.reservations.completed,
      handledBy: userMap["ae@example.com"]!,
      photoUrls: [seedImages.logicAnalyzer.url],
      note: "Handed over equipment to requester at Lab B.",
      handedOverAt: new Date("2026-07-20T01:30:00.000Z"),
    },
    {
      id: ids.handovers.deliveryConfirmed,
      reservationId: ids.reservations.deliveryConfirmed,
      handledBy: userMap["ae@example.com"]!,
      photoUrls: [seedImages.logicAnalyzer.url],
      note: "Items handed over in good condition with cables and accessories.",
      handedOverAt: new Date("2026-08-17T09:00:00.000Z"),
    },
    {
      id: ids.handovers.active,
      reservationId: ids.reservations.active,
      handledBy: userMap["wh@example.com"]!,
      photoUrls: [seedImages.platformCart.url],
      note: "Dispatched to expo logistics team at main hall.",
      handedOverAt: new Date("2026-08-16T00:30:00.000Z"),
    },
    {
      id: ids.handovers.returnPhase,
      reservationId: ids.reservations.returnPhase,
      handledBy: userMap["wh@example.com"]!,
      photoUrls: [seedImages.handTruck.url],
      note: "Handed over to relocation crew.",
      handedOverAt: new Date("2026-08-15T01:30:00.000Z"),
    },
    {
      id: ids.handovers.returnPending,
      reservationId: ids.reservations.returnPending,
      handledBy: userMap["hr@example.com"]!,
      photoUrls: [seedImages.ergonomicChair.url],
      note: "Delivered trial chair to desk 4B.",
      handedOverAt: new Date("2026-08-14T00:30:00.000Z"),
    },
    {
      id: ids.handovers.returnConfirmed,
      reservationId: ids.reservations.returnConfirmed,
      handledBy: userMap["wh@example.com"]!,
      photoUrls: [seedImages.palletJack.url],
      note: "Assigned for storage reorganization.",
      handedOverAt: new Date("2026-08-12T01:30:00.000Z"),
    },
  ] as const;

  for (const handover of handoverInputs) {
    await prisma.reservationHandover.upsert({
      where: { id: handover.id },
      update: {
        handledBy: handover.handledBy,
        photoUrls: [...handover.photoUrls],
        note: handover.note,
        handedOverAt: handover.handedOverAt,
      },
      create: {
        ...handover,
        photoUrls: [...handover.photoUrls],
      },
    });
  }

  // 10. Seed Reservation Items
  const itemInputs = [
    // COMPLETED
    {
      id: ids.items.completedLogic,
      reservationId: ids.reservations.completed,
      assetId: ids.assets.logicAnalyzer,
      quantity: 1,
      status: "RETURNED",
      preparedBy: userMap["ae@example.com"]!,
      preparedAt: new Date("2026-07-20T01:00:00.000Z"),
      checkedOutBy: userMap["ae@example.com"]!,
      checkedOutAt: new Date("2026-07-20T01:30:00.000Z"),
      handoverId: ids.handovers.completed,
    },
    {
      id: ids.items.completedKit,
      reservationId: ids.reservations.completed,
      assetId: ids.assets.onboardingKit,
      quantity: 1,
      status: "RETURNED",
      preparedBy: userMap["hr@example.com"]!,
      preparedAt: new Date("2026-07-20T01:00:00.000Z"),
      checkedOutBy: userMap["hr@example.com"]!,
      checkedOutAt: new Date("2026-07-20T01:30:00.000Z"),
      handoverId: ids.handovers.completed,
    },
    // APPROVED
    {
      id: ids.items.approvedCamera,
      reservationId: ids.reservations.approved,
      assetId: ids.assets.camera,
      quantity: 1,
      status: "APPROVED",
      preparedBy: null,
      preparedAt: null,
      checkedOutBy: null,
      checkedOutAt: null,
      handoverId: null,
    },
    {
      id: ids.items.approvedMic,
      reservationId: ids.reservations.approved,
      assetId: ids.assets.wirelessMic,
      quantity: 2,
      status: "APPROVED",
      preparedBy: null,
      preparedAt: null,
      checkedOutBy: null,
      checkedOutAt: null,
      handoverId: null,
    },
    // PENDING_APPROVAL
    {
      id: ids.items.pendingOscilloscope,
      reservationId: ids.reservations.pendingApproval,
      assetId: ids.assets.oscilloscope,
      quantity: 1,
      status: "PENDING",
      preparedBy: null,
      preparedAt: null,
      checkedOutBy: null,
      checkedOutAt: null,
      handoverId: null,
    },
    // DRAFT
    {
      id: ids.items.draftMic,
      reservationId: ids.reservations.draft,
      assetId: ids.assets.wirelessMic,
      quantity: 2,
      status: "PENDING",
      preparedBy: null,
      preparedAt: null,
      checkedOutBy: null,
      checkedOutAt: null,
      handoverId: null,
    },
    {
      id: ids.items.draftScanner,
      reservationId: ids.reservations.draft,
      assetId: ids.assets.barcodeScanner,
      quantity: 1,
      status: "PENDING",
      preparedBy: null,
      preparedAt: null,
      checkedOutBy: null,
      checkedOutAt: null,
      handoverId: null,
    },
    // PENDING
    {
      id: ids.items.pendingScanner,
      reservationId: ids.reservations.pendingReview,
      assetId: ids.assets.barcodeScanner,
      quantity: 2,
      status: "PENDING",
      preparedBy: null,
      preparedAt: null,
      checkedOutBy: null,
      checkedOutAt: null,
      handoverId: null,
    },
    {
      id: ids.items.pendingTruck,
      reservationId: ids.reservations.pendingReview,
      assetId: ids.assets.handTruck,
      quantity: 1,
      status: "PENDING",
      preparedBy: null,
      preparedAt: null,
      checkedOutBy: null,
      checkedOutAt: null,
      handoverId: null,
    },
    // PARTIALLY_APPROVED
    {
      id: ids.items.partialCamera,
      reservationId: ids.reservations.partiallyApproved,
      assetId: ids.assets.camera,
      quantity: 1,
      status: "APPROVED",
      preparedBy: null,
      preparedAt: null,
      checkedOutBy: null,
      checkedOutAt: null,
      handoverId: null,
    },
    {
      id: ids.items.partialAnalyzer,
      reservationId: ids.reservations.partiallyApproved,
      assetId: ids.assets.logicAnalyzer,
      quantity: 1,
      status: "PENDING",
      preparedBy: null,
      preparedAt: null,
      checkedOutBy: null,
      checkedOutAt: null,
      handoverId: null,
    },
    // DELIVERY_CONFIRMED
    {
      id: ids.items.deliveryAnalyzer,
      reservationId: ids.reservations.deliveryConfirmed,
      assetId: ids.assets.logicAnalyzer,
      quantity: 1,
      status: "DELIVERED",
      preparedBy: userMap["ae@example.com"]!,
      preparedAt: new Date("2026-08-17T08:00:00.000Z"),
      checkedOutBy: userMap["ae@example.com"]!,
      checkedOutAt: new Date("2026-08-17T08:30:00.000Z"),
      handoverId: ids.handovers.deliveryConfirmed,
    },
    {
      id: ids.items.deliveryKit,
      reservationId: ids.reservations.deliveryConfirmed,
      assetId: ids.assets.onboardingKit,
      quantity: 1,
      status: "DELIVERED",
      preparedBy: userMap["hr@example.com"]!,
      preparedAt: new Date("2026-08-17T08:00:00.000Z"),
      checkedOutBy: userMap["hr@example.com"]!,
      checkedOutAt: new Date("2026-08-17T08:30:00.000Z"),
      handoverId: ids.handovers.deliveryConfirmed,
    },
    // ACTIVE
    {
      id: ids.items.activeCart,
      reservationId: ids.reservations.active,
      assetId: ids.assets.platformCart,
      quantity: 1,
      status: "DELIVERED",
      preparedBy: userMap["wh@example.com"]!,
      preparedAt: new Date("2026-08-15T15:00:00.000Z"),
      checkedOutBy: userMap["wh@example.com"]!,
      checkedOutAt: new Date("2026-08-16T00:30:00.000Z"),
      handoverId: ids.handovers.active,
    },
    {
      id: ids.items.activeScanner,
      reservationId: ids.reservations.active,
      assetId: ids.assets.barcodeScanner,
      quantity: 2,
      status: "DELIVERED",
      preparedBy: userMap["wh@example.com"]!,
      preparedAt: new Date("2026-08-15T15:00:00.000Z"),
      checkedOutBy: userMap["wh@example.com"]!,
      checkedOutAt: new Date("2026-08-16T00:30:00.000Z"),
      handoverId: ids.handovers.active,
    },
    // RETURN
    {
      id: ids.items.returnPhaseCart,
      reservationId: ids.reservations.returnPhase,
      assetId: ids.assets.platformCart,
      quantity: 1,
      status: "DELIVERED",
      preparedBy: userMap["wh@example.com"]!,
      preparedAt: new Date("2026-08-15T01:00:00.000Z"),
      checkedOutBy: userMap["wh@example.com"]!,
      checkedOutAt: new Date("2026-08-15T01:30:00.000Z"),
      handoverId: ids.handovers.returnPhase,
    },
    {
      id: ids.items.returnPhaseTruck,
      reservationId: ids.reservations.returnPhase,
      assetId: ids.assets.handTruck,
      quantity: 2,
      status: "DELIVERED",
      preparedBy: userMap["wh@example.com"]!,
      preparedAt: new Date("2026-08-15T01:00:00.000Z"),
      checkedOutBy: userMap["wh@example.com"]!,
      checkedOutAt: new Date("2026-08-15T01:30:00.000Z"),
      handoverId: ids.handovers.returnPhase,
    },
    // RETURN_PENDING
    {
      id: ids.items.returnPendingChair,
      reservationId: ids.reservations.returnPending,
      assetId: ids.assets.ergonomicChair,
      quantity: 1,
      status: "DELIVERED",
      preparedBy: userMap["hr@example.com"]!,
      preparedAt: new Date("2026-08-14T00:15:00.000Z"),
      checkedOutBy: userMap["hr@example.com"]!,
      checkedOutAt: new Date("2026-08-14T00:30:00.000Z"),
      handoverId: ids.handovers.returnPending,
    },
    // RETURN_CONFIRMED
    {
      id: ids.items.returnConfirmedJack,
      reservationId: ids.reservations.returnConfirmed,
      assetId: ids.assets.palletJack,
      quantity: 1,
      status: "DELIVERED",
      preparedBy: userMap["wh@example.com"]!,
      preparedAt: new Date("2026-08-12T01:00:00.000Z"),
      checkedOutBy: userMap["wh@example.com"]!,
      checkedOutAt: new Date("2026-08-12T01:30:00.000Z"),
      handoverId: ids.handovers.returnConfirmed,
    },
    // REJECTED
    {
      id: ids.items.rejectedOscilloscope,
      reservationId: ids.reservations.rejected,
      assetId: ids.assets.oscilloscope,
      quantity: 2,
      status: "REJECTED",
      preparedBy: null,
      preparedAt: null,
      checkedOutBy: null,
      checkedOutAt: null,
      handoverId: null,
    },
    // CANCELLED
    {
      id: ids.items.cancelledCamera,
      reservationId: ids.reservations.cancelled,
      assetId: ids.assets.camera,
      quantity: 1,
      status: "PENDING",
      preparedBy: null,
      preparedAt: null,
      checkedOutBy: null,
      checkedOutAt: null,
      handoverId: null,
    },
    {
      id: ids.items.cancelledMic,
      reservationId: ids.reservations.cancelled,
      assetId: ids.assets.wirelessMic,
      quantity: 1,
      status: "PENDING",
      preparedBy: null,
      preparedAt: null,
      checkedOutBy: null,
      checkedOutAt: null,
      handoverId: null,
    },
  ] as const;

  for (const item of itemInputs) {
    await prisma.reservationItem.upsert({
      where: { id: item.id },
      update: {
        quantity: item.quantity,
        status: item.status,
        preparedBy: item.preparedBy,
        preparedAt: item.preparedAt,
        checkedOutBy: item.checkedOutBy,
        checkedOutAt: item.checkedOutAt,
        handoverId: item.handoverId,
      },
      create: item,
    });
  }

  // 11. Seed Reservation Item Approvals
  const approvalInputs = [
    // COMPLETED
    [
      ids.approvals.completedLogic,
      ids.items.completedLogic,
      "APPROVED",
      userMap["ae@example.com"]!,
      "Approved for firmware testing.",
      new Date("2026-07-18T05:00:00.000Z"),
    ],
    [
      ids.approvals.completedKit,
      ids.items.completedKit,
      "APPROVED",
      userMap["hr@example.com"]!,
      "Approved for testing.",
      new Date("2026-07-18T05:00:00.000Z"),
    ],
    // APPROVED
    [
      ids.approvals.approvedCamera,
      ids.items.approvedCamera,
      "APPROVED",
      userMap["mk@example.com"]!,
      "Approved for product shoot.",
      new Date("2026-07-18T05:00:00.000Z"),
    ],
    [
      ids.approvals.approvedMic,
      ids.items.approvedMic,
      "APPROVED",
      userMap["mk@example.com"]!,
      "Approved dual mic kit.",
      new Date("2026-07-18T05:00:00.000Z"),
    ],
    // PENDING_APPROVAL
    [
      ids.approvals.pendingOscilloscope,
      ids.items.pendingOscilloscope,
      "PENDING",
      userMap["ae@example.com"]!,
      "Awaiting area manager review.",
      null,
    ],
    // DRAFT
    [
      ids.approvals.draftMic,
      ids.items.draftMic,
      "PENDING",
      userMap["mk@example.com"]!,
      "Draft - not yet submitted.",
      null,
    ],
    [
      ids.approvals.draftScanner,
      ids.items.draftScanner,
      "PENDING",
      userMap["wh@example.com"]!,
      "Draft - not yet submitted.",
      null,
    ],
    // PENDING
    [
      ids.approvals.pendingScanner,
      ids.items.pendingScanner,
      "PENDING",
      userMap["wh@example.com"]!,
      "Pending warehouse manager review.",
      null,
    ],
    [
      ids.approvals.pendingTruck,
      ids.items.pendingTruck,
      "PENDING",
      userMap["wh@example.com"]!,
      "Pending warehouse manager review.",
      null,
    ],
    // PARTIALLY_APPROVED
    [
      ids.approvals.partialCamera,
      ids.items.partialCamera,
      "APPROVED",
      userMap["mk@example.com"]!,
      "Approved for hackathon live stream.",
      new Date("2026-08-16T04:00:00.000Z"),
    ],
    [
      ids.approvals.partialAnalyzer,
      ids.items.partialAnalyzer,
      "PENDING",
      userMap["ae@example.com"]!,
      "Pending AE lab schedule confirmation.",
      null,
    ],
    // DELIVERY_CONFIRMED
    [
      ids.approvals.deliveryAnalyzer,
      ids.items.deliveryAnalyzer,
      "APPROVED",
      userMap["ae@example.com"]!,
      "Approved.",
      new Date("2026-08-16T03:00:00.000Z"),
    ],
    [
      ids.approvals.deliveryKit,
      ids.items.deliveryKit,
      "APPROVED",
      userMap["hr@example.com"]!,
      "Approved.",
      new Date("2026-08-16T03:00:00.000Z"),
    ],
    // ACTIVE
    [
      ids.approvals.activeCart,
      ids.items.activeCart,
      "APPROVED",
      userMap["wh@example.com"]!,
      "Approved for expo.",
      new Date("2026-08-15T02:00:00.000Z"),
    ],
    [
      ids.approvals.activeScanner,
      ids.items.activeScanner,
      "APPROVED",
      userMap["wh@example.com"]!,
      "Approved for expo.",
      new Date("2026-08-15T02:00:00.000Z"),
    ],
    // RETURN
    [
      ids.approvals.returnPhaseCart,
      ids.items.returnPhaseCart,
      "APPROVED",
      userMap["wh@example.com"]!,
      "Approved.",
      new Date("2026-08-14T02:00:00.000Z"),
    ],
    [
      ids.approvals.returnPhaseTruck,
      ids.items.returnPhaseTruck,
      "APPROVED",
      userMap["wh@example.com"]!,
      "Approved.",
      new Date("2026-08-14T02:00:00.000Z"),
    ],
    // RETURN_PENDING
    [
      ids.approvals.returnPendingChair,
      ids.items.returnPendingChair,
      "APPROVED",
      userMap["hr@example.com"]!,
      "Approved trial unit.",
      new Date("2026-08-13T03:00:00.000Z"),
    ],
    // RETURN_CONFIRMED
    [
      ids.approvals.returnConfirmedJack,
      ids.items.returnConfirmedJack,
      "APPROVED",
      userMap["wh@example.com"]!,
      "Approved.",
      new Date("2026-08-11T04:00:00.000Z"),
    ],
    // REJECTED
    [
      ids.approvals.rejectedOscilloscope,
      ids.items.rejectedOscilloscope,
      "REJECTED",
      userMap["ae@example.com"]!,
      "Instruments are scheduled for annual calibration during this window.",
      new Date("2026-08-09T03:00:00.000Z"),
    ],
    // CANCELLED
    [
      ids.approvals.cancelledCamera,
      ids.items.cancelledCamera,
      "PENDING",
      userMap["mk@example.com"]!,
      "Cancelled prior to manager review.",
      null,
    ],
    [
      ids.approvals.cancelledMic,
      ids.items.cancelledMic,
      "PENDING",
      userMap["mk@example.com"]!,
      "Cancelled prior to manager review.",
      null,
    ],
  ] as const;

  for (const [
    id,
    reservationItemId,
    status,
    approverId,
    comment,
    decidedAt,
  ] of approvalInputs) {
    await prisma.reservationItemApproval.upsert({
      where: { reservationItemId },
      update: {
        approverId,
        status,
        comment,
        decidedAt,
      },
      create: {
        id,
        reservationItemId,
        approverId,
        status,
        comment,
        decidedAt,
      },
    });
  }

  // 12. Seed Reservation Change Request
  await prisma.reservationChangeRequest.upsert({
    where: { id: ids.changeRequests.approvedExt },
    update: {},
    create: {
      id: ids.changeRequests.approvedExt,
      reservationId: ids.reservations.approved,
      requestedBy: userMap["user1@example.com"]!,
      changeData: {
        eventName: "Product Launch Video Shoot (Extended)",
        endAt: "2026-09-10T14:00:00.000Z",
      },
      reason: "Client extended the shooting schedule by 3 hours.",
      status: "PENDING",
      reviewedBy: null,
      reviewedAt: null,
    },
  });

  // 13. Seed Return Records
  // 13.1 COMPLETED Return
  await prisma.return.upsert({
    where: { id: ids.returns.completed },
    update: {
      status: "COMPLETED",
      returnedAt: new Date("2026-07-20T11:00:00.000Z"),
      photoUrls: [seedImages.logicAnalyzer.url],
      note: "Returned all equipment after successful test session.",
    },
    create: {
      id: ids.returns.completed,
      reservationId: ids.reservations.completed,
      returnedBy: userMap["user1@example.com"]!,
      status: "COMPLETED",
      returnedAt: new Date("2026-07-20T11:00:00.000Z"),
      photoUrls: [seedImages.logicAnalyzer.url],
      note: "Returned all equipment after successful test session.",
    },
  });

  await prisma.returnItem.upsert({
    where: { id: ids.returnItems.completedLogic },
    update: {},
    create: {
      id: ids.returnItems.completedLogic,
      returnId: ids.returns.completed,
      reservationItemId: ids.items.completedLogic,
      quantityReturned: 1,
      quantityBroken: 0,
      quantityLost: 0,
      description: "Returned in good condition.",
    },
  });

  await prisma.returnItem.upsert({
    where: { id: ids.returnItems.completedKit },
    update: {},
    create: {
      id: ids.returnItems.completedKit,
      returnId: ids.returns.completed,
      reservationItemId: ids.items.completedKit,
      quantityReturned: 1,
      quantityBroken: 0,
      quantityLost: 0,
      description: "Returned in good condition.",
    },
  });

  await prisma.returnApproval.upsert({
    where: { returnId: ids.returns.completed },
    update: {
      approverId: userMap["ae@example.com"]!,
      status: "APPROVED",
      description: "All returned items inspected and accepted.",
      decidedAt: new Date("2026-07-20T11:30:00.000Z"),
    },
    create: {
      id: ids.returnApprovals.completed,
      returnId: ids.returns.completed,
      approverId: userMap["ae@example.com"]!,
      status: "APPROVED",
      description: "All returned items inspected and accepted.",
      decidedAt: new Date("2026-07-20T11:30:00.000Z"),
    },
  });

  // 13.2 RETURN status (Return initiated, pending review)
  await prisma.return.upsert({
    where: { id: ids.returns.returnPhase },
    update: {
      status: "PENDING",
      returnedAt: new Date("2026-08-17T05:30:00.000Z"),
      photoUrls: [seedImages.platformCart.url],
      note: "Finished moving boxes, returning carts to warehouse.",
    },
    create: {
      id: ids.returns.returnPhase,
      reservationId: ids.reservations.returnPhase,
      returnedBy: userMap["user1@example.com"]!,
      status: "PENDING",
      returnedAt: new Date("2026-08-17T05:30:00.000Z"),
      photoUrls: [seedImages.platformCart.url],
      note: "Finished moving boxes, returning carts to warehouse.",
    },
  });

  await prisma.returnItem.upsert({
    where: { id: ids.returnItems.returnPhaseCart },
    update: {},
    create: {
      id: ids.returnItems.returnPhaseCart,
      returnId: ids.returns.returnPhase,
      reservationItemId: ids.items.returnPhaseCart,
      quantityReturned: 1,
      quantityBroken: 0,
      quantityLost: 0,
      description: "Returned intact.",
    },
  });

  await prisma.returnItem.upsert({
    where: { id: ids.returnItems.returnPhaseTruck },
    update: {},
    create: {
      id: ids.returnItems.returnPhaseTruck,
      returnId: ids.returns.returnPhase,
      reservationItemId: ids.items.returnPhaseTruck,
      quantityReturned: 2,
      quantityBroken: 0,
      quantityLost: 0,
      description: "Returned intact.",
    },
  });

  await prisma.returnApproval.upsert({
    where: { returnId: ids.returns.returnPhase },
    update: {
      approverId: userMap["wh@example.com"]!,
      status: "PENDING",
      description: null,
      decidedAt: null,
    },
    create: {
      id: ids.returnApprovals.returnPhase,
      returnId: ids.returns.returnPhase,
      approverId: userMap["wh@example.com"]!,
      status: "PENDING",
      description: null,
      decidedAt: null,
    },
  });

  // 13.3 RETURN_PENDING status (Return submitted, awaiting inspection)
  await prisma.return.upsert({
    where: { id: ids.returns.returnPending },
    update: {
      status: "PENDING",
      returnedAt: new Date("2026-08-16T10:30:00.000Z"),
      photoUrls: [seedImages.ergonomicChair.url],
      note: "Trial complete. Chair is in good condition.",
    },
    create: {
      id: ids.returns.returnPending,
      reservationId: ids.reservations.returnPending,
      returnedBy: userMap["user2@example.com"]!,
      status: "PENDING",
      returnedAt: new Date("2026-08-16T10:30:00.000Z"),
      photoUrls: [seedImages.ergonomicChair.url],
      note: "Trial complete. Chair is in good condition.",
    },
  });

  await prisma.returnItem.upsert({
    where: { id: ids.returnItems.returnPendingChair },
    update: {},
    create: {
      id: ids.returnItems.returnPendingChair,
      returnId: ids.returns.returnPending,
      reservationItemId: ids.items.returnPendingChair,
      quantityReturned: 1,
      quantityBroken: 0,
      quantityLost: 0,
      description: "Intact.",
    },
  });

  await prisma.returnApproval.upsert({
    where: { returnId: ids.returns.returnPending },
    update: {
      approverId: userMap["hr@example.com"]!,
      status: "PENDING",
      description: "Pending inspection by HR facility coordinator.",
      decidedAt: null,
    },
    create: {
      id: ids.returnApprovals.returnPending,
      returnId: ids.returns.returnPending,
      approverId: userMap["hr@example.com"]!,
      status: "PENDING",
      description: "Pending inspection by HR facility coordinator.",
      decidedAt: null,
    },
  });

  // 13.4 RETURN_CONFIRMED status (Return approved)
  await prisma.return.upsert({
    where: { id: ids.returns.returnConfirmed },
    update: {
      status: "APPROVED",
      returnedAt: new Date("2026-08-14T10:30:00.000Z"),
      photoUrls: [seedImages.palletJack.url],
      note: "Returned pallet jack with charging cord plugged in.",
    },
    create: {
      id: ids.returns.returnConfirmed,
      reservationId: ids.reservations.returnConfirmed,
      returnedBy: userMap["user1@example.com"]!,
      status: "APPROVED",
      returnedAt: new Date("2026-08-14T10:30:00.000Z"),
      photoUrls: [seedImages.palletJack.url],
      note: "Returned pallet jack with charging cord plugged in.",
    },
  });

  await prisma.returnItem.upsert({
    where: { id: ids.returnItems.returnConfirmedJack },
    update: {},
    create: {
      id: ids.returnItems.returnConfirmedJack,
      returnId: ids.returns.returnConfirmed,
      reservationItemId: ids.items.returnConfirmedJack,
      quantityReturned: 1,
      quantityBroken: 0,
      quantityLost: 0,
      description: "Returned and tested operational.",
    },
  });

  await prisma.returnApproval.upsert({
    where: { returnId: ids.returns.returnConfirmed },
    update: {
      approverId: userMap["wh@example.com"]!,
      status: "APPROVED",
      description:
        "Inspected by warehouse manager, battery charged and working.",
      decidedAt: new Date("2026-08-14T11:00:00.000Z"),
    },
    create: {
      id: ids.returnApprovals.returnConfirmed,
      returnId: ids.returns.returnConfirmed,
      approverId: userMap["wh@example.com"]!,
      status: "APPROVED",
      description:
        "Inspected by warehouse manager, battery charged and working.",
      decidedAt: new Date("2026-08-14T11:00:00.000Z"),
    },
  });

  console.log("\n=========================================");
  console.log("MOCK SEED COMPLETE:");
  console.log("Management Areas:");
  console.log("  1. Human Resource");
  console.log("  2. Application Engineer");
  console.log("  3. Marketing");
  console.log("  4. Warehouse");
  console.log("\nSeeded Reservations across all 13 statuses:");
  for (const r of reservations) {
    console.log(`  - [${r.status.padEnd(20)}] ${r.eventName} (${r.id})`);
  }
  console.log(
    "\nAccounts (Password: " +
      (process.env.MOCK_USER_PASSWORD || "password123456") +
      " or 00000000):",
  );
  console.log("  - admin@example.com -> Role: ADMIN (Global)");
  console.log("  - ae@example.com    -> Role: MANAGER (Application Engineer)");
  console.log("  - mk@example.com    -> Role: MANAGER (Marketing)");
  console.log("  - hr@example.com    -> Role: MANAGER (Human Resource)");
  console.log("  - wh@example.com    -> Role: MANAGER (Warehouse)");
  console.log("  - user1@example.com -> Role: USER (General)");
  console.log("  - user2@example.com -> Role: USER (General)");
  console.log("=========================================");
}

async function seed(): Promise<void> {
  await seedRoles();
  await seedBootstrapAdmin();
  await seedMockData();
}

try {
  await seed();
} finally {
  await prisma.$disconnect();
}
