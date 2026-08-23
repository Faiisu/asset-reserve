import {
  ChevronDown,
  Clock3,
  Filter,
  History,
  Inbox,
  Search,
  ShieldCheck,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import { api, isAbortError } from "../api";
import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  cx,
  formatDate,
} from "../components/ui";
import { reservationDuration, reservationStatusLabel } from "../reservations";
import type {
  ManagementArea,
  PageInfo,
  ReservationStatus,
  ReservationSummary,
} from "../types";

type ApprovalTab = "PENDING" | "HISTORY";

const STATUS_COLOR_CLASS: Record<ReservationStatus, string> = {
  DRAFT: "calendar-legend__draft",
  PENDING_APPROVAL: "calendar-legend__pending_approval",
  PARTIALLY_APPROVED: "calendar-legend__partially_approved",
  APPROVED: "calendar-legend__approved",
  DELIVERY_CONFIRMED: "calendar-legend__delivery_confirmed",
  RETURN_PENDING: "calendar-legend__return_pending",
  COMPLETED: "calendar-legend__completed",
  REJECTED: "calendar-legend__rejected",
  CANCELLED: "calendar-legend__cancelled",
};

const DISPLAY_STATUSES: ReservationStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "PARTIALLY_APPROVED",
  "APPROVED",
  "DELIVERY_CONFIRMED",
  "RETURN_PENDING",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
];

const STATUS_OPTION_STATUSES: Record<ReservationStatus, ReservationStatus[]> = {
  DRAFT: ["DRAFT"],
  PENDING_APPROVAL: ["PENDING_APPROVAL"],
  PARTIALLY_APPROVED: ["PARTIALLY_APPROVED"],
  APPROVED: ["APPROVED"],
  DELIVERY_CONFIRMED: ["DELIVERY_CONFIRMED"],
  RETURN_PENDING: ["RETURN_PENDING"],
  COMPLETED: ["COMPLETED"],
  REJECTED: ["REJECTED"],
  CANCELLED: ["CANCELLED"],
};

const statusOptions = DISPLAY_STATUSES.map((status) => ({
  value: status,
  label: reservationStatusLabel[status],
  statuses: STATUS_OPTION_STATUSES[status],
  colorClass: STATUS_COLOR_CLASS[status],
}));

