import {
  AlertTriangle,
  Archive,
  Check,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  PackageOpen,
  X,
} from "lucide-react";
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { ApiClientError } from "../api";
import type { ManagementAreaRef } from "../types";

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  size = "md",
  loading,
  children,
  className,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
}) {
  return (
    <button
      className={cx(
        "button",
        `button--${variant}`,
        `button--${size}`,
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <LoaderCircle className="spin" size={16} aria-hidden />}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("field", error && "field--error", className)}>
      <span className="field__label">
        {label} {required && <span aria-hidden>*</span>}
      </span>
      {children}
      {(error || hint) && (
        <span className="field__help" role={error ? "alert" : undefined}>
          {error ?? hint}
        </span>
      )}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("control", props.className)} {...props} />;
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cx("select-wrap", className)}>
      <select className="control control--select" {...props} />
      <ChevronDown className="select-wrap__chevron" size={15} aria-hidden />
    </div>
  );
}

export type FilterOption = {
  value: string;
  label: string;
  colorClass?: string;
};

export function CheckboxDropdownFilter({
  label = "Options",
  allLabel = "All",
  options,
  selectedValues,
  onChange,
  className,
  ariaLabel,
}: {
  label?: string;
  allLabel?: string;
  options: FilterOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const toggleValue = (val: string) => {
    if (selectedValues.includes(val)) {
      onChange(selectedValues.filter((item) => item !== val));
    } else {
      onChange([...selectedValues, val]);
    }
  };

  const selectAll = () => onChange([]);
  const clearAll = () => onChange([]);

  const labelText =
    selectedValues.length === 0
      ? allLabel
      : selectedValues.length === 1
        ? options.find((o) => o.value === selectedValues[0])?.label ?? "1 selected"
        : `${selectedValues.length} selected`;

  return (
    <div
      className={cx("workspace-filter-dropdown", className)}
      ref={containerRef}
    >
      <button
        type="button"
        className={cx(
          "control",
          "workspace-filter-trigger",
          open && "workspace-filter-trigger--open",
          selectedValues.length > 0 && "workspace-filter-trigger--active",
        )}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel || `Filter by ${label.toLowerCase()}`}
      >
        <span className="workspace-filter-trigger__label">{labelText}</span>
        {selectedValues.length > 0 && (
          <span className="workspace-filter-trigger__badge">
            {selectedValues.length}
          </span>
        )}
        <ChevronDown
          size={15}
          className={cx(
            "workspace-filter-trigger__chevron",
            open && "workspace-filter-trigger__chevron--open",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="workspace-filter-popover" role="listbox">
          <div className="workspace-filter-popover__header">
            <span>{label}</span>
            <div className="workspace-filter-popover__actions">
              <button
                type="button"
                className="workspace-filter-popover__action"
                onClick={selectAll}
              >
                All
              </button>
              {selectedValues.length > 0 && (
                <button
                  type="button"
                  className="workspace-filter-popover__action"
                  onClick={clearAll}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="workspace-filter-popover__list">
            {options.map((option) => {
              const checked = selectedValues.includes(option.value);
              return (
                <label
                  key={option.value}
                  className={cx(
                    "workspace-filter-checkbox-item",
                    checked && "workspace-filter-checkbox-item--checked",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleValue(option.value)}
                    aria-label={option.label}
                  />
                  {option.colorClass ? (
                    <i
                      className={cx(
                        "workspace-filter-checkbox-item__swatch",
                        option.colorClass,
                      )}
                      aria-hidden
                    />
                  ) : null}
                  <span className="workspace-filter-checkbox-item__name">
                    {option.label}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea ref={ref} className={cx("control", "control--textarea", className)} {...props} />
  );
});

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cx(
        "status-badge",
        active ? "status-badge--active" : "status-badge--inactive",
      )}
    >
      <span className="status-badge__dot" aria-hidden />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export function RoleBadge({ name }: { name: string }) {
  return (
    <span className={cx("role-badge", `role-badge--${name.toLowerCase()}`)}>
      {name}
    </span>
  );
}

export function Avatar({
  name,
  imageUrl,
  size = "md",
}: {
  name: string;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  return imageUrl ? (
    <img className={cx("avatar", `avatar--${size}`)} src={imageUrl} alt="" />
  ) : (
    <span
      className={cx("avatar", "avatar--fallback", `avatar--${size}`)}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className={cx("dialog", wide && "dialog--wide")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="dialog__header">
          <div>
            <p className="eyebrow">Asset Rail / action</p>
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            ref={closeRef}
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </header>
        <div className="dialog__body">{children}</div>
      </section>
    </div>
  );
}

export function LoadingState({
  label = "Loading data",
}: {
  label?: string;
}) {
  return (
    <div className="state-panel" aria-live="polite">
      <LoaderCircle className="spin" size={24} />
      <p>{label}</p>
    </div>
  );
}

export function EmptyState({
  icon: Icon = PackageOpen,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__mark">
        <Icon size={26} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const detail = apiError(error);
  return (
    <div className="error-state" role="alert">
      <AlertTriangle size={22} />
      <div>
        <strong>{detail.message}</strong>
        {detail.requestId && (
          <p className="mono">Request ID: {detail.requestId}</p>
        )}
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Notice({
  tone = "success",
  children,
}: {
  tone?: "success" | "warning";
  children: ReactNode;
}) {
  return (
    <div className={cx("notice", `notice--${tone}`)} role="status">
      {tone === "success" ? <Check size={17} /> : <AlertTriangle size={17} />}
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-header__description">{description}</p>
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}

export function Breadcrumb({
  items,
}: {
  items: Array<{ label: string; to?: string }>;
}) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`}>
          {index > 0 && <ChevronRight size={14} aria-hidden />}
          {item.to ? (
            <Link to={item.to}>{item.label}</Link>
          ) : (
            <span aria-current="page">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function AssetPicture({
  src,
  name,
  large = false,
}: {
  src: string | null;
  name: string;
  large?: boolean;
}) {
  return src ? (
    <img
      className={cx("asset-picture", large && "asset-picture--large")}
      src={src}
      alt={`${name}`}
    />
  ) : (
    <span
      className={cx(
        "asset-picture",
        "asset-picture--placeholder",
        large && "asset-picture--large",
      )}
      aria-label={`No image for ${name}`}
    >
      <Archive size={large ? 48 : 28} />
    </span>
  );
}

export function formatDate(value: string, includeTime = false) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
  }).format(new Date(value));
}

export function apiError(error: unknown) {
  if (error instanceof ApiClientError) return error;
  return new ApiClientError(
    0,
    "NETWORK_ERROR",
    "Unable to connect to the system. Check your network and try again.",
  );
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return (
    parts.length > 1 ? `${parts[0][0]}${parts.at(-1)?.[0]}` : value.slice(0, 2)
  ).toUpperCase();
}
