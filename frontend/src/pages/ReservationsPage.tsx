import {
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  Clock3,
  Filter,
  Inbox,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
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

type ReservationView = "MINE" | "PARTICIPATING";

const STATUS_COLOR_CLASS: Record<ReservationStatus, string> = {
  DRAFT: "calendar-legend__draft",
  PENDING_APPROVAL: "calendar-legend__pending_approval",
  PARTIALLY_APPROVED: "calendar-legend__partially_approved",
  APPROVED: "calendar-legend__approved",
  DELIVERY_CONFIRMED: "calendar-legend__delivery_confirmed",
  RETURN_PENDING: "calendar-legend__return_pending",
  RETURN_CONFIRMED: "calendar-legend__return_confirmed",
  COMPLETED: "calendar-legend__completed",
  REJECTED: "calendar-legend__rejected",
  CANCELLED: "calendar-legend__cancelled",
};

// RETURN_CONFIRMED is left out here -- per
// docs/software_spec/lifecycle-and-state-machines.md §6, the backend never
// actually persists it as a resting reservation status (it resolves straight
// to COMPLETED or DELIVERY_CONFIRMED in the same operation), so offering it
// as a filter would always return zero results.
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
  RETURN_CONFIRMED: ["RETURN_CONFIRMED"],
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

export function ReservationsPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("reservation:create");
  const [view, setView] = useState<ReservationView>("MINE");
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
    async (cursor?: string) => {
      const requestId = ++requestSequence.current;
      cursor ? setLoadingMore(true) : setLoading(true);
      setError(null);
      try {
        const allowedStatuses = selectedStatuses.flatMap(
          (val) =>
            statusOptions.find((opt) => opt.value === val)?.statuses ?? [],
        );
        const response = await api.reservations({
          view,
          status: allowedStatuses.length === 1 ? allowedStatuses[0] : undefined,
          areaId: selectedAreaIds.length === 1 ? selectedAreaIds[0] : undefined,
          search: search || undefined,
          from: from ? localDayBoundary(from, false) : undefined,
          to: to ? localDayBoundary(to, true) : undefined,
          cursor,
          limit: 20,
        });
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
        setItems((current) =>
          cursor ? [...current, ...list] : list,
        );
        setPageInfo(response.pageInfo);
      } catch (caught) {
        if (requestId !== requestSequence.current) return;
        setError(caught);
      } finally {
        if (requestId === requestSequence.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [from, search, selectedAreaIds, selectedStatuses, to, view],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSearch(searchInput.trim());
  }

  const totalFilterCount = selectedAreaIds.length + selectedStatuses.length;
  const hasActiveFilters = totalFilterCount > 0;

  return (
    <div className="page-stack reservations-index">
      <div
        className="reservation-view-tabs"
        role="tablist"
        aria-label="Reservation view"
      >
        <button
          role="tab"
          aria-selected={view === "MINE"}
          className={cx(view === "MINE" && "is-active")}
          onClick={() => setView("MINE")}
        >
          <UserRound size={16} /> My reservations
        </button>
        <button
          role="tab"
          aria-selected={view === "PARTICIPATING"}
          className={cx(view === "PARTICIPATING" && "is-active")}
          onClick={() => setView("PARTICIPATING")}
        >
          <Users size={16} /> Participate
        </button>
        {canCreate && (
          <Link
            style={{ marginLeft: "auto" }}
            className="button button--primary button--sm"
            to="/reservations/new"
          >
            <Plus size={16} /> New reservation
          </Link>
        )}
      </div>

      <section className="reservation-list-toolbar">
        <form className="reservation-list-search" onSubmit={submitSearch}>
          <Search size={17} />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search events or notes"
            aria-label="Search reservations"
          />
          <button type="submit">Search</button>
        </form>
        <div className="reservation-list-filters">
          <div className="calendar-filter-picker" ref={filterRef}>
            <button
              id="reservation-filter-toggle"
              type="button"
              className={cx(
                "calendar-filter-btn",
                (hasActiveFilters || filterOpen) && "calendar-filter-btn--active",
              )}
              onClick={() => setFilterOpen((prev) => !prev)}
              aria-haspopup="dialog"
              aria-expanded={filterOpen}
              aria-label="Filter reservations by workspace and status"
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
                aria-label="Filter reservations"
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
        <LoadingState label="Loading reservations" />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void load()} />
      ) : items.length === 0 ? (
        <EmptyState
          title={
            view === "PARTICIPATING"
              ? "No participated reservations"
              : "No reservations found"
          }
          description={
            view === "PARTICIPATING"
              ? "Reservations where you are added as a participant will appear here."
              : "Adjust your search filters or draft a new reservation to begin."
          }
          action={
            canCreate && view === "MINE" ? (
              <Link
                className="button button--primary button--md"
                to="/reservations/new"
              >
                <CalendarPlus size={17} /> New reservation
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="reservation-timeline-list">
            {items.map((reservation) => (
              <ReservationListRow
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

function ReservationListRow({
  reservation,
}: {
  reservation: ReservationSummary;
}) {
  const { session } = useAuth();
  const isParticipant =
    Boolean(session?.user?.id) &&
    reservation.requester.id !== session?.user?.id;
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
            {isParticipant && (
              <span className="reservation-list-participant-tag">
                <Users size={12} /> Participant
              </span>
            )}
          </div>
          <ChevronRight size={22} />
        </div>
        <div className="reservation-list-meta">
          <span>
            <Clock3 size={16} /> {formatDate(reservation.startAt, true)} ·{" "}
            {reservationDuration(reservation.startAt, reservation.endAt)}
          </span>
          <span>
            <Avatar
              name={reservation.requester.name ?? reservation.requester.email ?? "User"}
              imageUrl={reservation.requester.profilePictureUrl}
              size="sm"
            />{" "}
            {reservation.requester.name ?? reservation.requester.email ?? "User"}
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
            {reservation.pendingDecisionCount === 1
              ? "decision"
              : "decisions"}{" "}
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
