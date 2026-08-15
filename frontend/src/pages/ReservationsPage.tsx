import {
  CalendarPlus,
  ChevronRight,
  Clock3,
  Filter,
  Inbox,
  Layers3,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
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
  PaginationControls,
  Select,
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

type ReservationView = "MINE" | "APPROVALS" | "ALL";

const statusOptions: Array<{ value: "" | ReservationStatus; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "PENDING_APPROVAL", label: "Pending approval" },
  { value: "PARTIALLY_APPROVED", label: "Partially approved" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ACTIVE", label: "In use" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export function ReservationsPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("reservation:create");
  const canReview =
    hasPermission("reservation:approve") || hasPermission("reservation:reject");
  const [view, setView] = useState<ReservationView>(
    canCreate ? "MINE" : canReview ? "APPROVALS" : "MINE",
  );
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [areaId, setAreaId] = useState("");
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
  const requestSequence = useRef(0);

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
        const response = await api.reservations({
          view,
          status: status || undefined,
          areaId: areaId || undefined,
          search: search || undefined,
          from: from ? localDayBoundary(from, false) : undefined,
          to: to ? localDayBoundary(to, true) : undefined,
          cursor,
          limit: 20,
        });
        if (requestId !== requestSequence.current) return;
        setItems((current) =>
          cursor ? [...current, ...response.data] : response.data,
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
    [areaId, from, search, status, to, view],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSearch(searchInput.trim());
  }

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
        {canReview && (
          <button
            role="tab"
            aria-selected={view === "APPROVALS"}
            className={cx(view === "APPROVALS" && "is-active")}
            onClick={() => setView("APPROVALS")}
          >
            <ShieldCheck size={16} /> Approval queue
          </button>
        )}
        <button
          role="tab"
          aria-selected={view === "ALL"}
          className={cx(view === "ALL" && "is-active")}
          onClick={() => setView("ALL")}
        >
          <Layers3 size={16} /> All visible
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

      {view === "APPROVALS" && (
        <section className="review-lane-banner">
          <span>
            <ShieldCheck size={22} />
          </span>
          <div>
            <p className="eyebrow eyebrow--light">Review lane</p>
            <strong>
              Only reservations needing a decision from your areas appear here.
            </strong>
          </div>
          <small>
            Open an event to approve assets or review a requested edit.
          </small>
        </section>
      )}

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
          <span>
            <Filter size={14} /> Filters
          </span>
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Reservation status"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select
            value={areaId}
            onChange={(event) => setAreaId(event.target.value)}
            aria-label="Management area"
          >
            <option value="">All areas</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </Select>
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
            view === "APPROVALS"
              ? "Your approval queue is clear"
              : "No reservations match this view"
          }
          description={
            view === "APPROVALS"
              ? "New requests from your management areas will appear here."
              : "Adjust the filters or create a new reservation to begin."
          }
          action={
            canCreate && view !== "APPROVALS" ? (
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
                reviewView={view === "APPROVALS"}
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
  reviewView,
}: {
  reservation: ReservationSummary;
  reviewView: boolean;
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
          <ChevronRight size={19} />
        </div>
        <div className="reservation-list-meta">
          <span>
            <Clock3 size={14} /> {formatDate(reservation.startAt, true)} ·{" "}
            {reservationDuration(reservation.startAt, reservation.endAt)}
          </span>
          <span>
            <Avatar
              name={reservation.requester.name ?? reservation.requester.email}
              imageUrl={reservation.requester.profilePictureUrl}
              size="sm"
            />{" "}
            {reservation.requester.name ?? reservation.requester.email}
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
      {(reviewView || reservation.pendingDecisionCount > 0) &&
        reservation.pendingDecisionCount > 0 && (
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
