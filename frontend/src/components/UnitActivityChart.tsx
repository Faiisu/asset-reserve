import { Table2 } from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
} from "react";
import {
  buildActivityBuckets,
  type ActivityBucket,
  type ActivityGranularity,
} from "../lib/activityBuckets";
import { Button, EmptyState, cx } from "./ui";
import type { AssetUnitHistoryEvent } from "../types";

const GRANULARITIES: Array<{ value: ActivityGranularity; label: string }> = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

const CATEGORIES = [
  {
    key: "checkedOut",
    label: "Checked out",
    color: "var(--chart-checked-out)",
  },
  { key: "returned", label: "Returned", color: "var(--chart-returned)" },
  { key: "other", label: "Other activity", color: "var(--chart-other)" },
] as const;

const VIEW_W = 960;
const PADDING_LEFT = 40;
const PADDING_RIGHT = 8;
const PADDING_TOP = 10;
const PLOT_H = 180;
const AXIS_H = 28;
const VIEW_H = PADDING_TOP + PLOT_H + AXIS_H;
const BASELINE_Y = PADDING_TOP + PLOT_H;
const MAX_BAR_WIDTH = 24;
const SEGMENT_GAP = 2;

function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  for (const step of steps) {
    if (value <= step) return step;
  }
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

/** A rect path with only its top two corners rounded -- the mark spec calls
 * for the bar's data-end (away from the baseline) rounded and the baseline
 * end square; SVG <rect rx> can't round only two corners. */
function roundedTopRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h} L${x},${y + radius} Q${x},${y} ${x + radius},${y} L${x + w - radius},${y} Q${x + w},${y} ${x + w},${y + radius} L${x + w},${y + h} Z`;
}

type Hover = { bucket: ActivityBucket; left: number; top: number };

export function UnitActivityChart({
  events,
}: {
  events: AssetUnitHistoryEvent[];
}) {
  const [granularity, setGranularity] = useState<ActivityGranularity>("month");
  const [showTable, setShowTable] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const buckets = useMemo(
    () => buildActivityBuckets(events, granularity),
    [events, granularity],
  );
  const yMax = useMemo(
    () => niceCeil(Math.max(...buckets.map((b) => b.total), 0)),
    [buckets],
  );
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 8));
  const slotWidth =
    (VIEW_W - PADDING_LEFT - PADDING_RIGHT) / Math.max(buckets.length, 1);
  const barWidth = Math.min(MAX_BAR_WIDTH, Math.max(slotWidth - 4, 2));

  function scaleY(value: number) {
    return yMax === 0 ? 0 : (value / yMax) * PLOT_H;
  }

  function handleHover(
    bucket: ActivityBucket,
    event: MouseEvent<SVGGElement> | FocusEvent<SVGGElement>,
  ) {
    const containerRect = containerRef.current?.getBoundingClientRect();
    const targetRect = event.currentTarget.getBoundingClientRect();
    if (!containerRect) return;
    setHover({
      bucket,
      left: targetRect.left - containerRect.left + targetRect.width / 2,
      top: targetRect.top - containerRect.top,
    });
  }

  if (events.length === 0) {
    return (
      <EmptyState
        title="No activity to chart"
        description="This unit has no recorded events yet."
      />
    );
  }

  const gridTicks = Array.from(new Set([0, Math.round(yMax / 2), yMax]));

  return (
    <div className="activity-chart">
      <div className="activity-chart__toolbar">
        <div
          className="segmented"
          role="tablist"
          aria-label="Chart granularity"
        >
          {GRANULARITIES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={granularity === option.value}
              className={cx(
                granularity === option.value && "segmented--active",
              )}
              onClick={() => setGranularity(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <Button
          variant="quiet"
          size="sm"
          onClick={() => setShowTable((current) => !current)}
          aria-pressed={showTable}
        >
          <Table2 size={14} />
          {showTable ? "Chart view" : "Table view"}
        </Button>
      </div>

      {showTable ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Period</th>
                {CATEGORIES.map((category) => (
                  <th key={category.key}>{category.label}</th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((bucket) => (
                <tr key={bucket.key}>
                  <td>{bucket.fullLabel}</td>
                  {CATEGORIES.map((category) => (
                    <td key={category.key} className="mono">
                      {bucket[category.key]}
                    </td>
                  ))}
                  <td className="mono table-primary">{bucket.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="activity-chart__plot" ref={containerRef}>
          <svg
            className="activity-chart__svg"
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            role="img"
            aria-label={`Unit activity by ${granularity}, ${buckets.length} periods`}
          >
            {gridTicks.map((tick) => {
              const y = BASELINE_Y - scaleY(tick);
              return (
                <g key={tick}>
                  <line
                    x1={PADDING_LEFT}
                    x2={VIEW_W - PADDING_RIGHT}
                    y1={y}
                    y2={y}
                    className="activity-chart__gridline"
                  />
                  <text
                    x={PADDING_LEFT - 8}
                    y={y}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="activity-chart__tick-label"
                  >
                    {tick.toLocaleString()}
                  </text>
                </g>
              );
            })}

            {buckets.map((bucket, index) => {
              const slotX = PADDING_LEFT + index * slotWidth;
              const barX = slotX + (slotWidth - barWidth) / 2;
              const segments = CATEGORIES.map((category) => ({
                ...category,
                value: bucket[category.key],
              })).filter((segment) => segment.value > 0);

              let cursor = BASELINE_Y;
              const rects = segments.map((segment, segmentIndex) => {
                const isTop = segmentIndex === segments.length - 1;
                const rawHeight = Math.max(scaleY(segment.value), 1);
                const segTop = cursor - rawHeight;
                const gap = isTop ? 0 : SEGMENT_GAP;
                const visibleTop = segTop + gap;
                const visibleHeight = Math.max(rawHeight - gap, 1);
                cursor = segTop;
                return {
                  ...segment,
                  x: barX,
                  y: visibleTop,
                  width: barWidth,
                  height: visibleHeight,
                  isTop,
                };
              });

              const showLabel =
                index % labelEvery === 0 || index === buckets.length - 1;

              return (
                <g
                  key={bucket.key}
                  className="activity-chart__bar-group"
                  tabIndex={0}
                  role="button"
                  aria-label={`${bucket.fullLabel}: ${bucket.total} events`}
                  onMouseEnter={(event) => handleHover(bucket, event)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={(event) => handleHover(bucket, event)}
                  onBlur={() => setHover(null)}
                >
                  <rect
                    x={slotX}
                    y={PADDING_TOP}
                    width={slotWidth}
                    height={PLOT_H}
                    fill="transparent"
                  />
                  {rects.map((rect) =>
                    rect.isTop ? (
                      <path
                        key={rect.key}
                        d={roundedTopRectPath(
                          rect.x,
                          rect.y,
                          rect.width,
                          rect.height,
                          4,
                        )}
                        fill={rect.color}
                      />
                    ) : (
                      <rect
                        key={rect.key}
                        x={rect.x}
                        y={rect.y}
                        width={rect.width}
                        height={rect.height}
                        fill={rect.color}
                      />
                    ),
                  )}
                  {showLabel && (
                    <text
                      x={barX + barWidth / 2}
                      y={VIEW_H - 8}
                      textAnchor="middle"
                      className="activity-chart__axis-label"
                    >
                      {bucket.label}
                    </text>
                  )}
                </g>
              );
            })}

            <line
              x1={PADDING_LEFT}
              x2={VIEW_W - PADDING_RIGHT}
              y1={BASELINE_Y}
              y2={BASELINE_Y}
              className="activity-chart__baseline"
            />
          </svg>

          {hover && (
            <div
              className="activity-chart__tooltip"
              style={{ left: hover.left, top: hover.top }}
              role="tooltip"
            >
              <strong>{hover.bucket.fullLabel}</strong>
              {CATEGORIES.map((category) => (
                <div key={category.key} className="activity-chart__tooltip-row">
                  <span>
                    <i style={{ background: category.color }} />
                    {category.label}
                  </span>
                  <b>{hover.bucket[category.key]}</b>
                </div>
              ))}
              <div className="activity-chart__tooltip-row activity-chart__tooltip-row--total">
                <span>Total</span>
                <b>{hover.bucket.total}</b>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="activity-chart__legend">
        {CATEGORIES.map((category) => (
          <span key={category.key}>
            <i style={{ background: category.color }} />
            {category.label}
          </span>
        ))}
      </div>
    </div>
  );
}
