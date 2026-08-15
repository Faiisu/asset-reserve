import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  LayoutGrid,
  List,
  LoaderCircle,
  Maximize2,
  PackageSearch,
  Plus,
  Search,
  X,
  XCircle,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import {
  AssetPicture,
  Button,
  Dialog,
  ErrorState,
  Field,
  Select,
  Textarea,
  cx,
} from "../components/ui";
import { reservationStatusLabel } from "../reservations";
import type {
  AssetSummary,
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

type EventMenu = {
  reservation: ReservationSummary;
  top: number;
  left: number;
} | null;

export function CalendarPage() {
  const { hasPermission, hasAreaPermission } = useAuth();
  const canCreate = hasPermission("reservation:create");
  const baseMonth = useMemo(() => startOfMonth(new Date()), []);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [monthOffsets, setMonthOffsets] = useState({ before: 1, after: 3 });
  const [status, setStatus] = useState("");
  const [areaId, setAreaId] = useState("");
  const [areas, setAreas] = useState<ManagementArea[]>([]);
  const [reservations, setReservations] = useState<ReservationSummary[]>([]);
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [assetSearch, setAssetSearch] = useState("");
  const [selectedAssets, setSelectedAssets] = useState<AssetSummary[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [assetError, setAssetError] = useState<unknown>(null);
  const [assetBrowserOpen, setAssetBrowserOpen] = useState(false);
  const [assetBrowserView, setAssetBrowserView] = useState<"list" | "grid">(
    "grid",
  );
  const [calendarHeight, setCalendarHeight] = useState<number | null>(null);
  const [eventMenu, setEventMenu] = useState<EventMenu>(null);
  const [cancelTarget, setCancelTarget] = useState<ReservationSummary | null>(
    null,
  );
  const [eventAction, setEventAction] = useState<
    "APPROVE" | "REJECT" | "CANCEL" | null
  >(null);
  const [eventActionError, setEventActionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [selection, setSelection] = useState<DateSelection | null>(null);
  const dragging = useRef(false);
  const selectionAnchor = useRef<Date | null>(null);
  const [miniCalendarOpen, setMiniCalendarOpen] = useState(false);
  const miniCalendarRef = useRef<HTMLDivElement>(null);
  const reservePanel = useRef<HTMLElement>(null);
  const calendarFrame = useRef<HTMLDivElement>(null);
  const calendarScrollRef = useRef<HTMLDivElement>(null);
  const eventMenuRef = useRef<HTMLElement>(null);
  const requestSequence = useRef(0);
  const selectedRange = selection ? orderedSelection(selection) : null;
  const selectedSchedule = selectedRange
    ? reservationSchedule(selectedRange.start, selectedRange.end)
    : null;
  const selectedStartAt = selectedSchedule?.startAt.toISOString();
  const selectedEndAt = selectedSchedule?.endAt.toISOString();
  const hasSelectedSchedule = Boolean(selectedStartAt && selectedEndAt);
  const headerMonth = selectedRange
    ? startOfMonth(selectedRange.start)
    : visibleMonth;

  const earliestMonth = useMemo(
    () => addMonths(baseMonth, -monthOffsets.before),
    [baseMonth, monthOffsets.before],
  );
  const latestMonth = useMemo(
    () => addMonths(baseMonth, monthOffsets.after),
    [baseMonth, monthOffsets.after],
  );

  const gridStart = useMemo(
    () => startOfCalendarGrid(earliestMonth),
    [earliestMonth],
  );
  const gridEnd = useMemo(() => {
    const nextMonth = addMonths(latestMonth, 1);
    return startOfCalendarGrid(nextMonth);
  }, [latestMonth]);

  const weeks = useMemo(() => {
    const count = Math.round(
      (gridEnd.getTime() - gridStart.getTime()) / (7 * 86_400_000),
    );
    return Array.from({ length: Math.max(count, 6) }, (_, index) =>
      addDays(gridStart, index * 7),
    );
  }, [gridStart, gridEnd]);
  const closeAssetBrowser = useCallback(() => setAssetBrowserOpen(false), []);

  useEffect(() => {
    void api
      .areas()
      .then((response) => setAreas(response.data))
      .catch(() => setAreas([]));
  }, []);

  useEffect(() => {
    if (!eventMenu) return;
    const close = () => setEventMenu(null);
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!eventMenuRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [eventMenu]);

  useEffect(() => {
    if (!miniCalendarOpen) return;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!miniCalendarRef.current?.contains(event.target as Node)) {
        setMiniCalendarOpen(false);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setMiniCalendarOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [miniCalendarOpen]);

  useEffect(() => {
    if (!canCreate || typeof ResizeObserver === "undefined") return;
    const frame = calendarFrame.current;
    if (!frame) return;
    const updateHeight = () => {
      const nextHeight = Math.round(frame.getBoundingClientRect().height);
      if (nextHeight > 0) setCalendarHeight(nextHeight);
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [canCreate, error]);

  useEffect(() => {
    if (!canCreate) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoadingAssets(true);
      setAssetError(null);
      void (async () => {
        try {
          const visible: AssetSummary[] = [];
          let cursor: string | undefined;
          do {
            const response = await api.assets({
              search: assetSearch.trim() || undefined,
              areaId: areaId || undefined,
              isActive: true,
              from: selectedStartAt,
              to: selectedEndAt,
              cursor,
              limit: 100,
            });
            visible.push(...response.data);
            cursor = response.pageInfo.hasNextPage
              ? (response.pageInfo.nextCursor ?? undefined)
              : undefined;
          } while (active && cursor);
          if (!active) return;
          setAssets(visible);
          const byId = new Map(
            visible.map((asset) => [asset.id, asset] as const),
          );
          setSelectedAssets((current) =>
            current.flatMap((asset) => {
              const updated = byId.get(asset.id);
              if (!updated) return [asset];
              return !hasSelectedSchedule || updated.availableQuantity > 0
                ? [updated]
                : [];
            }),
          );
        } catch (caught) {
          if (active) setAssetError(caught);
        } finally {
          if (active) setLoadingAssets(false);
        }
      })();
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    areaId,
    assetSearch,
    canCreate,
    hasSelectedSchedule,
    selectedEndAt,
    selectedStartAt,
  ]);

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

  const selectedAssetIds = new Set(selectedAssets.map((asset) => asset.id));
  const reservableAssets = assets
    .filter((asset) =>
      hasAreaPermission("reservation:create", asset.managementArea.id),
    )
    .sort((left, right) => {
      if (!selectedRange) return 0;
      return (
        Number(left.availableQuantity <= 0) -
        Number(right.availableQuantity <= 0)
      );
    });
  const createUrl = selectedRange
    ? reservationCreateUrl(
        selectedRange.start,
        selectedRange.end,
        selectedAssets.map((asset) => asset.id),
      )
    : "/reservations/new";

  // Initial scroll to base month on mount
  useEffect(() => {
    const targetKey = dateKey(baseMonth);
    const scrollContainer = calendarScrollRef.current;
    if (!scrollContainer) return;
    const targetEl =
      scrollContainer.querySelector<HTMLElement>(`[data-month-start="${targetKey}"]`) ||
      scrollContainer.querySelector<HTMLElement>(`[data-date-key="${targetKey}"]`);
    if (targetEl) {
      scrollToElement(scrollContainer, targetEl, 40, false);
    }
  }, [baseMonth]);

  const handleScroll = useCallback(() => {
    const container = calendarScrollRef.current;
    if (!container) return;

    // 1. Detect visible month from the week element near the top of the scroll view
    const scrollTop = container.scrollTop;
    const targetOffset = scrollTop + 80;
    const weekElements = container.querySelectorAll<HTMLElement>(".calendar-week");
    for (const weekEl of weekElements) {
      if (weekEl.offsetTop + weekEl.offsetHeight >= targetOffset) {
        const weekDateAttr = weekEl.getAttribute("data-week-start");
        if (weekDateAttr) {
          const [y, m, d] = weekDateAttr.split("-").map(Number);
          const weekDate = new Date(y, m - 1, d);
          const midWeekDate = addDays(weekDate, 3);
          const currentMonth = startOfMonth(midWeekDate);
          if (
            currentMonth.getMonth() !== visibleMonth.getMonth() ||
            currentMonth.getFullYear() !== visibleMonth.getFullYear()
          ) {
            setVisibleMonth(currentMonth);
          }
        }
        break;
      }
    }

    // 2. Infinite scroll detection near top / bottom
    if (scrollTop < 80) {
      const prevScrollHeight = container.scrollHeight;
      const prevScrollTop = container.scrollTop;
      setMonthOffsets((prev) => {
        if (prev.before >= 24) return prev;
        return { ...prev, before: prev.before + 2 };
      });
      requestAnimationFrame(() => {
        if (calendarScrollRef.current) {
          const newScrollHeight = calendarScrollRef.current.scrollHeight;
          calendarScrollRef.current.scrollTop =
            prevScrollTop + (newScrollHeight - prevScrollHeight);
        }
      });
    } else if (
      container.scrollHeight - scrollTop - container.clientHeight < 150
    ) {
      setMonthOffsets((prev) => {
        if (prev.after >= 24) return prev;
        return { ...prev, after: prev.after + 2 };
      });
    }
  }, [visibleMonth]);

  function beginSelection(date: Date, event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !canCreate) return;
    if ((event.target as HTMLElement).closest("a")) return;
    dragging.current = true;
    selectionAnchor.current = date;
    setVisibleMonth(startOfMonth(date));
    setSelection({ anchor: date, focus: date });
  }

  function extendSelection(date: Date) {
    if (!dragging.current || !canCreate) return;
    setVisibleMonth(startOfMonth(date));
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
    setVisibleMonth(startOfMonth(range.start));
    setSelection({ anchor: range.start, focus: range.end });
    window.requestAnimationFrame(() => {
      if (
        typeof window.matchMedia !== "function" ||
        !window.matchMedia("(max-width: 1120px)").matches ||
        typeof reservePanel.current?.scrollIntoView !== "function"
      ) {
        return;
      }
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      reservePanel.current.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
    });
  }

  function selectWithKeyboard(
    date: Date,
    event: KeyboardEvent<HTMLButtonElement>,
  ) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setVisibleMonth(startOfMonth(date));
    setSelection({ anchor: date, focus: date });
  }

  function moveMonth(offset: number) {
    const targetMonth = addMonths(visibleMonth, offset);
    setVisibleMonth(targetMonth);
    const diffMonths = Math.round(
      (targetMonth.getFullYear() - baseMonth.getFullYear()) * 12 +
        (targetMonth.getMonth() - baseMonth.getMonth()),
    );
    if (diffMonths < -monthOffsets.before) {
      setMonthOffsets((prev) => ({ ...prev, before: Math.abs(diffMonths) + 1 }));
    } else if (diffMonths > monthOffsets.after) {
      setMonthOffsets((prev) => ({ ...prev, after: diffMonths + 1 }));
    }

    requestAnimationFrame(() => {
      const targetKey = dateKey(startOfMonth(targetMonth));
      const scrollContainer = calendarScrollRef.current;
      if (!scrollContainer) return;
      const targetEl =
        scrollContainer.querySelector<HTMLElement>(`[data-month-start="${targetKey}"]`) ||
        scrollContainer.querySelector<HTMLElement>(`[data-date-key="${targetKey}"]`);
      if (targetEl) {
        scrollToElement(scrollContainer, targetEl, 40, true);
      }
    });
  }

  function handlePickDate(targetDate: Date) {
    const targetMonth = startOfMonth(targetDate);
    setVisibleMonth(targetMonth);
    setMiniCalendarOpen(false);

    const diffMonths = Math.round(
      (targetMonth.getFullYear() - baseMonth.getFullYear()) * 12 +
        (targetMonth.getMonth() - baseMonth.getMonth()),
    );
    if (diffMonths < -monthOffsets.before) {
      setMonthOffsets((prev) => ({ ...prev, before: Math.abs(diffMonths) + 1 }));
    } else if (diffMonths > monthOffsets.after) {
      setMonthOffsets((prev) => ({ ...prev, after: diffMonths + 1 }));
    }

    requestAnimationFrame(() => {
      const targetKey = dateKey(targetDate);
      const scrollContainer = calendarScrollRef.current;
      if (!scrollContainer) return;
      const targetEl =
        scrollContainer.querySelector<HTMLElement>(`[data-date-key="${targetKey}"]`) ||
        scrollContainer.querySelector<HTMLElement>(`[data-month-start="${dateKey(targetMonth)}"]`);
      if (targetEl) {
        scrollToElement(scrollContainer, targetEl, 40, true);
      }
    });
  }

  function goToToday() {
    const today = new Date();
    const todayMonth = startOfMonth(today);
    setVisibleMonth(todayMonth);
    setSelection(null);

    const diffMonths = Math.round(
      (todayMonth.getFullYear() - baseMonth.getFullYear()) * 12 +
        (todayMonth.getMonth() - baseMonth.getMonth()),
    );
    if (diffMonths < -monthOffsets.before) {
      setMonthOffsets((prev) => ({ ...prev, before: Math.abs(diffMonths) + 1 }));
    } else if (diffMonths > monthOffsets.after) {
      setMonthOffsets((prev) => ({ ...prev, after: diffMonths + 1 }));
    }

    requestAnimationFrame(() => {
      const todayKey = dateKey(today);
      const scrollContainer = calendarScrollRef.current;
      if (!scrollContainer) return;
      const targetEl = scrollContainer.querySelector<HTMLElement>(
        `[data-date-key="${todayKey}"]`,
      );
      if (targetEl) {
        scrollToElement(scrollContainer, targetEl, 40, true);
      }
    });
  }

  function openEventMenu(reservation: ReservationSummary, anchor: DOMRect) {
    const menuWidth = 330;
    const menuHeight = 218;
    const gap = 8;
    const left = Math.max(
      12,
      Math.min(anchor.left, window.innerWidth - menuWidth - 12),
    );
    const top =
      anchor.bottom + menuHeight + gap <= window.innerHeight
        ? anchor.bottom + gap
        : Math.max(12, anchor.top - menuHeight - gap);
    setEventAction(null);
    setEventActionError("");
    setEventMenu({ reservation, top, left });
  }

  async function decideEvent(decision: "APPROVE" | "REJECT") {
    if (!eventMenu) return;
    setEventAction(decision);
    setEventActionError("");
    try {
      const detail = await api.reservation(eventMenu.reservation.id);
      const itemIds = detail.items
        .filter(
          (item) =>
            item.status === "PENDING" &&
            (decision === "APPROVE"
              ? item.capabilities.canApprove
              : item.capabilities.canReject),
        )
        .map((item) => item.id);
      if (itemIds.length === 0) {
        setEventActionError(
          `No pending assets are available to ${decision.toLowerCase()}.`,
        );
        return;
      }
      await api.decideReservationItems(
        eventMenu.reservation.id,
        itemIds,
        decision,
      );
      setEventMenu(null);
      await load();
    } catch (caught) {
      setEventActionError(
        caught instanceof Error
          ? caught.message
          : "Unable to record this decision.",
      );
    } finally {
      setEventAction(null);
    }
  }

  async function cancelEvent(reservationId: string, reason?: string) {
    setEventAction("CANCEL");
    setEventActionError("");
    try {
      await api.cancelReservation(reservationId, reason);
      setEventMenu(null);
      setCancelTarget(null);
      await load();
    } catch (caught) {
      setEventActionError(
        caught instanceof Error
          ? caught.message
          : "Unable to cancel this reservation.",
      );
    } finally {
      setEventAction(null);
    }
  }

  function toggleAsset(asset: AssetSummary) {
    if (selectedRange && asset.availableQuantity <= 0) return;
    setSelectedAssets((current) =>
      current.some((item) => item.id === asset.id)
        ? current.filter((item) => item.id !== asset.id)
        : [...current, asset],
    );
  }

  return (
    <div className="page-stack calendar-page">
      <section className="calendar-controls" aria-label="Calendar controls">
        <div className="calendar-month-control">
          <div className="calendar-month-control__buttons">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={goToToday}
            >
              Today
            </Button>
            <div className="calendar-mini-picker" ref={miniCalendarRef}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setMiniCalendarOpen((prev) => !prev)}
                aria-haspopup="dialog"
                aria-expanded={miniCalendarOpen}
                aria-label="Select date from mini calendar"
              >
                <CalendarDays size={15} /> Select date
              </Button>
              {miniCalendarOpen && (
                <MiniCalendarPopover
                  initialMonth={visibleMonth}
                  onSelectDate={handlePickDate}
                  onClose={() => setMiniCalendarOpen(false)}
                />
              )}
            </div>
          </div>
          <div aria-live="polite">
            <span>{headerMonth.getFullYear()}</span>
            <h2>{formatMonth(headerMonth)}</h2>
          </div>
        </div>

        <div className="calendar-filters">
          <span>
            <Filter size={14} /> Filter workspace
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

      <div
        className={cx(
          "calendar-workspace",
          !canCreate && "calendar-workspace--calendar-only",
        )}
      >
        <div className="calendar-workspace__rail">
          {error ? (
            <ErrorState error={error} onRetry={() => void load()} />
          ) : (
            <div className="calendar-frame" ref={calendarFrame}>
              <div
                className="calendar-scroll"
                ref={calendarScrollRef}
                onScroll={handleScroll}
                tabIndex={0}
              >
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
                        visibleMonth={visibleMonth}
                        reservations={reservations}
                        selectedRange={selectedRange}
                        canCreate={canCreate}
                        onPointerDown={beginSelection}
                        onPointerEnter={extendSelection}
                        onPointerUp={finishSelection}
                        onKeyDown={selectWithKeyboard}
                        onOpenEvent={openEventMenu}
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
                        Drag across the calendar to start one.
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <CalendarLegend />
            </div>
          )}
        </div>

        {canCreate && (
          <aside
            ref={reservePanel}
            className="calendar-reserve-panel"
            aria-label="Asset picker"
            style={calendarHeight ? { height: calendarHeight } : undefined}
          >
            <header className="calendar-reserve-panel__header">
              <span className="calendar-reserve-panel__icon" aria-hidden>
                <PackageSearch size={19} />
              </span>
              <div>
                <p className="eyebrow">Reservation manifest</p>
                <h2>Choose assets</h2>
              </div>
              <span className="calendar-reserve-panel__count">
                {selectedAssets.length}
              </span>
            </header>

            <div
              className={cx(
                "calendar-reserve-window",
                selectedRange && "calendar-reserve-window--ready",
              )}
            >
              <CalendarDays size={16} />
              <span>
                <small>01 / Schedule</small>
                <strong>
                  {selectedRange
                    ? formatSelection(selectedRange)
                    : "Select dates on the calendar"}
                </strong>
              </span>
              {selectedRange && (
                <button
                  type="button"
                  aria-label="Clear selected dates"
                  onClick={() => setSelection(null)}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="calendar-asset-search">
              <Search size={16} />
              <input
                value={assetSearch}
                onChange={(event) => setAssetSearch(event.target.value)}
                placeholder="Search assets"
                aria-label="Search assets for reservation"
              />
            </div>

            <div className="calendar-asset-list-toolbar">
              <span>{reservableAssets.length} assets</span>
              <button
                type="button"
                onClick={() => {
                  setAssetSearch("");
                  setAssetBrowserOpen(true);
                }}
              >
                <Maximize2 size={13} /> Show all
              </button>
            </div>

            <div className="calendar-asset-list" aria-live="polite">
              {loadingAssets ? (
                <div className="calendar-asset-list__message">
                  <LoaderCircle className="spin" size={19} />
                  <strong>Loading assets</strong>
                </div>
              ) : assetError ? (
                <div className="calendar-asset-list__message calendar-asset-list__message--error">
                  <strong>Unable to load assets</strong>
                  <p>Change the search or refresh the page to try again.</p>
                </div>
              ) : reservableAssets.length === 0 ? (
                <div className="calendar-asset-list__message">
                  <strong>No assets match this search</strong>
                  <p>Try another name or management area.</p>
                </div>
              ) : (
                reservableAssets.map((asset) => (
                  <CalendarAssetOption
                    key={asset.id}
                    asset={asset}
                    selected={selectedAssetIds.has(asset.id)}
                    scheduleSelected={Boolean(selectedRange)}
                    onToggle={toggleAsset}
                  />
                ))
              )}
            </div>

            <footer className="calendar-reserve-panel__footer">
              <div>
                <span>
                  <strong>{selectedAssets.length}</strong> asset types selected
                </span>
                <small>
                  {selectedRange
                    ? "Availability matches the selected schedule."
                    : "Choose dates to check availability and continue."}
                </small>
              </div>
              <Link
                className={cx(
                  "button button--primary button--md",
                  (!selectedRange || selectedAssets.length === 0) &&
                    "button--disabled",
                )}
                to={createUrl}
                aria-disabled={!selectedRange || selectedAssets.length === 0}
                onClick={(event) => {
                  if (!selectedRange || selectedAssets.length === 0)
                    event.preventDefault();
                }}
              >
                {selectedAssets.length
                  ? `Reserve ${selectedAssets.length} asset${selectedAssets.length === 1 ? "" : "s"}`
                  : "Select assets to reserve"}
                <ChevronRight size={16} />
              </Link>
            </footer>
          </aside>
        )}
      </div>

      {eventMenu && (
        <EventActionMenu
          menuRef={eventMenuRef}
          menu={eventMenu}
          canApprove={
            eventMenu.reservation.capabilities.canReview &&
            eventMenu.reservation.pendingItemCount > 0 &&
            hasPermission("reservation:approve")
          }
          canReject={
            eventMenu.reservation.capabilities.canReview &&
            eventMenu.reservation.pendingItemCount > 0 &&
            hasPermission("reservation:reject")
          }
          canCancel={Boolean(eventMenu.reservation.capabilities?.canCancel)}
          action={eventAction}
          error={eventActionError}
          onDecision={(decision) => void decideEvent(decision)}
          onCancelRequest={() => setCancelTarget(eventMenu.reservation)}
          onClose={() => setEventMenu(null)}
        />
      )}

      {cancelTarget && (
        <CancelReservationDialog
          open={Boolean(cancelTarget)}
          eventName={cancelTarget.eventName}
          onClose={() => setCancelTarget(null)}
          onConfirm={(reason) => cancelEvent(cancelTarget.id, reason)}
        />
      )}

      <Dialog
        open={assetBrowserOpen}
        title="All reservation assets"
        description="Search the full inventory, then select the assets to add to this reservation."
        onClose={closeAssetBrowser}
        wide
      >
        <div className="calendar-asset-browser">
          <div className="calendar-asset-browser__toolbar">
            <label className="calendar-asset-browser__search">
              <Search size={17} />
              <input
                value={assetSearch}
                onChange={(event) => setAssetSearch(event.target.value)}
                placeholder="Search asset name"
                aria-label="Search all reservation assets"
              />
            </label>
            <div
              className="calendar-asset-browser__view-toggle"
              role="group"
              aria-label="Asset display"
            >
              <button
                type="button"
                aria-label="Show assets as a list"
                aria-pressed={assetBrowserView === "list"}
                onClick={() => setAssetBrowserView("list")}
              >
                <List size={16} /> List
              </button>
              <button
                type="button"
                aria-label="Show assets as a grid"
                aria-pressed={assetBrowserView === "grid"}
                onClick={() => setAssetBrowserView("grid")}
              >
                <LayoutGrid size={16} /> Grid
              </button>
            </div>
          </div>
          <div className="calendar-asset-browser__summary">
            <span>{reservableAssets.length} assets shown</span>
            <strong>{selectedAssets.length} selected</strong>
          </div>
          <div
            className={cx(
              "calendar-asset-browser__results",
              `calendar-asset-browser__results--${assetBrowserView}`,
            )}
            aria-live="polite"
          >
            {loadingAssets ? (
              <div className="calendar-asset-browser__message">
                <LoaderCircle className="spin" size={20} /> Loading assets
              </div>
            ) : assetError ? (
              <div className="calendar-asset-browser__message calendar-asset-browser__message--error">
                Unable to load assets. Change the search or try again.
              </div>
            ) : reservableAssets.length === 0 ? (
              <div className="calendar-asset-browser__message">
                No assets match this search.
              </div>
            ) : (
              reservableAssets.map((asset) => (
                <CalendarAssetOption
                  key={asset.id}
                  asset={asset}
                  selected={selectedAssetIds.has(asset.id)}
                  scheduleSelected={Boolean(selectedRange)}
                  onToggle={toggleAsset}
                />
              ))
            )}
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function CalendarWeek({
  weekStart,
  visibleMonth,
  reservations,
  selectedRange,
  canCreate,
  onPointerDown,
  onPointerEnter,
  onPointerUp,
  onKeyDown,
  onOpenEvent,
}: {
  weekStart: Date;
  visibleMonth: Date;
  reservations: ReservationSummary[];
  selectedRange: { start: Date; end: Date } | null;
  canCreate: boolean;
  onPointerDown: (date: Date, event: PointerEvent<HTMLDivElement>) => void;
  onPointerEnter: (date: Date) => void;
  onPointerUp: (date: Date) => void;
  onKeyDown: (date: Date, event: KeyboardEvent<HTMLButtonElement>) => void;
  onOpenEvent: (reservation: ReservationSummary, anchor: DOMRect) => void;
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
    <div
      className="calendar-week"
      style={style}
      data-week-start={dateKey(weekStart)}
    >
      <div className="calendar-week__days">
        {days.map((date) => {
          const isOutsideMonth = date.getMonth() !== visibleMonth.getMonth();
          const isSelected = selectedRange
            ? date >= selectedRange.start && date <= selectedRange.end
            : false;
          const isFirstOfMonth = date.getDate() === 1;
          return (
            <div
              key={dateKey(date)}
              className={cx(
                "calendar-day",
                isOutsideMonth && "calendar-day--outside",
                isToday(date) && "calendar-day--today",
                isSelected && "calendar-day--selected",
                canCreate && "calendar-day--selectable",
                isFirstOfMonth && "calendar-day--first-of-month",
              )}
              data-date-key={dateKey(date)}
              {...(isFirstOfMonth ? { "data-month-start": dateKey(date) } : {})}
              onPointerDown={(event) => onPointerDown(date, event)}
              onPointerEnter={() => onPointerEnter(date)}
              onPointerUp={() => onPointerUp(date)}
            >
              <div className="calendar-day__header">
                {isFirstOfMonth && (
                  <span className="calendar-day__month-name">
                    {formatShortMonth(date)}
                  </span>
                )}
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
            </div>
          );
        })}
      </div>
      <div className="calendar-week__events">
        {segments.map((segment) => (
          <ReservationBar
            key={`${segment.reservation.id}-${dateKey(weekStart)}`}
            segment={segment}
            onOpen={onOpenEvent}
          />
        ))}
      </div>
    </div>
  );
}

function ReservationBar({
  segment,
  onOpen,
}: {
  segment: CalendarSegment;
  onOpen: (reservation: ReservationSummary, anchor: DOMRect) => void;
}) {
  const { reservation } = segment;
  const style = {
    gridColumn: `${segment.startColumn + 1} / ${segment.endColumn + 2}`,
    gridRow: segment.lane + 1,
  };
  const time = formatTime(new Date(reservation.startAt));
  const label = `${reservation.eventName}, ${reservationStatusLabel[reservation.status]}, ${formatDateTimeRange(reservation.startAt, reservation.endAt)}`;
  return (
    <button
      type="button"
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
      onClick={(event) =>
        onOpen(reservation, event.currentTarget.getBoundingClientRect())
      }
    >
      {!segment.continuesBefore && <time>{time}</time>}
      {segment.continuesBefore && <span aria-hidden>‹</span>}
      <strong>{reservation.eventName}</strong>
      <small>{reservationStatusLabel[reservation.status]}</small>
      {segment.continuesAfter && <span aria-hidden>›</span>}
    </button>
  );
}

function CalendarAssetOption({
  asset,
  selected,
  scheduleSelected,
  onToggle,
}: {
  asset: AssetSummary;
  selected: boolean;
  scheduleSelected: boolean;
  onToggle: (asset: AssetSummary) => void;
}) {
  const fullyBooked = scheduleSelected && asset.availableQuantity <= 0;
  return (
    <button
      type="button"
      className={cx(
        "calendar-asset-option",
        selected && "calendar-asset-option--selected",
        fullyBooked && "calendar-asset-option--unavailable",
      )}
      aria-pressed={selected}
      disabled={fullyBooked}
      onClick={() => onToggle(asset)}
    >
      <AssetPicture src={asset.pictureUrl} name={asset.name} />
      <span>
        <strong>{asset.name}</strong>
        <small>
          {asset.managementArea.name} ·{" "}
          <em
            className={cx(
              fullyBooked && "calendar-asset-option__availability--none",
            )}
          >
            {!scheduleSelected
              ? `${asset.totalQuantity} total`
              : fullyBooked
                ? "Fully booked"
                : `${asset.availableQuantity} of ${asset.totalQuantity}`}
          </em>
        </small>
      </span>
      <i aria-hidden>{selected ? <Check size={14} /> : null}</i>
    </button>
  );
}

function EventActionMenu({
  menuRef,
  menu,
  canApprove,
  canReject,
  canCancel,
  action,
  error,
  onDecision,
  onCancelRequest,
  onClose,
}: {
  menuRef: RefObject<HTMLElement | null>;
  menu: Exclude<EventMenu, null>;
  canApprove: boolean;
  canReject: boolean;
  canCancel: boolean;
  action: "APPROVE" | "REJECT" | "CANCEL" | null;
  error: string;
  onDecision: (decision: "APPROVE" | "REJECT") => void;
  onCancelRequest: () => void;
  onClose: () => void;
}) {
  const { reservation } = menu;
  const requester = reservation.requester.name ?? reservation.requester.email;
  return (
    <aside
      ref={menuRef}
      className={cx(
        "calendar-event-menu",
        `calendar-event-menu--${reservation.status.toLowerCase()}`,
      )}
      style={{ top: menu.top, left: menu.left }}
      role="dialog"
      aria-label={`Actions for ${reservation.eventName}`}
    >
      <header>
        <div>
          <span>{reservationStatusLabel[reservation.status]}</span>
          <strong>{reservation.eventName}</strong>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close event actions"
        >
          <X size={14} />
        </button>
      </header>
      <dl>
        <div>
          <dt>Schedule</dt>
          <dd>{formatDateTimeRange(reservation.startAt, reservation.endAt)}</dd>
        </div>
        <div>
          <dt>Requester</dt>
          <dd>{requester}</dd>
        </div>
        <div>
          <dt>Manifest</dt>
          <dd>
            {reservation.itemCount} asset types · {reservation.totalQuantity}{" "}
            units
          </dd>
        </div>
      </dl>
      {error && (
        <p className="calendar-event-menu__error" role="alert">
          {error}
        </p>
      )}
      <footer>
        <Link
          className="calendar-event-menu__view"
          to={`/reservations/${reservation.id}`}
        >
          <Eye size={14} /> View
        </Link>
        {(canApprove || canReject || canCancel) && <span aria-hidden />}
        {canCancel && (
          <Button
            variant="danger"
            size="sm"
            loading={action === "CANCEL"}
            disabled={Boolean(action)}
            onClick={onCancelRequest}
          >
            <XCircle size={14} /> Cancel
          </Button>
        )}
        {canReject && (
          <Button
            variant="danger"
            size="sm"
            loading={action === "REJECT"}
            disabled={Boolean(action)}
            onClick={() => onDecision("REJECT")}
          >
            <X size={14} /> Reject
          </Button>
        )}
        {canApprove && (
          <Button
            size="sm"
            loading={action === "APPROVE"}
            disabled={Boolean(action)}
            onClick={() => onDecision("APPROVE")}
          >
            <CheckCircle2 size={14} /> Approve
          </Button>
        )}
      </footer>
    </aside>
  );
}

function CancelReservationDialog({
  open,
  eventName,
  onClose,
  onConfirm,
}: {
  open: boolean;
  eventName: string;
  onClose: () => void;
  onConfirm: (reason?: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onConfirm(reason.trim() || undefined);
      onClose();
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      title="Cancel reservation"
      description={`Are you sure you want to cancel "${eventName}"? All allocated assets will be released back into available inventory.`}
      onClose={onClose}
    >
      <form className="dialog-form" onSubmit={(event) => void submit(event)}>
        {Boolean(error) && <ErrorState error={error} />}
        <Field
          label="Reason for cancellation"
          hint="Optional — provide context for managers and requesters"
        >
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="e.g. Event cancelled, date changed, or assets no longer needed"
          />
        </Field>
        <div className="dialog-actions">
          <Button type="button" variant="quiet" onClick={onClose}>
            Keep reservation
          </Button>
          <Button type="submit" variant="danger" loading={loading}>
            <XCircle size={17} />
            Confirm cancellation
          </Button>
        </div>
      </form>
    </Dialog>
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

function MiniCalendarPopover({
  initialMonth,
  onSelectDate,
  onClose,
}: {
  initialMonth: Date;
  onSelectDate: (date: Date) => void;
  onClose: () => void;
}) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(initialMonth));
  const gridStart = useMemo(() => startOfCalendarGrid(viewMonth), [viewMonth]);
  const days = useMemo(
    () => Array.from({ length: 42 }, (_, index) => addDays(gridStart, index)),
    [gridStart],
  );
  const miniDayNames = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  return (
    <div
      className="calendar-mini-popover"
      role="dialog"
      aria-label="Choose date"
    >
      <div className="mini-calendar__header">
        <button
          type="button"
          className="icon-button mini-calendar__nav-btn"
          aria-label="Previous month in picker"
          onClick={() => setViewMonth((current) => addMonths(current, -1))}
        >
          <ChevronLeft size={16} />
        </button>
        <strong>{formatMonth(viewMonth)}</strong>
        <button
          type="button"
          className="icon-button mini-calendar__nav-btn"
          aria-label="Next month in picker"
          onClick={() => setViewMonth((current) => addMonths(current, 1))}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="mini-calendar__weekdays" aria-hidden>
        {miniDayNames.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>

      <div className="mini-calendar__grid">
        {days.map((date) => {
          const isOutside = date.getMonth() !== viewMonth.getMonth();
          const isCurrentDay = isToday(date);
          return (
            <button
              key={dateKey(date)}
              type="button"
              className={cx(
                "mini-calendar__day",
                isOutside && "mini-calendar__day--outside",
                isCurrentDay && "mini-calendar__day--today",
              )}
              aria-label={formatFullDate(date)}
              onClick={() => onSelectDate(date)}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
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

function reservationCreateUrl(
  startDay: Date,
  endDay: Date,
  assetIds: string[] = [],
) {
  const { startAt, endAt } = reservationSchedule(startDay, endDay);
  const query = new URLSearchParams({
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
  });
  assetIds.forEach((assetId) => query.append("assetId", assetId));
  return `/reservations/new?${query.toString()}`;
}

function reservationSchedule(startDay: Date, endDay: Date) {
  const startAt = new Date(startDay);
  startAt.setHours(9, 0, 0, 0);
  const endAt = new Date(endDay);
  endAt.setHours(17, 0, 0, 0);
  return { startAt, endAt };
}

function formatMonth(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(value);
}

function formatShortMonth(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
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

function scrollToElement(
  scrollContainer: HTMLElement,
  targetEl: HTMLElement,
  offset = 40,
  smooth = true,
) {
  const weekEl = targetEl.closest<HTMLElement>(".calendar-week") || targetEl;
  const containerRect = scrollContainer.getBoundingClientRect();
  const targetRect = weekEl.getBoundingClientRect();

  let targetScrollTop = 0;
  if (containerRect.height > 0 && targetRect.height > 0) {
    targetScrollTop =
      scrollContainer.scrollTop + targetRect.top - containerRect.top - offset;
  } else if (typeof weekEl.offsetTop === "number") {
    targetScrollTop = weekEl.offsetTop - offset;
  }

  const finalTop = Math.max(0, Math.round(targetScrollTop));
  if (smooth && typeof scrollContainer.scrollTo === "function") {
    scrollContainer.scrollTo({ top: finalTop, behavior: "smooth" });
  } else {
    scrollContainer.scrollTop = finalTop;
  }
}
