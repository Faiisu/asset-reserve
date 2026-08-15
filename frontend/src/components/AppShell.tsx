import {
  Boxes,
  Building2,
  ChevronDown,
  LogOut,
  Moon,
  CalendarDays,
  CalendarRange,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import { Avatar, cx } from "./ui";

const titles: Array<[string, string]> = [
  ["/calendar", "Calendar"],
  ["/reservations/new", "New reservation"],
  ["/reservations/", "Reservation details"],
  ["/reservations", "Reservations"],
  ["/assets/new", "Add asset"],
  ["/assets/", "Asset details"],
  ["/assets", "Asset registry"],
  ["/admin/access", "Access and roles"],
  ["/admin/users", "Users"],
  ["/admin/areas", "Management areas"],
];

export function AppShell() {
  const { session, logout, hasPermission, hasGlobalPermission, isGlobalAdmin } =
    useAuth();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("asset-rail.theme") ?? "light",
  );
  const title =
    titles.find(([path]) => location.pathname.startsWith(path))?.[1] ??
    "Advantech Asset Reservation";
  const name = session?.user.profile?.name ?? session?.user.email ?? "User";
  const canAdminUsers = ["user:create", "user:disable", "role:assign"].some(
    (permission) =>
      hasGlobalPermission(
        permission as "user:create" | "user:disable" | "role:assign",
      ),
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("asset-rail.theme", theme);
  }, [theme]);

  const nav = [
    {
      to: "/calendar",
      label: "Calendar",
      icon: CalendarDays,
      show: true,
    },
    {
      to: "/assets",
      label: "Assets",
      icon: Boxes,
      show: hasPermission("asset:view"),
    },
    {
      to: "/reservations",
      label: "Reservations",
      icon: CalendarRange,
      show: [
        "reservation:create",
        "reservation:update",
        "reservation:approve",
        "reservation:reject",
      ].some((permission) => hasPermission(permission as "reservation:create")),
    },
    {
      to: "/admin/areas",
      label: "Workspaces",
      icon: Building2,
      show: isGlobalAdmin,
    },
    {
      to: "/admin/access",
      label: "Access and roles",
      icon: ShieldCheck,
      show: isGlobalAdmin,
    },
    {
      to: "/admin/users",
      label: "Users",
      icon: Users,
      show: canAdminUsers,
    },
  ].filter((item) => item.show);

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand__rail" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <div>
            <strong>Advantech</strong>
            <small>Asset Reservation</small>
          </div>
        </div>
        <nav className="sidebar__nav" aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          {nav
            .filter((item) => !item.to.startsWith("/admin"))
            .map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cx("nav-item", isActive && "nav-item--active")
                }
              >
                <Icon size={19} />
                <span>{label}</span>
              </NavLink>
            ))}
          {nav.some((item) => item.to.startsWith("/admin")) && (
            <p className="nav-label nav-label--section">Administration</p>
          )}
          {nav
            .filter((item) => item.to.startsWith("/admin"))
            .map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cx("nav-item", isActive && "nav-item--active")
                }
              >
                <Icon size={19} />
                <span>{label}</span>
              </NavLink>
            ))}
        </nav>
        <div className="sidebar__scope">
          <span className="scope-pulse" aria-hidden />
          <div>
            <small>Access scope</small>
            <strong>
              {session?.roles.some((role) => !role.managementArea)
                ? "All areas"
                : `${session?.effectivePermissions.byManagementArea.length ?? 0} areas`}
            </strong>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar__heading">
            <span className="topbar__context">Advantech Asset Reservation</span>
            <h1 className="topbar__title">{title}</h1>
          </div>
          <div className="topbar__actions">
            <button
              className="icon-button"
              aria-label={
                theme === "light" ? "Use dark theme" : "Use light theme"
              }
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <div className="profile-menu">
              <button
                className="profile-button"
                onClick={() => setProfileOpen((open) => !open)}
                aria-expanded={profileOpen}
              >
                <Avatar
                  name={name}
                  imageUrl={session?.user.profile?.profilePictureUrl}
                  size="sm"
                />
                <span>
                  <strong>{name}</strong>
                  <small>
                    {session?.roles
                      .map((role) => role.name)
                      .filter(
                        (value, index, all) => all.indexOf(value) === index,
                      )
                      .join(" · ") || "No role"}
                  </small>
                </span>
                <ChevronDown size={15} />
              </button>
              {profileOpen && (
                <div className="profile-popover">
                  <p>{session?.user.email}</p>
                  <button onClick={() => void logout()}>
                    <LogOut size={16} />
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => cx(isActive && "mobile-nav--active")}
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
