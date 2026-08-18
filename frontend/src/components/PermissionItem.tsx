import {
  Archive,
  CalendarPlus,
  CalendarRange,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  Info,
  KeyRound,
  LockKeyhole,
  PackagePlus,
  SlidersHorizontal,
  Sparkles,
  UserPlus,
  UserX,
  XCircle,
} from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import {
  PERMISSION_DETAILS,
  type PermissionDetail,
} from "../constants/permission-details";
import type { PermissionDefinition, PermissionKey } from "../types";
import { cx } from "./ui";

const permissionIcons: Record<string, ReactNode> = {
  "asset:create": <PackagePlus size={18} />,
  "asset:view": <Eye size={18} />,
  "asset:update": <SlidersHorizontal size={18} />,
  "asset:delete": <Archive size={18} />,
  "reservation:create": <CalendarPlus size={18} />,
  "reservation:update": <CalendarRange size={18} />,
  "reservation:approve": <CheckCircle2 size={18} />,
  "reservation:reject": <XCircle size={18} />,
  "return:approve": <ClipboardCheck size={18} />,
  "user:create": <UserPlus size={18} />,
  "user:disable": <UserX size={18} />,
  "role:assign": <KeyRound size={18} />,
};

export function PermissionItem({
  permission,
  checked,
  locked,
  placement = "auto",
  onChange,
}: {
  permission: PermissionDefinition;
  checked: boolean;
  locked?: boolean;
  placement?: "left" | "right" | "auto";
  onChange: (key: PermissionKey) => void;
}) {
  const tooltipId = useId();
  const [isHovered, setIsHovered] = useState(false);
  const detail: PermissionDetail = PERMISSION_DETAILS[permission.key] ?? {
    key: permission.key,
    name: permission.action,
    category: permission.resource,
    scopeType: "area",
    scopeLabel: "General Permission",
    summary: permission.description,
    details: permission.description,
    capabilities: [permission.description],
    example: "Used to manage system resources according to assigned roles.",
    impact: "Applies operations permitted by the role.",
  };

  const icon = permissionIcons[permission.key] ?? <Sparkles size={18} />;

  return (
    <div
      className={cx(
        "permission-item-wrapper",
        placement !== "auto" && `permission-item-wrapper--${placement}`,
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <label
        className={cx(
          "permission-item",
          checked && "permission-item--checked",
          locked && "permission-item--locked",
          isHovered && "permission-item--hovered",
        )}
        aria-describedby={tooltipId}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={locked}
          onChange={() => onChange(permission.key)}
        />
        <span className="permission-item__check">
          {checked && <Check size={15} />}
        </span>

        <span className="permission-item__content">
          <span className="permission-item__header-row">
            <strong>{detail.name}</strong>
            <span className="permission-item__subtext">
              ({permission.resource})
            </span>
          </span>
          <code>{permission.key}</code>
          <small>{detail.summary}</small>
        </span>

        <span className="permission-item__meta">
          {locked ? (
            <span
              className="permission-item__locked-tag"
              title="Required system permission"
            >
              <LockKeyhole size={14} />
              <span>Locked</span>
            </span>
          ) : (
            <span
              className="permission-item__info-trigger"
              tabIndex={0}
              role="button"
              aria-label={`Permission details for ${detail.name}`}
            >
              <Info size={16} />
            </span>
          )}
        </span>
      </label>

      {/* Floating Detailed Mini-Panel */}
      <aside
        id={tooltipId}
        className={cx(
          "permission-minipanel",
          placement === "left" && "permission-minipanel--left",
          placement === "right" && "permission-minipanel--right",
        )}
        role="tooltip"
      >
        <header className="permission-minipanel__header">
          <div className="permission-minipanel__title-box">
            <div className="permission-minipanel__icon-wrap">{icon}</div>
            <div>
              <h4>{detail.name}</h4>
              <span className="permission-minipanel__en">{detail.category}</span>
            </div>
          </div>
          <span
            className={cx(
              "permission-minipanel__badge",
              `permission-minipanel__badge--${detail.scopeType}`,
            )}
          >
            {detail.scopeLabel}
          </span>
        </header>

        <div className="permission-minipanel__key">
          <code>{detail.key}</code>
        </div>

        <p className="permission-minipanel__details">{detail.details}</p>

        <div className="permission-minipanel__section">
          <span className="permission-minipanel__section-title">
            What this permission allows:
          </span>
          <ul className="permission-minipanel__list">
            {detail.capabilities.map((capability, index) => (
              <li key={index}>
                <Check size={13} className="permission-minipanel__list-icon" />
                <span>{capability}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="permission-minipanel__example">
          <strong>Practical Scenario:</strong>
          <p>{detail.example}</p>
        </div>

        <footer className="permission-minipanel__footer">
          <small>
            <strong>Impact:</strong> {detail.impact}
          </small>
        </footer>
      </aside>
    </div>
  );
}
