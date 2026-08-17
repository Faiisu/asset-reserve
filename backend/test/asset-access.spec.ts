import { describe, expect, it } from "vitest";
import type { AuthenticatedActor } from "../src/auth/auth.types.js";
import {
  assertAreaPermission,
  hasAreaPermission,
  permittedAreaIds,
} from "../src/assets/asset-access.js";

const actor: AuthenticatedActor = {
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    username: "manager",
    email: "manager@example.com",
    isActive: true,
    profile: null,
    linkedProviders: ["google"],
    accountLinkRequired: false,
  },
  roles: [],
  effectivePermissions: {
    global: ["asset:view"],
    byManagementArea: [
      {
        managementAreaId: "00000000-0000-4000-8000-000000000101",
        permissions: ["asset:create", "asset:update", "asset:view"],
      },
    ],
  },
};

describe("asset area access", () => {
  it("applies global permissions to every management area", () => {
    expect(
      hasAreaPermission(
        actor,
        "asset:view",
        "00000000-0000-4000-8000-000000000999",
      ),
    ).toBe(true);
    expect(permittedAreaIds(actor, "asset:view")).toBeNull();
  });

  it("limits scoped mutation permissions to assigned areas", () => {
    expect(permittedAreaIds(actor, "asset:update")).toEqual([
      "00000000-0000-4000-8000-000000000101",
    ]);
    expect(() =>
      assertAreaPermission(
        actor,
        "asset:update",
        "00000000-0000-4000-8000-000000000999",
      ),
    ).toThrowError(/permission/i);
  });
});
