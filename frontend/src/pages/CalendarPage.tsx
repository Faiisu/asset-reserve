import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Button, ErrorState, PageHeader, Select, cx } from "../components/ui";
import { reservationStatusLabel } from "../reservations";
import type {
  ManagementArea,
  ReservationStatus,
  ReservationSummary,
} from "../types";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const statusOptions: Array<{ value: "" | ReservationStatus; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "PENDING_APPROVAL", label: "Pending approval" },
  { value: "PARTIALLY_APPROVED", label: "Partially approved" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "ACTIVE", label: "In use" },
  { value: "COMPLETED", label: "Completed" },
];

type DateSelection = { anchor: Date; focus: Date };

type CalendarSegment = {
  reservation: ReservationSummary;
  startColumn: number;
  endColumn: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

export function CalendarPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("reservation:create");
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [status, setStatus] = useState("");
  const [areaId, setAreaId] = useState("");
  const [areas, setAreas] = useState<ManagementArea[]>([]);
  const [reservations, setReservations] = useState<ReservationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [selection, setSelection] = useState<DateSelection | null>(null);
  const dragging = useRef(false);
  const selectionAnchor = useRef<Date | null>(null);
  const requestSequence = useRef(0);

  const gridStart = useMemo(() => startOfCalendarGrid(month), [month]);
  const gridEnd = useMemo(() => addDays(gridStart, 42), [gridStart]);
  const weeks = useMemo(
    () =>
      Array.from({ length: 6 }, (_, index) => addDays(gridStart, index * 7)),
    [gridStart],
  );

  useEffect(() => {
    void api
      .areas()
      .then((response) => setAreas(response.data))
      .catch(() => setAreas([]));
  }, []);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError(null);
    try {
      const visible: ReservationSummary[] = [];
      let cursor: string | undefined;
      do {
        const response = await api.reservations({
          view: "ALL",
          status: status || undefined,
          areaId: areaId || undefined,
          from: gridStart.toISOString(),
          to: gridEnd.toISOString(),
          cursor,
          limit: 100,
        });
        visible.push(...response.data);
        cursor = response.pageInfo.hasNextPage
          ? (response.pageInfo.nextCursor ?? undefined)
          : undefined;
      } while (cursor && requestId === requestSequence.current);
      if (requestId === requestSequence.current) setReservations(visible);
    } catch (caught) {
      if (requestId === requestSequence.current) setError(caught);
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [areaId, gridEnd, gridStart, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const stopDragging = () => {
      dragging.current = false;
    };
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, []);

  const selectedRange = selection ? orderedSelection(selection) : null;
  const createUrl = selectedRange
    ? reservationCreateUrl(selectedRange.start, selectedRange.end)
    : "/reservations/new";

  function beginSelection(date: Date, event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !canCreate) return;
    if ((event.target as HTMLElement).closest("a")) return;
    dragging.current = true;
    selectionAnchor.current = date;
    setSelection({ anchor: date, focus: date });
  }

  function extendSelection(date: Date) {
    if (!dragging.current || !canCreate) return;
    setSelection((current) =>
      current ? { ...current, focus: date } : { anchor: date, focus: date },
    );
  }

  function finishSelection(date: Date) {
    if (!dragging.current || !selectionAnchor.current || !canCreate) return;
    dragging.current = false;
    const range = orderedSelection({
      anchor: selectionAnchor.current,
      focus: date,
    });
    navigate(reservationCreateUrl(range.start, range.end));
  }

  function selectWithKeyboard(
    date: Date,
    event: KeyboardEvent<HTMLButtonElement>,
  ) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setSelection({ anchor: date, focus: date });
  }

  function moveMonth(offset: number) {
    setMonth((current) => addMonths(current, offset));
    setSelection(null);
  }

  return (
    <div className="page-stack calendar-page">
      <PageHeader
        eyebrow="Calendar / reservation rail"
        title="See every reservation in motion."
        description="This calendar shows only reservations the backend allows you to see. Drag across dates to prepare a new reservation window."
        actions={
          canCreate ? (
            <Link
              className="button button--primary button--md"
              to="/reservations/new"
            >
              <Plus size={17} /> New reservation
            </Link>
          ) : undefined
        }
      />

      <section className="calendar-controls" aria-label="Calendar controls">
        <div className="calendar-month-control">
          <div className="calendar-month-control__buttons">
            <button
              type="button"
              className="icon-button"
              aria-label="Previous month"
              onClick={() => moveMonth(-1)}
            >
              <ChevronLeft size={19} />
            </button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setMonth(startOfMonth(new Date()));
                setSelection(null);
              }}
            >
              Today
            </Button>
            <button
              type="button"
              className="icon-button"
              aria-label="Next month"
              onClick={() => moveMonth(1)}
            >
              <ChevronRight size={19} />
            </button>
          </div>
          <div aria-live="polite">
            <span>{month.getFullYear()}</span>
            <h2>{formatMonth(month)}</h2>
          </div>
        </div>

        <div className="calendar-filters">
          <span>
            <Filter size={14} /> Filter visible reservations
          </span>
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
        </div>
      </section>

      {selectedRange && (
        <section className="calendar-selection" aria-live="polite">
          <span className="calendar-selection__mark" aria-hidden />
          <div>
            <small>New reservation window</small>
            <strong>{formatSelection(selectedRange)}</strong>
            <span>Starts at 09:00 and ends at 17:00 in your local time.</span>
          </div>
          <div className="calendar-selection__actions">
            <button
              type="button"
              className="icon-button"
              aria-label="Clear selected dates"
              onClick={() => setSelection(null)}
            >
              <X size={17} />
            </button>
            <Link className="button button--primary button--sm" to={createUrl}>
              Create in this window <ChevronRight size={16} />
            </Link>
          </div>
        </section>
      )}

      {error ? (
        <ErrorState error={error} onRetry={() => void load()} />
      ) : (
        <div className="calendar-frame">
          <div className="calendar-scroll" tabIndex={0}>
            <div className="calendar-board" aria-busy={loading}>
              <div className="calendar-weekdays" aria-hidden>
                {DAY_NAMES.map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className="calendar-weeks">
                {weeks.map((weekStart) => (
                  <CalendarWeek
                    key={dateKey(weekStart)}
                    weekStart={weekStart}
                    month={month}
                    reservations={reservations}
                    selectedRange={selectedRange}
                    canCreate={canCreate}
                    onPointerDown={beginSelection}
                    onPointerEnter={extendSelection}
                    onPointerUp={finishSelection}
                    onKeyDown={selectWithKeyboard}
                  />
                ))}
              </div>
              {loading && (
                <div className="calendar-loading" role="status">
                  <LoaderCircle className="spin" size={22} />
                  Loading visible reservations
                </div>
              )}
              {!loading && reservations.length === 0 && (
                <div className="calendar-empty">
                  <CalendarDays size={20} />
                  <span>
                    <strong>No reservations in this range</strong>
                    Try another filter or drag across the calendar to start one.
                  </span>
                </div>
              )}
            </div>
          </div>
          <CalendarLegend />
        </div>
      )}
    </div>
  );
}

