import {
  Check,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  Save,
  Shield,
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
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
  PageHeader,
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
      selectedRole?.name === "ADMIN" &&
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
      <PageHeader
        eyebrow="Administration / policy matrix"
        title="Access and roles"
        description="Define what each role can do. These permissions are evaluated together with the management area."
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            <RefreshCw size={16} />
            Refresh
          </Button>
        }
      />
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
          <header>
            <p className="eyebrow">Role registry</p>
            <h2>Select a role</h2>
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
                        selectedRole.name === "ADMIN" &&
                        ["user:disable", "role:assign"].includes(
                          permission.key,
                        );
                      return (
                        <label
                          className={cx(
                            "permission-item",
                            checked && "permission-item--checked",
                            locked && "permission-item--locked",
                          )}
                          key={permission.key}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={locked}
                            onChange={() => togglePermission(permission.key)}
                          />
                          <span className="permission-item__check">
                            {checked && <Check size={14} />}
                          </span>
                          <span>
                            <strong>{permission.action}</strong>
                            <code>{permission.key}</code>
                            <small>{permission.description}</small>
                          </span>
                          {locked && (
                            <LockKeyhole size={14} aria-label="Required permission" />
                          )}
                        </label>
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
    </div>
  );
}
