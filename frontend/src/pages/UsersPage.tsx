import {
  Ban,
  CheckCircle2,
  Filter,
  KeyRound,
  Mail,
  Plus,
  Search,
  ShieldPlus,
  Trash2,
  UserRound,
  UserRoundCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiClientError } from "../api";
import { useAuth } from "../auth";
import {
  Avatar,
  Button,
  CheckboxDropdownFilter,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Notice,
  RoleBadge,
  Select,
  StatusBadge,
  formatDate,
} from "../components/ui";
import type {
  ManagementArea,
  Role,
  RoleAssignment,
  UserDetail,
  UserListItem,
} from "../types";

export function UsersPage() {
  const { hasGlobalPermission, session } = useAuth();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [areas, setAreas] = useState<ManagementArea[]>([]);
  const [selected, setSelected] = useState<UserDetail | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [assignmentToRemove, setAssignmentToRemove] =
    useState<RoleAssignment | null>(null);

  const canView = ["user:create", "user:disable", "role:assign"].some(
    (permission) => hasGlobalPermission(permission as "user:create"),
  );
  const canCreate = hasGlobalPermission("user:create");
  const canDisable = hasGlobalPermission("user:disable");
  const canAssign = hasGlobalPermission("role:assign");

  const load = useCallback(
    async (cursor?: string, append = false) => {
      setLoading(!append);
      setError(null);
      try {
        const response = await api.users({
          search: search || undefined,
          isActive:
            selectedStatuses.length === 1
              ? selectedStatuses[0] === "active"
              : undefined,
          roleId: selectedRoleIds.length === 1 ? selectedRoleIds[0] : undefined,
          cursor,
          limit: 30,
        });
        let list = response.data;
        if (selectedStatuses.length > 1) {
          list = list.filter((user) =>
            selectedStatuses.includes(user.isActive ? "active" : "inactive"),
          );
        }
        if (selectedRoleIds.length > 1) {
          list = list.filter((user) =>
            user.roles.some((role) => selectedRoleIds.includes(role.id)),
          );
        }
        setUsers((current) =>
          append ? [...current, ...list] : list,
        );
        setNextCursor(response.pageInfo.nextCursor);
      } catch (caught) {
        setError(caught);
      } finally {
        setLoading(false);
      }
    },
    [search, selectedRoleIds, selectedStatuses],
  );

  useEffect(() => {
    if (canView) void load();
  }, [canView, load]);
  useEffect(() => {
    if (canView)
      void Promise.all([api.roles(), api.areas()])
        .then(([roleResponse, areaResponse]) => {
          setRoles(roleResponse.data);
          setAreas(areaResponse.data);
        })
        .catch(() => undefined);
  }, [canView]);

  async function openUser(userId: string) {
    setSelected(null);
    setLoadingDetail(true);
    setError(null);
    try {
      setSelected(await api.user(userId));
    } catch (caught) {
      setError(caught);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function refreshSelected() {
    if (!selected) return;
    const detail = await api.user(selected.id);
    setSelected(detail);
    await load();
  }

  async function changeStatus() {
    if (!selected) return;
    try {
      const updated = await api.updateUserStatus(selected.id, {
        isActive: !selected.isActive,
        expectedUpdatedAt: selected.updatedAt,
      });
      setSelected(updated);
      setStatusOpen(false);
      setNotice(
        updated.isActive ? "Account enabled" : "Account disabled",
      );
      await load();
    } catch (caught) {
      setError(caught);
      setStatusOpen(false);
    }
  }

  async function removeAssignment() {
    if (!selected || !assignmentToRemove) return;
    try {
      await api.removeRole(selected.id, assignmentToRemove.id);
      setAssignmentToRemove(null);
      setNotice("Role assignment removed");
      await refreshSelected();
    } catch (caught) {
      setError(caught);
      setAssignmentToRemove(null);
    }
  }

  if (!canView)
    return (
      <EmptyState
        title="You cannot manage users"
        description="Global user:create, user:disable, or role:assign permission is required."
      />
    );

  return (
    <div className="page-stack">
      {notice && <Notice>{notice}</Notice>}
      {Boolean(error) && (
        <ErrorState error={error} onRetry={() => void load()} />
      )}
      <section className="toolbar">
        <form
          className="search-box"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(draftSearch.trim());
          }}
        >
          <Search size={18} />
          <input
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            placeholder="Search by username, name, or email"
            aria-label="Search users"
          />
          <button>Search</button>
        </form>
        <div className="toolbar__filters">
          <span className="toolbar__filter-label">
            <Filter size={15} />
            Filters
          </span>
          <CheckboxDropdownFilter
            label="Statuses"
            allLabel="All statuses"
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
            selectedValues={selectedStatuses}
            onChange={setSelectedStatuses}
            ariaLabel="Filter user status"
          />
          <CheckboxDropdownFilter
            label="Roles"
            allLabel="All roles"
            options={roles.map((role) => ({
              value: role.id,
              label: role.name,
            }))}
            selectedValues={selectedRoleIds}
            onChange={setSelectedRoleIds}
            ariaLabel="Filter roles"
          />
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={17} />
            Create user
          </Button>
        )}
      </section>

      {loading ? (
        <LoadingState label="Loading users" />
      ) : users.length === 0 ? (
        <EmptyState
          title="No users found"
          description="Try changing your search or filters."
        />
      ) : (
        <>
          <div className="people-grid">
            {users.map((user) => (
              <button
                className="person-card"
                key={user.id}
                onClick={() => void openUser(user.id)}
              >
                <Avatar name={user.name ?? user.email ?? user.username} size="lg" />
                <div className="person-card__main">
                  <span>
                    <strong>{user.name ?? user.username}</strong>
                    <StatusBadge active={user.isActive} />
                  </span>
                  <small>{user.email ?? "Not linked yet"}</small>
                </div>
                <div className="person-card__foot">
                  <span>
                    <KeyRound size={16} />
                    {user.roleCount} roles
                  </span>
                  <span>{formatDate(user.createdAt)}</span>
                </div>
              </button>
            ))}
          </div>
          {nextCursor && (
            <div className="load-more">
              <Button
                variant="secondary"
                onClick={() => void load(nextCursor, true)}
              >
                Load more users
              </Button>
            </div>
          )}
        </>
      )}

      {(selected || loadingDetail) && (
        <div
          className="drawer-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setSelected(null)
          }
        >
          <aside className="user-drawer" aria-label="User details">
            {loadingDetail && !selected ? (
              <LoadingState />
            ) : (
              selected && (
                <>
                  <header className="user-drawer__header">
                    <button
                      className="icon-button"
                      onClick={() => setSelected(null)}
                      aria-label="Close details"
                    >
                      <X size={20} />
                    </button>
                    <Avatar
                      name={selected.profile?.name ?? selected.email ?? selected.username}
                      imageUrl={selected.profile?.profilePictureUrl}
                      size="lg"
                    />
                    <div>
                      <h2>{selected.profile?.name ?? selected.username}</h2>
                      <span>{selected.email ?? "Not linked yet"}</span>
                    </div>
                    <StatusBadge active={selected.isActive} />
                  </header>
                  <div className="user-drawer__facts">
                    <div>
                      <Mail size={16} />
                      <span>
                        <small>Authentication</small>
                        <strong>{selected.authProviders.join(", ")}</strong>
                      </span>
                    </div>
                    <div>
                      <UserRound size={16} />
                      <span>
                        <small>Account created</small>
                        <strong>{formatDate(selected.createdAt)}</strong>
                      </span>
                    </div>
                  </div>
                  <section className="assignment-section">
                    <header>
                      <div>
                        <p className="eyebrow">Access assignments</p>
                        <h3>Roles and areas</h3>
                      </div>
                      {canAssign && (
                        <span>
                          {selected.roleAssignments.length} assignments
                        </span>
                      )}
                    </header>
                    {selected.roleAssignments.length === 0 ? (
                      <div className="inline-empty">
                        <ShieldPlus size={20} />
                        <span>
                          <strong>No roles assigned</strong>Add a role to give
                          this user access.
                        </span>
                      </div>
                    ) : (
                      <div className="assignment-list">
                        {selected.roleAssignments.map((assignment) => (
                          <article key={assignment.id}>
                            <RoleBadge name={assignment.role.name} />
                            <div>
                              <strong>
                                {assignment.managementArea?.name ??
                                  "Global — All areas"}
                              </strong>
                              <small>
                                By {assignment.assignedBy?.name ?? "System"} ·{" "}
                                {formatDate(assignment.createdAt)}
                              </small>
                            </div>
                            {canAssign && (
                              <button
                                className="icon-button icon-button--danger"
                                aria-label={`Remove ${assignment.role.name}`}
                                onClick={() =>
                                  setAssignmentToRemove(assignment)
                                }
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                    {canAssign && (
                      <AssignRoleForm
                        user={selected}
                        roles={roles}
                        areas={areas}
                        onAssigned={async () => {
                          setNotice("Role assignment added");
                          await refreshSelected();
                        }}
                      />
                    )}
                  </section>
                  {canDisable && (
                    <footer className="user-drawer__footer">
                      <div>
                        <strong>
                          {selected.isActive
                            ? "Disable system access"
                            : "Enable system access"}
                        </strong>
                        <span>
                          {selected.isActive
                            ? "The user will not be able to sign in or call protected APIs."
                            : "The user will be able to sign in again."}
                        </span>
                      </div>
                      <Button
                        variant={selected.isActive ? "danger" : "secondary"}
                        disabled={
                          selected.id === session?.user.id && selected.isActive
                        }
                        onClick={() => setStatusOpen(true)}
                      >
                        {selected.isActive ? (
                          <Ban size={16} />
                        ) : (
                          <UserRoundCheck size={16} />
                        )}
                        {selected.isActive ? "Disable account" : "Enable account"}
                      </Button>
                    </footer>
                  )}
                </>
              )
            )}
          </aside>
        </div>
      )}

      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={async (user) => {
          setCreateOpen(false);
          setNotice("User created");
          await load();
          await openUser(user.id);
        }}
      />
      <Dialog
        open={statusOpen}
        title={selected?.isActive ? "Disable account?" : "Enable account?"}
        description={
          selected?.isActive
            ? "The user will not be able to sign in or call protected APIs."
            : "The user will be able to sign in again with the same credentials."
        }
        onClose={() => setStatusOpen(false)}
      >
        <div className="dialog__actions">
          <Button variant="quiet" onClick={() => setStatusOpen(false)}>
            Cancel
          </Button>
          <Button
            variant={selected?.isActive ? "danger" : "primary"}
            onClick={() => void changeStatus()}
          >
            {selected?.isActive ? "Confirm disable" : "Confirm enable"}
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={Boolean(assignmentToRemove)}
        title="Remove role assignment?"
        description={`${assignmentToRemove?.role.name ?? "Role"} / ${assignmentToRemove?.managementArea?.name ?? "Global — All areas"}`}
        onClose={() => setAssignmentToRemove(null)}
      >
        <div className="dialog__actions">
          <Button variant="quiet" onClick={() => setAssignmentToRemove(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void removeAssignment()}>
            <Trash2 size={16} />
            Confirm removal
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function AssignRoleForm({
  user,
  roles,
  areas,
  onAssigned,
}: {
  user: UserDetail;
  roles: Role[];
  areas: ManagementArea[];
  onAssigned: () => void | Promise<void>;
}) {
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [areaId, setAreaId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.assignRole(user.id, {
        roleId,
        managementAreaId: areaId || null,
      });
      await onAssigned();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "Unable to add role",
      );
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <form className="assign-role-form" onSubmit={submit}>
      {error && <p role="alert">{error}</p>}
      <Select
        aria-label="Role"
        value={roleId}
        onChange={(event) => setRoleId(event.target.value)}
        required
      >
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Area scope"
        value={areaId}
        onChange={(event) => setAreaId(event.target.value)}
      >
        <option value="">Global — All areas</option>
        {areas.map((area) => (
          <option key={area.id} value={area.id}>
            {area.name}
          </option>
        ))}
      </Select>
      <Button size="sm" loading={submitting}>
        <ShieldPlus size={15} />
        Add role
      </Button>
    </form>
  );
}

function CreateUserDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (user: UserDetail) => void | Promise<void>;
}) {
  const [form, setForm] = useState({ username: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const user = await api.createUser({
        username: form.username,
        password: form.password,
      });
      await onCreated(user);
      setForm({ username: "", password: "" });
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "Unable to create user",
      );
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <Dialog
      open={open}
      title="Create new user"
      description="Create a username + password account. The user must link a Google or Microsoft account before they can otherwise use the app -- that's where their name, email, and photo come from."
      onClose={onClose}
      wide
    >
      <form className="form-stack" onSubmit={submit}>
        {error && (
          <div className="form-alert" role="alert">
            {error}
          </div>
        )}
        <div className="form-grid form-grid--2">
          <Field label="Username" hint="Letters, numbers, dots, underscores, or hyphens" required>
            <Input
              value={form.username}
              onChange={(event) =>
                setForm({ ...form, username: event.target.value })
              }
              minLength={3}
              maxLength={50}
              required
              autoFocus
            />
          </Field>
          <Field label="Initial password" hint="At least 8 characters" required>
            <Input
              type="password"
              value={form.password}
              onChange={(event) =>
                setForm({ ...form, password: event.target.value })
              }
              minLength={8}
              required
            />
          </Field>
        </div>
        <div className="dialog__actions">
          <Button type="button" variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={submitting}
            disabled={form.username.length < 3 || form.password.length < 8}
          >
            <CheckCircle2 size={16} />
            Create user
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