function CalendarWeek({
  weekStart,
  month,
  reservations,
  selectedRange,
  canCreate,
  onPointerDown,
  onPointerEnter,
  onPointerUp,
  onKeyDown,
}: {
  weekStart: Date;
  month: Date;
  reservations: ReservationSummary[];
  selectedRange: { start: Date; end: Date } | null;
  canCreate: boolean;
  onPointerDown: (date: Date, event: PointerEvent<HTMLDivElement>) => void;
  onPointerEnter: (date: Date) => void;
  onPointerUp: (date: Date) => void;
  onKeyDown: (date: Date, event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const days = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index),
  );
  const segments = reservationSegments(reservations, weekStart);
  const laneCount = Math.max(
    segments.reduce((max, item) => Math.max(max, item.lane + 1), 0),
    1,
  );
  const style = { "--calendar-lanes": laneCount } as CSSProperties;

  return (
    <div className="calendar-week" style={style}>
      <div className="calendar-week__days">
        {days.map((date) => {
          const isOutsideMonth = date.getMonth() !== month.getMonth();
          const isSelected = selectedRange
            ? date >= selectedRange.start && date <= selectedRange.end
            : false;
          return (
            <div
              key={dateKey(date)}
              className={cx(
                "calendar-day",
                isOutsideMonth && "calendar-day--outside",
                isToday(date) && "calendar-day--today",
                isSelected && "calendar-day--selected",
                canCreate && "calendar-day--selectable",
              )}
              onPointerDown={(event) => onPointerDown(date, event)}
              onPointerEnter={() => onPointerEnter(date)}
              onPointerUp={() => onPointerUp(date)}
            >
              <button
                type="button"
                className="calendar-day__number"
                aria-label={`${formatFullDate(date)}${canCreate ? ", select reservation date" : ""}`}
                onKeyDown={(event) => onKeyDown(date, event)}
                onClick={() => canCreate && onPointerEnter(date)}
              >
                {date.getDate()}
              </button>
            </div>
          );
        })}
      </div>
      <div className="calendar-week__events">
        {segments.map((segment) => (
          <ReservationBar
            key={`${segment.reservation.id}-${dateKey(weekStart)}`}
            segment={segment}
          />
        ))}
      </div>
    </div>
  );
}

