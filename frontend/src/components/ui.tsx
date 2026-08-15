import {
  AlertTriangle,
  Archive,
  Check,
  ChevronRight,
  LoaderCircle,
  PackageOpen,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Link } from "react-router-dom";
import { ApiClientError } from "../api";

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
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={cx("field", error && "field--error")}>
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

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx("control", props.className)} {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx("control", "control--textarea", props.className)}
      {...props}
    />
  );
}

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
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__mark">
        <PackageOpen size={26} />
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
      <Archive size={large ? 38 : 20} />
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
