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
      "reservation:update",
      "reservation:approve",
      "reservation:reject",
      "return:approve",
    ],
  },
  {
    name: "USER",
    description: "View assets and manage their own reservations.",
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
  },
  items: {
    completedLogic: "00000000-0000-4000-8000-000000000611",
    completedKit: "00000000-0000-4000-8000-000000000612",
    approvedCamera: "00000000-0000-4000-8000-000000000613",
    pendingOscilloscope: "00000000-0000-4000-8000-000000000614",
  },
  approvals: {
    completedLogic: "00000000-0000-4000-8000-000000000621",
    completedKit: "00000000-0000-4000-8000-000000000622",
    approvedCamera: "00000000-0000-4000-8000-000000000623",
    pendingOscilloscope: "00000000-0000-4000-8000-000000000624",
  },
  return: "00000000-0000-4000-8000-000000000701",
  returnItems: [
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
  const email = (
    process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@example.com"
  ).trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "00000000";
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "System Admin";

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        id: ids.users.admin,
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

  const adminEmail = (
    process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@example.com"
  ).trim().toLowerCase();
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
    update: { description: "Application Engineer development tools and lab equipment." },
    create: {
      id: ids.areas.ae,
      name: "Application Engineer",
      description: "Application Engineer development tools and lab equipment.",
    },
  });

  const marketingArea = await prisma.managementArea.upsert({
    where: { name: "Marketing" },
    update: { description: "Marketing, event, and media production equipment." },
    create: {
      id: ids.areas.marketing,
      name: "Marketing",
      description: "Marketing, event, and media production equipment.",
    },
  });

  const warehouseArea = await prisma.managementArea.upsert({
    where: { name: "Warehouse" },
    update: { description: "Warehouse storage, logistics, and heavy handling equipment." },
    create: {
      id: ids.areas.warehouse,
      name: "Warehouse",
      description: "Warehouse storage, logistics, and heavy handling equipment.",
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
      description: "Heavy-duty electric powered pallet truck for warehouse logistics.",
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
      description: "Rugged wireless barcode and QR code scanner gun with charging cradle.",
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
      description: "Initial inventory load for AE, Marketing, HR, and Warehouse",
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

  // 7. Seed Reservations
  const reservations = [
    {
      id: ids.reservations.completed,
      eventName: "Q2 Firmware Testing Session",
      description: "Completed lab session with logic analyzer return.",
      startAt: new Date("2026-07-20T02:00:00.000Z"),
      endAt: new Date("2026-07-20T10:00:00.000Z"),
      status: "COMPLETED",
    },
    {
      id: ids.reservations.approved,
      eventName: "Product Launch Video Shoot",
      description: "Approved camera reservation for marketing content.",
      startAt: new Date("2026-09-10T02:00:00.000Z"),
      endAt: new Date("2026-09-10T11:00:00.000Z"),
      status: "APPROVED",
    },
    {
      id: ids.reservations.pending,
      eventName: "Field Hardware Diagnostics",
      description: "Pending oscilloscope request awaiting AE manager approval.",
      startAt: new Date("2026-08-25T06:00:00.000Z"),
      endAt: new Date("2026-08-25T10:00:00.000Z"),
      status: "PENDING_APPROVAL",
    },
  ] as const;

  for (const reservation of reservations) {
    const requesterEmail =
      reservation.id === ids.reservations.pending
        ? "user2@example.com"
        : "user1@example.com";
    await prisma.reservation.upsert({
      where: { id: reservation.id },
      update: {},
      create: { ...reservation, requesterId: userMap[requesterEmail]! },
    });
  }

  const completedAt = new Date("2026-07-20T01:00:00.000Z");
  const itemInputs = [
    {
      id: ids.items.completedLogic,
      reservationId: ids.reservations.completed,
      assetId: ids.assets.logicAnalyzer,
      quantity: 1,
      status: "RETURNED",
      preparedBy: userMap["ae@example.com"]!,
      preparedAt: completedAt,
      checkedOutBy: userMap["ae@example.com"]!,
      checkedOutAt: new Date("2026-07-20T01:30:00.000Z"),
    },
    {
      id: ids.items.completedKit,
      reservationId: ids.reservations.completed,
      assetId: ids.assets.onboardingKit,
      quantity: 1,
      status: "RETURNED",
      preparedBy: userMap["hr@example.com"]!,
      preparedAt: completedAt,
      checkedOutBy: userMap["hr@example.com"]!,
      checkedOutAt: new Date("2026-07-20T01:30:00.000Z"),
    },
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
    },
    {
      id: ids.items.pendingOscilloscope,
      reservationId: ids.reservations.pending,
      assetId: ids.assets.oscilloscope,
      quantity: 1,
      status: "PENDING",
      preparedBy: null,
      preparedAt: null,
      checkedOutBy: null,
      checkedOutAt: null,
    },
  ] as const;

  for (const item of itemInputs) {
    await prisma.reservationItem.upsert({
      where: { id: item.id },
      update: {},
      create: item,
    });
  }

  const approvalInputs = [
    [ids.approvals.completedLogic, ids.items.completedLogic, "APPROVED", userMap["ae@example.com"]!],
    [ids.approvals.completedKit, ids.items.completedKit, "APPROVED", userMap["hr@example.com"]!],
    [ids.approvals.approvedCamera, ids.items.approvedCamera, "APPROVED", userMap["mk@example.com"]!],
    [ids.approvals.pendingOscilloscope, ids.items.pendingOscilloscope, "PENDING", userMap["ae@example.com"]!],
  ] as const;

  for (const [id, reservationItemId, status, approverId] of approvalInputs) {
    await prisma.reservationItemApproval.upsert({
      where: { reservationItemId },
      update: {},
      create: {
        id,
        reservationItemId,
        approverId,
        status,
        comment:
          status === "PENDING"
            ? "Awaiting area manager review."
            : "Approved for the requested event.",
        decidedAt:
          status === "APPROVED" ? new Date("2026-07-18T05:00:00.000Z") : null,
      },
    });
  }

  // 8. Return Record for completed reservation
  await prisma.return.upsert({
    where: { id: ids.return },
    update: {},
    create: {
      id: ids.return,
      reservationId: ids.reservations.completed,
      returnedBy: userMap["user1@example.com"]!,
      status: "COMPLETED",
      returnedAt: new Date("2026-07-20T11:00:00.000Z"),
    },
  });

  for (const [index, reservationItemId] of [
    ids.items.completedLogic,
    ids.items.completedKit,
  ].entries()) {
    await prisma.returnItem.upsert({
      where: { id: ids.returnItems[index]! },
      update: {},
      create: {
        id: ids.returnItems[index]!,
        returnId: ids.return,
        reservationItemId,
        quantityReturned: 1,
        quantityBroken: 0,
        quantityLost: 0,
        description: "Returned in good condition.",
      },
    });
  }

  await prisma.returnApproval.upsert({
    where: { returnId: ids.return },
    update: {},
    create: {
      id: ids.returnApproval,
      returnId: ids.return,
      approverId: userMap["ae@example.com"]!,
      status: "APPROVED",
      description: "All returned items inspected and accepted.",
      decidedAt: new Date("2026-07-20T11:30:00.000Z"),
    },
  });

  console.log("\n=========================================");
  console.log("MOCK SEED COMPLETE:");
  console.log("Management Areas:");
  console.log("  1. Human Resource");
  console.log("  2. Application Engineer");
  console.log("  3. Marketing");
  console.log("  4. Warehouse");
  console.log("\nAccounts (Password: " + (process.env.MOCK_USER_PASSWORD || "password123456") + " or 00000000):");
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
