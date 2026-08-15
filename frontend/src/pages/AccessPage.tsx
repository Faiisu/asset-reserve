import {
  Check,
  KeyRound,
  LockKeyhole,
  Plus,
  RefreshCw,
  Save,
  Shield,
  ShieldPlus,
  UsersRound,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { api, ApiClientError } from "../api";
import { useAuth } from "../auth";
import { PermissionItem } from "../components/PermissionItem";
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Notice,
  RoleBadge,
  Textarea,
  cx,
  formatDate,
} from "../components/ui";
import type { PermissionDefinition, PermissionKey, Role } from "../types";

const resourceLabels: Record<string, string> = {
  asset: "Assets",
  reservation: "Reservations",
  return: "Returns",
  user: "Users",
  role: "Roles",
};

export function AccessPage() {
  const { isGlobalAdmin } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<PermissionDefinition[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draftPermissions, setDraftPermissions] = useState<PermissionKey[]>([]);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [roleResponse, permissionResponse] = await Promise.all([
        api.roles(),
        api.permissions(),
      ]);
      setRoles(roleResponse.data);
      setPermissions(permissionResponse.data);
      setSelectedId((current) => current || roleResponse.data[0]?.id || "");
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedRole = roles.find((role) => role.id === selectedId) ?? null;
  useEffect(() => {
    if (!selectedRole) return;
    setDraftPermissions(selectedRole.permissions);
    setDescription(selectedRole.description ?? "");
  }, [selectedRole]);

  const groups = useMemo(
    () =>
      Object.entries(
        permissions.reduce<Record<string, PermissionDefinition[]>>(
          (result, permission) => {
            (result[permission.resource] ??= []).push(permission);
            return result;
          },
          {},
        ),
      ),
    [permissions],
  );

  const dirty = selectedRole
    ? description !== (selectedRole.description ?? "") ||
      [...draftPermissions].sort().join() !==
        [...selectedRole.permissions].sort().join()
    : false;

  const isSystemAdmin = selectedRole?.name.toUpperCase() === "ADMIN";

  if (!isGlobalAdmin)
    return (
      <EmptyState
        title="Global Admin only"
        description="Role permission changes affect users across multiple areas, so access is limited to global administrators."
      />
    );
  if (loading) return <LoadingState label="Loading permission catalog" />;
  if (error) return <ErrorState error={error} onRetry={() => void load()} />;

  function togglePermission(permission: PermissionKey) {
    if (
      isSystemAdmin &&
      ["user:disable", "role:assign"].includes(permission)
    )
      return;
    setDraftPermissions((current) =>
      current.includes(permission)
        ? current.filter((value) => value !== permission)
        : [...current, permission],
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!selectedRole) return;
    setSaving(true);
    setError(null);
    setNotice("");
    try {
      const updated = await api.updateRole(selectedRole.id, {
        description: description.trim() || null,
        permissions: draftPermissions,
        expectedUpdatedAt: selectedRole.updatedAt,
      });
      setRoles((current) =>
        current.map((role) => (role.id === updated.id ? updated : role)),
      );
      setNotice(`Permissions saved for ${updated.name}`);
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-stack">
      {notice && <Notice>{notice}</Notice>}
      {Boolean(error) && <ErrorState error={error} />}

      <section className="access-overview">
        <div>
          <Shield size={21} />
          <span>
            <strong>{roles.length}</strong>
            <small>System roles</small>
          </span>
        </div>
        <div>
          <KeyRound size={21} />
          <span>
            <strong>{permissions.length}</strong>
            <small>Permission keys</small>
          </span>
        </div>
        <div>
          <UsersRound size={21} />
          <span>
            <strong>
              {roles.reduce(
                (total, role) => total + role.permissions.length,
                0,
              )}
            </strong>
            <small>Assigned permissions</small>
          </span>
        </div>
        <p>
          <LockKeyhole size={16} />
          ADMIN must always retain <code>user:disable</code> and{" "}
          <code>role:assign</code>.
        </p>
      </section>

      <div className="access-layout">
        <aside className="role-list" aria-label="Roles">
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
            <div>
              <p className="eyebrow">Role registry</p>
              <h2>Select a role</h2>
            </div>
            {isGlobalAdmin && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                New role
              </Button>
            )}
          </header>
          {roles.map((role) => (
            <button
              key={role.id}
              className={cx(
                "role-list__item",
                selectedId === role.id && "role-list__item--active",
              )}
              onClick={() => setSelectedId(role.id)}
            >
              <span>
                <RoleBadge name={role.name} />
                <small>{role.permissions.length} permissions</small>
              </span>
              {selectedId === role.id && <Check size={17} />}
            </button>
          ))}
        </aside>

        {selectedRole && (
          <form className="permission-editor" onSubmit={save}>
            <header className="permission-editor__header">
              <div>
                <p className="eyebrow">Editing role</p>
                <h2>
                  <RoleBadge name={selectedRole.name} />
                  {selectedRole.name}
                </h2>
                <p>Last updated {formatDate(selectedRole.updatedAt, true)}</p>
              </div>
              <Button type="submit" loading={saving} disabled={!dirty}>
                <Save size={16} />
                Save changes
              </Button>
            </header>
            <div className="permission-description">
              <label>
                <span>Role description</span>
                <Textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  maxLength={10000}
                />
              </label>
            </div>
            <div className="permission-groups">
              {groups.map(([resource, items]) => (
                <section className="permission-group" key={resource}>
                  <header>
                    <div>
                      <h3>{resourceLabels[resource] ?? resource}</h3>
                      <span className="mono">{resource}</span>
                    </div>
                    <small>
                      {items?.filter((permission) =>
                        draftPermissions.includes(permission.key),
                      ).length ?? 0}
                      /{items?.length ?? 0} enabled
                    </small>
                  </header>
                  <div>
                    {items?.map((permission) => {
                      const checked = draftPermissions.includes(permission.key);
                      const locked =
                        isSystemAdmin &&
                        ["user:disable", "role:assign"].includes(
                          permission.key,
                        );
                      return (
                        <PermissionItem
                          key={permission.key}
                          permission={permission}
                          checked={checked}
                          locked={locked}
                          onChange={togglePermission}
                        />
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            <footer className="sticky-save">
              <span>
                {dirty
                  ? "You have unsaved changes"
                  : "All changes are saved"}
              </span>
              <Button type="submit" loading={saving} disabled={!dirty}>
                <Save size={16} />
                Save permissions
              </Button>
            </footer>
          </form>
        )}
      </div>

      <CreateRoleDialog
        open={createOpen}
        permissions={permissions}
        onClose={() => setCreateOpen(false)}
        onCreated={(newRole) => {
          setRoles((prev) => [...prev, newRole]);
          setSelectedId(newRole.id);
          setNotice(`Role "${newRole.name}" created successfully`);
          setCreateOpen(false);
        }}
      />
    </div>
  );
}

function CreateRoleDialog({
  open,
  permissions,
  onClose,
  onCreated,
}: {
  open: boolean;
  permissions: PermissionDefinition[];
  onClose: () => void;
  onCreated: (role: Role) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<
    PermissionKey[]
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setName("");
    setDescription("");
    setSelectedPermissions([]);
    setError("");
  }, [open]);

  const groups = useMemo(
    () =>
      Object.entries(
        permissions.reduce<Record<string, PermissionDefinition[]>>(
          (result, permission) => {
            (result[permission.resource] ??= []).push(permission);
            return result;
          },
          {},
        ),
      ),
    [permissions],
  );

  function togglePermission(key: PermissionKey) {
    setSelectedPermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key],
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const roleName = name.trim().toUpperCase();
    if (!roleName) {
      setError("Role name is required.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const created = await api.createRole({
        name: roleName,
        description: description.trim() || undefined,
        permissions: selectedPermissions,
      });
      onCreated(created);
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "Unable to create role",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      title="Create new role"
      description="Define a new role and choose its initial permission set."
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
          <Field label="Role name" hint="Uppercase identifier, e.g. TECHNICIAN, SUPERVISOR" required>
            <Input
              value={name}
              onChange={(event) =>
                setName(event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))
              }
              placeholder="For example, EQUIPMENT_OFFICER"
              maxLength={50}
              required
              autoFocus
            />
          </Field>
          <Field label="Description">
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Role responsibilities and access scope"
              maxLength={500}
            />
          </Field>
        </div>

        <Field label="Initial permissions">
          <div className="permission-groups" style={{ maxHeight: "360px", overflowY: "auto", paddingRight: "4px" }}>
            {groups.map(([resource, items]) => (
              <section className="permission-group" key={resource}>
                <header>
                  <div>
                    <h3>{resourceLabels[resource] ?? resource}</h3>
                    <span className="mono">{resource}</span>
                  </div>
                  <small>
                    {items?.filter((p) => selectedPermissions.includes(p.key)).length ?? 0}
                    /{items?.length ?? 0} selected
                  </small>
                </header>
                <div>
                  {items?.map((permission) => {
                    const checked = selectedPermissions.includes(permission.key);
                    return (
                      <PermissionItem
                        key={permission.key}
                        permission={permission}
                        checked={checked}
                        onChange={togglePermission}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </Field>

        <div className="dialog__actions">
          <Button type="button" variant="quiet" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            <ShieldPlus size={16} />
            Create role
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