function ReservationBar({ segment }: { segment: CalendarSegment }) {
  const { reservation } = segment;
  const style = {
    gridColumn: `${segment.startColumn + 1} / ${segment.endColumn + 2}`,
    gridRow: segment.lane + 1,
  };
  const time = formatTime(new Date(reservation.startAt));
  const label = `${reservation.eventName}, ${reservationStatusLabel[reservation.status]}, ${formatDateTimeRange(reservation.startAt, reservation.endAt)}`;
  return (
    <Link
      to={`/reservations/${reservation.id}`}
      className={cx(
        "calendar-event",
        `calendar-event--${reservation.status.toLowerCase()}`,
        segment.continuesBefore && "calendar-event--continues-before",
        segment.continuesAfter && "calendar-event--continues-after",
      )}
      style={style}
      aria-label={label}
      title={label}
      draggable={false}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {!segment.continuesBefore && <time>{time}</time>}
      {segment.continuesBefore && <span aria-hidden>‹</span>}
      <strong>{reservation.eventName}</strong>
      <small>{reservationStatusLabel[reservation.status]}</small>
      {segment.continuesAfter && <span aria-hidden>›</span>}
    </Link>
  );
}

function CalendarLegend() {
  return (
    <div className="calendar-legend" aria-label="Reservation status colors">
      {statusOptions.slice(1).map((status) => (
        <span key={status.value}>
          <i className={`calendar-legend__${status.value.toLowerCase()}`} />
          {status.label}
        </span>
      ))}
    </div>
  );
}

export function reservationSegments(
  reservations: ReservationSummary[],
  weekStart: Date,
): CalendarSegment[] {
  const weekEnd = addDays(weekStart, 7);
  const candidates = reservations.flatMap((reservation) => {
    const start = new Date(reservation.startAt);
    const end = new Date(reservation.endAt);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start ||
      end <= weekStart ||
      start >= weekEnd
    ) {
      return [];
    }
    const startDay = startOfDay(start < weekStart ? weekStart : start);
    const inclusiveEnd = new Date(end.getTime() - 1);
    const lastDay = startOfDay(
      inclusiveEnd >= weekEnd ? addDays(weekEnd, -1) : inclusiveEnd,
    );
    return [
      {
        reservation,
        startColumn: calendarDayDistance(weekStart, startDay),
        endColumn: calendarDayDistance(weekStart, lastDay),
        lane: 0,
        continuesBefore: start < weekStart,
        continuesAfter: end > weekEnd,
      },
    ];
  });

  candidates.sort(
    (a, b) =>
      a.startColumn - b.startColumn ||
      b.endColumn - a.endColumn ||
      a.reservation.startAt.localeCompare(b.reservation.startAt),
  );
  const laneEnds: number[] = [];
  return candidates.map((segment) => {
    let lane = laneEnds.findIndex(
      (endColumn) => endColumn < segment.startColumn,
    );
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = segment.endColumn;
    return { ...segment, lane };
  });
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfMonth(value: Date) {
  const date = startOfDay(value);
  date.setDate(1);
  return date;
}

function startOfCalendarGrid(month: Date) {
  const first = startOfMonth(month);
  const mondayOffset = (first.getDay() + 6) % 7;
  return addDays(first, -mondayOffset);
}

function addDays(value: Date, amount: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function addMonths(value: Date, amount: number) {
  const date = startOfMonth(value);
  date.setMonth(date.getMonth() + amount);
  return date;
}

function calendarDayDistance(from: Date, to: Date) {
  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

function dateKey(value: Date) {
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

function isToday(value: Date) {
  return dateKey(value) === dateKey(new Date());
}

function orderedSelection(selection: DateSelection) {
  return selection.anchor <= selection.focus
    ? { start: selection.anchor, end: selection.focus }
    : { start: selection.focus, end: selection.anchor };
}

function reservationCreateUrl(startDay: Date, endDay: Date) {
  const startAt = new Date(startDay);
  startAt.setHours(9, 0, 0, 0);
  const endAt = new Date(endDay);
  endAt.setHours(17, 0, 0, 0);
  const query = new URLSearchParams({
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
  });
  return `/reservations/new?${query.toString()}`;
}

function formatMonth(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(value);
}

function formatFullDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

function formatSelection({ start, end }: { start: Date; end: Date }) {
  if (dateKey(start) === dateKey(end)) return formatFullDate(start);
  return `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(start)} – ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(end)}`;
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatDateTimeRange(startAt: string, endAt: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formatter.format(new Date(startAt))} to ${formatter.format(new Date(endAt))}`;
}
