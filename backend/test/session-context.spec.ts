import { describe, expect, it } from "vitest";
import {
  buildSessionContext,
  type SessionSource,
} from "../src/auth/session-context.js";

const source: SessionSource = {
  id: "6e7fd59f-1499-4f7a-bb47-5d6a09d32650",
  username: "manager",
  email: "manager@example.com",
  isActive: true,
  profile: { name: "Manager", phoneNumber: null, profilePictureUrl: null },
  authIdentities: [],
  userRoles: [
    {
      id: "fbb74b56-c6f8-42b7-a465-a61ac9695208",
      role: {
        id: "c7f9bb2a-4367-4baa-a538-99f60e7415d8",
        name: "USER",
        permissions: ["asset:view"],
      },
      managementArea: null,
    },
    {
      id: "63bf6ef8-0a54-48e0-ad67-86addd665fef",
      role: {
        id: "cf4bfac3-5581-45aa-85ba-c6006eebfb76",
        name: "MANAGER",
        permissions: ["asset:update", "asset:view", "unknown:permission"],
      },
      managementArea: {
        id: "18403603-380d-439c-9d90-d2d3a58089fe",
        name: "Bangkok",
      },
    },
  ],
};

describe("buildSessionContext", () => {
  it("unions global permissions into each management-area scope", () => {
    const session = buildSessionContext(source);
    expect(session.effectivePermissions.global).toEqual(["asset:view"]);
    expect(session.effectivePermissions.byManagementArea).toEqual([
      {
        managementAreaId: "18403603-380d-439c-9d90-d2d3a58089fe",
        permissions: ["asset:update", "asset:view"],
      },
    ]);
  });

  it("does not expose permission keys outside the application catalog", () => {
    const session = buildSessionContext(source);
    expect(session.roles.flatMap((role) => role.permissions)).not.toContain(
      "unknown:permission",
    );
  });

  it("rejects inactive users", () => {
    expect(() => buildSessionContext({ ...source, isActive: false })).toThrow(
      /inactive user/i,
    );
  });

  it("reports linkedProviders from authIdentities", () => {
    expect(buildSessionContext(source).user.linkedProviders).toEqual([]);
    expect(
      buildSessionContext({
        ...source,
        authIdentities: [{ provider: "google" }],
      }).user.linkedProviders,
    ).toEqual(["google"]);
    expect(
      buildSessionContext({
        ...source,
        authIdentities: [{ provider: "google" }, { provider: "microsoft" }],
      }).user.linkedProviders,
    ).toEqual(["google", "microsoft"]);
  });
});
