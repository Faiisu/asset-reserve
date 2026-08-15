import { render, screen } from "@testing-library/react";
import { AuthProvider, useAuth } from "./auth";
import { setAccessToken } from "./api";
import type { SessionContext } from "./types";

const session: SessionContext = {
  user: {
    id: "user-1",
    email: "manager@example.com",
    isActive: true,
    profile: {
      name: "Asset Manager",
      phoneNumber: null,
      profilePictureUrl: null,
    },
  },
  roles: [
    {
      assignmentId: "assignment-1",
      id: "role-1",
      name: "MANAGER",
      permissions: ["asset:view", "asset:update"],
      managementArea: { id: "area-1", name: "Studio" },
    },
  ],
  effectivePermissions: {
    global: [],
    byManagementArea: [
      {
        managementAreaId: "area-1",
        permissions: ["asset:view", "asset:update"],
      },
    ],
  },
};

function PermissionProbe() {
  const { loading, hasPermission, hasGlobalPermission, isGlobalAdmin } =
    useAuth();
  if (loading) return <span>loading</span>;
  return (
    <div>
      <span>
        {hasPermission("asset:update") ? "can-update" : "cannot-update"}
      </span>
      <span>
        {hasGlobalPermission("asset:update")
          ? "global-update"
          : "scoped-update"}
      </span>
      <span>{isGlobalAdmin ? "admin" : "not-admin"}</span>
    </div>
  );
}

describe("AuthProvider", () => {
  it("distinguishes scoped and global permissions from session context", async () => {
    setAccessToken("token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ session }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <AuthProvider>
        <PermissionProbe />
      </AuthProvider>,
    );

    expect(await screen.findByText("can-update")).toBeInTheDocument();
    expect(screen.getByText("scoped-update")).toBeInTheDocument();
    expect(screen.getByText("not-admin")).toBeInTheDocument();
  });
});
