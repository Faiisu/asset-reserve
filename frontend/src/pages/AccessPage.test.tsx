import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { api } from "../api";
import type { Role } from "../types";
import { AccessPage } from "./AccessPage";

vi.mock("../auth", () => ({
  useAuth: () => ({
    isGlobalAdmin: true,
    hasPermission: () => true,
    hasGlobalPermission: () => true,
  }),
}));

const mockRole: Role = {
  id: "role-1",
  name: "MANAGER",
  description: "Area manager",
  permissions: ["asset:view", "asset:create"],
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
};

const mockPermissions = [
  {
    key: "asset:view" as const,
    resource: "asset",
    action: "view",
    description: "View assets",
  },
  {
    key: "asset:create" as const,
    resource: "asset",
    action: "create",
    description: "Create assets",
  },
];

describe("AccessPage", () => {
  beforeEach(() => {
    vi.spyOn(api, "roles").mockResolvedValue({
      data: [mockRole],
    });
    vi.spyOn(api, "permissions").mockResolvedValue({
      data: mockPermissions,
    });
  });

  it("renders roles and opens create role dialog", async () => {
    vi.spyOn(api, "createRole").mockResolvedValue({
      id: "role-2",
      name: "TECHNICIAN",
      description: "Hardware technician",
      permissions: ["asset:view"],
      createdAt: "2026-08-16T00:00:00.000Z",
      updatedAt: "2026-08-16T00:00:00.000Z",
    });

    render(
      <MemoryRouter>
        <AccessPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Role registry")).toBeInTheDocument();
    expect(screen.getAllByText("MANAGER").length).toBeGreaterThan(0);

    const newBtn = screen.getByRole("button", { name: /New role/i });
    fireEvent.click(newBtn);

    const nameInput = screen.getByLabelText(/Role name/i);
    fireEvent.change(nameInput, { target: { value: "TECHNICIAN" } });

    const createBtn = screen.getByRole("button", { name: /Create role/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(api.createRole).toHaveBeenCalledWith(
        expect.objectContaining({ name: "TECHNICIAN" }),
      );
    });
  });
});