export function ApprovalRequestsPage() {
  const [tab, setTab] = useState<ApprovalTab>("PENDING");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedAreaIds, setSelectedAreaIds] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [areas, setAreas] = useState<ManagementArea[]>([]);
  const [items, setItems] = useState<ReservationSummary[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo>({
    nextCursor: null,
    hasNextPage: false,
  });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    if (!filterOpen) return;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!filterRef.current?.contains(event.target as Node)) {
        setFilterOpen(false);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setFilterOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [filterOpen]);

  useEffect(() => {
    void api
      .areas()
      .then((response) => setAreas(response.data))
      .catch(() => setAreas([]));
  }, []);

  const load = useCallback(
    async (cursor?: string, signal?: AbortSignal) => {
      const requestId = ++requestSequence.current;
      cursor ? setLoadingMore(true) : setLoading(true);
      setError(null);
      try {
        const allowedStatuses = selectedStatuses.flatMap(
          (val) =>
            statusOptions.find((opt) => opt.value === val)?.statuses ?? [],
        );
        const response = await api.reservations(
          {
            view: tab === "PENDING" ? "APPROVALS" : "APPROVAL_HISTORY",
            status:
              allowedStatuses.length === 1 ? allowedStatuses[0] : undefined,
            areaId:
              selectedAreaIds.length === 1 ? selectedAreaIds[0] : undefined,
            search: search || undefined,
            from: from ? localDayBoundary(from, false) : undefined,
            to: to ? localDayBoundary(to, true) : undefined,
            cursor,
            limit: 20,
          },
          signal,
        );
        if (requestId !== requestSequence.current) return;
        let list = response.data;
        if (selectedAreaIds.length > 1) {
          list = list.filter(
            (res) =>
              res.managementAreas.length === 0 ||
              res.managementAreas.some((area) =>
                selectedAreaIds.includes(area.id),
              ),
          );
        }
        if (selectedStatuses.length > 0) {
          list = list.filter((res) => allowedStatuses.includes(res.status));
        }
        setItems((current) => (cursor ? [...current, ...list] : list));
        setPageInfo(response.pageInfo);
      } catch (caught) {
        if (isAbortError(caught)) return;
        if (requestId !== requestSequence.current) return;
        setError(caught);
      } finally {
        if (requestId === requestSequence.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [from, search, selectedAreaIds, selectedStatuses, tab, to],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(undefined, controller.signal);
    return () => controller.abort();
  }, [load]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSearch(searchInput.trim());
  }

  useEffect(() => {
    const trimmed = searchInput.trim();
    const timer = setTimeout(() => {
      setSearch((current) => (current === trimmed ? current : trimmed));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const totalFilterCount = selectedAreaIds.length + selectedStatuses.length;
  const hasActiveFilters = totalFilterCount > 0;

  return (
    <div className="page-stack reservations-index">
      <div
        className="reservation-view-tabs"
        role="tablist"
        aria-label="Approval request view"
      >
        <button
          role="tab"
          aria-selected={tab === "PENDING"}
          className={cx(tab === "PENDING" && "is-active")}
          onClick={() => setTab("PENDING")}
        >
          <ShieldCheck size={16} /> Pending review
        </button>
        <button
          role="tab"
          aria-selected={tab === "HISTORY"}
          className={cx(tab === "HISTORY" && "is-active")}
          onClick={() => setTab("HISTORY")}
        >
          <History size={16} /> Approval history
        </button>
      </div>

      <section className="review-lane-banner">
        <span>
          {tab === "PENDING" ? (
            <ShieldCheck size={22} />
          ) : (
            <History size={22} />
          )}
        </span>
        <div>
          <p className="eyebrow eyebrow--light">
            {tab === "PENDING" ? "Approval Queue" : "Approval History"}
          </p>
          <strong>
            {tab === "PENDING"
              ? "Reservation requests and return inspections needing a decision from your management areas appear here."
              : "Reservation item decisions you previously made appear here."}
          </strong>
        </div>
        <small>
          {tab === "PENDING"
            ? "Open an event to approve assets or inspect a returned item."
            : "Review audit trails and decision comments."}
        </small>
      </section>

      <section className="reservation-list-toolbar">
        <form className="reservation-list-search" onSubmit={submitSearch}>
          <Search size={17} />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search requests or notes"
            aria-label="Search approval requests"
          />
          <button type="submit">Search</button>
        </form>
        <div className="reservation-list-filters">
          <div className="calendar-filter-picker" ref={filterRef}>
            <button
              id="approval-filter-toggle"
              type="button"
              className={cx(
                "calendar-filter-btn",
                (hasActiveFilters || filterOpen) &&
                  "calendar-filter-btn--active",
              )}
              onClick={() => setFilterOpen((prev) => !prev)}
              aria-haspopup="dialog"
              aria-expanded={filterOpen}
              aria-label="Filter approval requests by workspace and status"
              title={
                hasActiveFilters
                  ? `${totalFilterCount} filter${totalFilterCount > 1 ? "s" : ""} applied`
                  : "Filter by workspace and status"
              }
            >
              <Filter size={13} />
              <span>Filters</span>
              {hasActiveFilters && (
                <span className="calendar-filter-btn__badge">
                  {totalFilterCount}
                </span>
              )}
              <ChevronDown
                size={14}
                className={cx(
                  "calendar-filter-btn__chevron",
                  filterOpen && "calendar-filter-btn__chevron--open",
                )}
                aria-hidden
              />
            </button>

            {filterOpen && (
              <div
                className="calendar-filter-popover"
                role="dialog"
                aria-label="Filter approval requests"
              >
                <div className="calendar-filter-popover__top">
                  <div className="calendar-filter-popover__title">
                    <Filter size={13} />
                    <strong>Filters</strong>
                  </div>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      className="calendar-filter-popover__reset"
                      onClick={() => {
                        setSelectedAreaIds([]);
                        setSelectedStatuses([]);
                      }}
                    >
                      Clear all
                    </button>
                  )}
                </div>

                <div className="calendar-filter-popover__columns">
                  <section className="calendar-filter-popover__section">
                    <div className="calendar-filter-popover__section-header">
                      <span>Workspaces</span>
                      <div className="calendar-filter-popover__actions">
                        <button
                          type="button"
                          className="calendar-filter-popover__action"
                          onClick={() => setSelectedAreaIds([])}
                        >
                          All
                        </button>
                        {selectedAreaIds.length > 0 && (
                          <button
                            type="button"
                            className="calendar-filter-popover__action"
                            onClick={() => setSelectedAreaIds([])}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="calendar-filter-popover__list">
                      {areas.length === 0 ? (
                        <p className="calendar-filter-popover__empty">
                          No workspaces found
                        </p>
                      ) : (
                        areas.map((area) => {
                          const checked = selectedAreaIds.includes(area.id);
                          return (
                            <label
                              key={area.id}
                              className={cx(
                                "workspace-filter-checkbox-item",
                                checked &&
                                  "workspace-filter-checkbox-item--checked",
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setSelectedAreaIds((prev) =>
                                    prev.includes(area.id)
                                      ? prev.filter((id) => id !== area.id)
                                      : [...prev, area.id],
                                  );
                                }}
                                aria-label={area.name}
                              />
                              <span className="workspace-filter-checkbox-item__name">
                                {area.name}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </section>

                  <section className="calendar-filter-popover__section">
                    <div className="calendar-filter-popover__section-header">
                      <span>Statuses</span>
                      <div className="calendar-filter-popover__actions">
                        <button
                          type="button"
                          className="calendar-filter-popover__action"
                          onClick={() => setSelectedStatuses([])}
                        >
                          All
                        </button>
                        {selectedStatuses.length > 0 && (
                          <button
                            type="button"
                            className="calendar-filter-popover__action"
                            onClick={() => setSelectedStatuses([])}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="calendar-filter-popover__list">
                      {statusOptions.map((option) => {
                        const checked = selectedStatuses.includes(option.value);
                        return (
                          <label
                            key={option.value}
                            className={cx(
                              "workspace-filter-checkbox-item",
                              checked &&
                                "workspace-filter-checkbox-item--checked",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setSelectedStatuses((prev) =>
                                  prev.includes(option.value)
                                    ? prev.filter((val) => val !== option.value)
                                    : [...prev, option.value],
                                );
                              }}
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
                  </section>
                </div>
              </div>
            )}
          </div>

          <label className="compact-date">
            <span>From</span>
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="compact-date">
            <span>To</span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
        </div>
      </section>

      {loading ? (
        <LoadingState label="Loading approval requests" />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void load()} />
      ) : items.length === 0 ? (
        <EmptyState
          title={
            tab === "PENDING"
              ? "Your approval queue is clear"
              : "No approval history found"
          }
          description={
            tab === "PENDING"
              ? "New reservation requests and return inspections requiring review from your areas will appear here."
              : "Decided requests and return inspections from your areas will appear here."
          }
        />
      ) : (
        <>
          <div className="reservation-timeline-list">
            {items.map((reservation) => (
              <ApprovalRequestRow
                reservation={reservation}
                key={reservation.id}
              />
            ))}
          </div>
          {pageInfo.hasNextPage && pageInfo.nextCursor && (
            <div className="load-more">
              <Button
                variant="secondary"
                loading={loadingMore}
                onClick={() => void load(pageInfo.nextCursor ?? undefined)}
              >
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ApprovalRequestRow({
  reservation,
}: {
  reservation: ReservationSummary;
}) {
  const start = new Date(reservation.startAt);
  const total = Math.max(1, reservation.itemCount);
  return (
    <Link
      className="reservation-list-row"
      to={`/reservations/${reservation.id}`}
    >
      <time className="reservation-list-date" dateTime={reservation.startAt}>
        <span>
          {new Intl.DateTimeFormat("en-US", { month: "short" }).format(start)}
        </span>
        <strong>
          {new Intl.DateTimeFormat("en-US", { day: "2-digit" }).format(start)}
        </strong>
        <small>
          {new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(start)}
        </small>
      </time>
      <span className="reservation-list-track" aria-hidden />
      <div className="reservation-list-body">
        <div className="reservation-list-title">
          <div>
            <h2>{reservation.eventName}</h2>
            <span
              className={cx(
                "reservation-list-status",
                `reservation-list-status--${reservation.status.toLowerCase()}`,
              )}
            >
              {reservationStatusLabel[reservation.status]}
            </span>
          </div>
        </div>
        <div className="reservation-list-meta">
          <span>
            <Clock3 size={16} /> {formatDate(reservation.startAt, true)} ·{" "}
            {reservationDuration(reservation.startAt, reservation.endAt)}
          </span>
          <span>
            <Avatar
              name={
                reservation.requester.name ??
                reservation.requester.email ??
                "User"
              }
              imageUrl={reservation.requester.profilePictureUrl}
              size="sm"
            />{" "}
            {reservation.requester.name ??
              reservation.requester.email ??
              "User"}
          </span>
        </div>
        <div className="reservation-list-areas">
          {reservation.managementAreas.map((area) => (
            <span key={area.id}>{area.name}</span>
          ))}
          <small>
            {reservation.itemCount} asset types · {reservation.totalQuantity}{" "}
            units
          </small>
        </div>
        <div
          className="reservation-progress"
          aria-label={`${reservation.approvedItemCount} approved, ${reservation.pendingItemCount} pending, ${reservation.rejectedItemCount} rejected`}
        >
          {reservation.approvedItemCount > 0 && (
            <i
              className="is-approved"
              style={{ flexGrow: reservation.approvedItemCount / total }}
            />
          )}
          {reservation.pendingItemCount > 0 && (
            <i
              className="is-pending"
              style={{ flexGrow: reservation.pendingItemCount / total }}
            />
          )}
          {reservation.rejectedItemCount > 0 && (
            <i
              className="is-rejected"
              style={{ flexGrow: reservation.rejectedItemCount / total }}
            />
          )}
        </div>
      </div>
      {reservation.pendingDecisionCount > 0 && (
        <div
          className="reservation-decision-flag"
          aria-label={`${reservation.pendingDecisionCount} ${reservation.pendingDecisionCount === 1 ? "decision" : "decisions"} waiting`}
        >
          <Inbox size={16} />
          <span aria-hidden>
            <strong>{reservation.pendingDecisionCount}</strong>{" "}
            {reservation.pendingDecisionCount === 1 ? "decision" : "decisions"}{" "}
            waiting
          </span>
        </div>
      )}
    </Link>
  );
}

function localDayBoundary(value: string, nextDay: boolean) {
  const date = new Date(`${value}T00:00:00`);
  if (nextDay) date.setDate(date.getDate() + 1);
  return date.toISOString();
}
