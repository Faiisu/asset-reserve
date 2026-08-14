import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "argon2";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../generated/prisma/client.js";

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
    manager: "00000000-0000-4000-8000-000000000101",
    member: "00000000-0000-4000-8000-000000000102",
    technician: "00000000-0000-4000-8000-000000000103",
  },
  areas: {
    media: "00000000-0000-4000-8000-000000000201",
    events: "00000000-0000-4000-8000-000000000202",
  },
  templates: {
    projector: "00000000-0000-4000-8000-000000000301",
    camera: "00000000-0000-4000-8000-000000000302",
    audio: "00000000-0000-4000-8000-000000000303",
  },
  assets: {
    projector: "00000000-0000-4000-8000-000000000401",
    camera: "00000000-0000-4000-8000-000000000402",
    speaker: "00000000-0000-4000-8000-000000000403",
    microphone: "00000000-0000-4000-8000-000000000404",
  },
  batch: "00000000-0000-4000-8000-000000000501",
  transactions: [
    "00000000-0000-4000-8000-000000000511",
    "00000000-0000-4000-8000-000000000512",
    "00000000-0000-4000-8000-000000000513",
    "00000000-0000-4000-8000-000000000514",
  ],
  reservations: {
    completed: "00000000-0000-4000-8000-000000000601",
    approved: "00000000-0000-4000-8000-000000000602",
    pending: "00000000-0000-4000-8000-000000000603",
  },
  items: {
    completedProjector: "00000000-0000-4000-8000-000000000611",
    completedMicrophone: "00000000-0000-4000-8000-000000000612",
    approvedCamera: "00000000-0000-4000-8000-000000000613",
    pendingSpeaker: "00000000-0000-4000-8000-000000000614",
  },
  approvals: {
    completedProjector: "00000000-0000-4000-8000-000000000621",
    completedMicrophone: "00000000-0000-4000-8000-000000000622",
    approvedCamera: "00000000-0000-4000-8000-000000000623",
    pendingSpeaker: "00000000-0000-4000-8000-000000000624",
  },
  changeRequest: "00000000-0000-4000-8000-000000000631",
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
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "System Admin";
  if (!email || !password) {
    console.log("Bootstrap admin credentials not set; admin creation skipped.");
    return;
  }
  if (password.length < 12) {
    throw new Error(
      "BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters.",
    );
  }

  let user = await prisma.user.findUnique({ where: { email } });
  if (user && (!user.isActive || !user.passwordHash)) {
    throw new Error(
      "The bootstrap admin email belongs to an inactive or external-only user.",
    );
  }
  if (!user) {
    user = await prisma.user.create({
      data: {
        id: randomUUID(),
        email,
        passwordHash: await hash(password, { type: 2 }),
        profile: { create: { name } },
      },
    });
  }

  const admin = await prisma.role.findUniqueOrThrow({
    where: { name: "ADMIN" },
  });
  const assignment = await prisma.userRole.findFirst({
    where: { userId: user.id, roleId: admin.id, managementAreaId: null },
  });
  if (!assignment) {
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

  const password = process.env.MOCK_USER_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error("MOCK_USER_PASSWORD must contain at least 12 characters.");
  }
  const passwordHash = await hash(password, { type: 2 });
  const mockUsers = [
    {
      id: ids.users.manager,
      email: "manager@example.com",
      name: "Mali Area Manager",
      phoneNumber: "+66 81 000 0101",
    },
    {
      id: ids.users.member,
      email: "member@example.com",
      name: "Narin Project Member",
      phoneNumber: "+66 81 000 0102",
    },
    {
      id: ids.users.technician,
      email: "technician@example.com",
      name: "Ploy Equipment Technician",
      phoneNumber: "+66 81 000 0103",
    },
  ] as const;

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

  await prisma.userAuthIdentity.upsert({
    where: {
      provider_providerUserId: {
        provider: "google",
        providerUserId: "mock-member-google-id",
      },
    },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000111",
      userId: ids.users.member,
      provider: "google",
      providerUserId: "mock-member-google-id",
    },
  });

  const mediaArea = await prisma.managementArea.upsert({
    where: { name: "Media Lab" },
    update: {},
    create: {
      id: ids.areas.media,
      name: "Media Lab",
      description: "Cameras, projectors, and production equipment.",
    },
  });
  const eventsArea = await prisma.managementArea.upsert({
    where: { name: "Event Support" },
    update: {},
    create: {
      id: ids.areas.events,
      name: "Event Support",
      description: "Shared sound and event equipment.",
    },
  });

  const managerRole = await prisma.role.findUniqueOrThrow({
    where: { name: "MANAGER" },
  });
  const userRole = await prisma.role.findUniqueOrThrow({
    where: { name: "USER" },
  });
  await ensureRoleAssignment({
    id: "00000000-0000-4000-8000-000000000121",
    userId: ids.users.manager,
    roleId: managerRole.id,
    managementAreaId: mediaArea.id,
    assignedBy: ids.users.manager,
  });
  await ensureRoleAssignment({
    id: "00000000-0000-4000-8000-000000000122",
    userId: ids.users.manager,
    roleId: managerRole.id,
    managementAreaId: eventsArea.id,
    assignedBy: ids.users.manager,
  });
  for (const [id, userId] of [
    ["00000000-0000-4000-8000-000000000123", ids.users.member],
    ["00000000-0000-4000-8000-000000000124", ids.users.technician],
  ] as const) {
    await ensureRoleAssignment({
      id,
      userId,
      roleId: userRole.id,
      managementAreaId: null,
      assignedBy: ids.users.manager,
    });
  }

  const templates = await Promise.all([
    prisma.assetTemplate.upsert({
      where: { name: "Projector" },
      update: {},
      create: {
        id: ids.templates.projector,
        name: "Projector",
        description: "Portable projectors and presentation accessories.",
      },
    }),
    prisma.assetTemplate.upsert({
      where: { name: "Camera" },
      update: {},
      create: {
        id: ids.templates.camera,
        name: "Camera",
        description: "Digital cameras for documentation and media work.",
      },
    }),
    prisma.assetTemplate.upsert({
      where: { name: "Audio Equipment" },
      update: {},
      create: {
        id: ids.templates.audio,
        name: "Audio Equipment",
        description: "Speakers, microphones, and related accessories.",
      },
    }),
  ]);
  const [projectorTemplate, cameraTemplate, audioTemplate] = templates;

  const assetInputs = [
    {
      id: ids.assets.projector,
      assetTemplateId: projectorTemplate.id,
      managementAreaId: mediaArea.id,
      name: "Epson EB-FH52 Projector",
      description: "Full HD portable projector with HDMI cable.",
      totalQuantity: 6,
    },
    {
      id: ids.assets.camera,
      assetTemplateId: cameraTemplate.id,
      managementAreaId: mediaArea.id,
      name: "Sony Alpha Camera Kit",
      description: "Mirrorless camera, standard lens, battery, and case.",
      totalQuantity: 4,
    },
    {
      id: ids.assets.speaker,
      assetTemplateId: audioTemplate.id,
      managementAreaId: eventsArea.id,
      name: "Portable PA Speaker",
      description: "Battery-powered speaker for small and medium events.",
      totalQuantity: 8,
    },
    {
      id: ids.assets.microphone,
      assetTemplateId: audioTemplate.id,
      managementAreaId: eventsArea.id,
      name: "Wireless Microphone Set",
      description: "Dual handheld wireless microphone set.",
      totalQuantity: 12,
    },
  ] as const;
  for (const asset of assetInputs) {
    await prisma.asset.upsert({
      where: {
        managementAreaId_name: {
          managementAreaId: asset.managementAreaId,
          name: asset.name,
        },
      },
      update: {},
      create: asset,
    });
  }

  await prisma.assetTransactionBatch.upsert({
    where: { id: ids.batch },
    update: {},
    create: {
      id: ids.batch,
      description: "Initial mock inventory load",
      performedBy: ids.users.manager,
    },
  });
  for (const [index, asset] of assetInputs.entries()) {
    await prisma.assetTransaction.upsert({
      where: { id: ids.transactions[index] },
      update: {},
      create: {
        id: ids.transactions[index],
        batchId: ids.batch,
        assetId: asset.id,
        transactionType: "ADD",
        quantityDelta: asset.totalQuantity,
        reason: "Opening balance for deployment mock data",
      },
    });
  }

  const reservations = [
    {
      id: ids.reservations.completed,
      eventName: "July Community Workshop",
      description: "Completed booking with an approved return.",
      startAt: new Date("2026-07-20T02:00:00.000Z"),
      endAt: new Date("2026-07-20T10:00:00.000Z"),
      status: "COMPLETED",
    },
    {
      id: ids.reservations.approved,
      eventName: "September Product Showcase",
      description: "Approved camera reservation awaiting preparation.",
      startAt: new Date("2026-09-10T02:00:00.000Z"),
      endAt: new Date("2026-09-10T11:00:00.000Z"),
      status: "APPROVED",
    },
    {
      id: ids.reservations.pending,
      eventName: "Team Town Hall",
      description: "Pending speaker request demonstrating the approval queue.",
      startAt: new Date("2026-08-25T06:00:00.000Z"),
      endAt: new Date("2026-08-25T10:00:00.000Z"),
      status: "PENDING_APPROVAL",
    },
  ] as const;
  for (const reservation of reservations) {
    await prisma.reservation.upsert({
      where: { id: reservation.id },
      update: {},
      create: { ...reservation, requesterId: ids.users.member },
    });
    await prisma.reservationParticipant.upsert({
      where: {
        reservationId_userId: {
          reservationId: reservation.id,
          userId: ids.users.technician,
        },
      },
      update: {},
      create: {
        reservationId: reservation.id,
        userId: ids.users.technician,
      },
    });
  }

  const completedAt = new Date("2026-07-20T01:00:00.000Z");
  const itemInputs = [
    {
      id: ids.items.completedProjector,
      reservationId: ids.reservations.completed,
      assetId: ids.assets.projector,
      quantity: 1,
      status: "RETURNED",
      preparedBy: ids.users.technician,
      preparedAt: completedAt,
      checkedOutBy: ids.users.technician,
      checkedOutAt: new Date("2026-07-20T01:30:00.000Z"),
    },
    {
      id: ids.items.completedMicrophone,
      reservationId: ids.reservations.completed,
      assetId: ids.assets.microphone,
      quantity: 2,
      status: "RETURNED",
      preparedBy: ids.users.technician,
      preparedAt: completedAt,
      checkedOutBy: ids.users.technician,
      checkedOutAt: new Date("2026-07-20T01:30:00.000Z"),
    },
    {
      id: ids.items.approvedCamera,
      reservationId: ids.reservations.approved,
      assetId: ids.assets.camera,
      quantity: 2,
      status: "APPROVED",
      preparedBy: null,
      preparedAt: null,
      checkedOutBy: null,
      checkedOutAt: null,
    },
    {
      id: ids.items.pendingSpeaker,
      reservationId: ids.reservations.pending,
      assetId: ids.assets.speaker,
      quantity: 2,
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
    [
      ids.approvals.completedProjector,
      ids.items.completedProjector,
      "APPROVED",
    ],
    [
      ids.approvals.completedMicrophone,
      ids.items.completedMicrophone,
      "APPROVED",
    ],
    [ids.approvals.approvedCamera, ids.items.approvedCamera, "APPROVED"],
    [ids.approvals.pendingSpeaker, ids.items.pendingSpeaker, "PENDING"],
  ] as const;
  for (const [id, reservationItemId, status] of approvalInputs) {
    await prisma.reservationItemApproval.upsert({
      where: { reservationItemId },
      update: {},
      create: {
        id,
        reservationItemId,
        approverId: ids.users.manager,
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

  await prisma.reservationChangeRequest.upsert({
    where: { id: ids.changeRequest },
    update: {},
    create: {
      id: ids.changeRequest,
      reservationId: ids.reservations.approved,
      requestedBy: ids.users.member,
      changeData: { quantity: 2, note: "Added one camera for a second booth" },
      reason: "Showcase layout expanded after approval.",
      status: "APPROVED",
      reviewedBy: ids.users.manager,
      reviewedAt: new Date("2026-08-14T04:00:00.000Z"),
    },
  });

  await prisma.return.upsert({
    where: { id: ids.return },
    update: {},
    create: {
      id: ids.return,
      reservationId: ids.reservations.completed,
      returnedBy: ids.users.member,
      status: "COMPLETED",
      returnedAt: new Date("2026-07-20T11:00:00.000Z"),
    },
  });
  for (const [index, reservationItemId] of [
    ids.items.completedProjector,
    ids.items.completedMicrophone,
  ].entries()) {
    await prisma.returnItem.upsert({
      where: { id: ids.returnItems[index] },
      update: {},
      create: {
        id: ids.returnItems[index],
        returnId: ids.return,
        reservationItemId,
        quantityReturned: index === 0 ? 1 : 2,
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
      approverId: ids.users.manager,
      status: "APPROVED",
      description: "All returned items inspected and accepted.",
      decidedAt: new Date("2026-07-20T11:30:00.000Z"),
    },
  });

  console.log(
    "Mock data ready. Login users: manager@example.com, member@example.com, technician@example.com.",
  );
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
