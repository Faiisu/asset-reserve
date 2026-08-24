import { Table2 } from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
} from "react";
import { niceCeil, roundedTopRectPath } from "../lib/chartGeometry";
import { Button, EmptyState, cx } from "./ui";
import type { AssetReservationCount, StatisticsPeriod } from "../types";

const PERIODS: Array<{ value: StatisticsPeriod; label: string }> = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

const BAR_COLOR = "var(--chart-checked-out)";

const SLOT_W = 56;
const PADDING_LEFT = 44;
const PADDING_RIGHT = 16;
const PADDING_TOP = 10;
const PLOT_H = 200;
const AXIS_H = 84;
const VIEW_H = PADDING_TOP + PLOT_H + AXIS_H;
const BASELINE_Y = PADDING_TOP + PLOT_H;
const MAX_BAR_WIDTH = 28;

type Hover = { asset: AssetReservationCount; left: number; top: number };

export function AssetReservationChart({
  data,
  period,
  onPeriodChange,
}: {
  data: AssetReservationCount[];
  period: StatisticsPeriod;
  onPeriodChange: (period: StatisticsPeriod) => void;
}) {
  const [showTable, setShowTable] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const yMax = useMemo(
    () => niceCeil(Math.max(...data.map((a) => a.reservedCount), 0)),
    [data],
  );
  const gridTicks = useMemo(
    () => Array.from(new Set([0, Math.round(yMax / 2), yMax])),
    [yMax],
  );

  function scaleY(value: number) {
    return yMax === 0 ? 0 : (value / yMax) * PLOT_H;
  }

  function handleHover(
    asset: AssetReservationCount,
    event: MouseEvent<SVGGElement> | FocusEvent<SVGGElement>,
  ) {
    const containerRect = containerRef.current?.getBoundingClientRect();
    const targetRect = event.currentTarget.getBoundingClientRect();
    if (!containerRect) return;
    setHover({
      asset,
      left:
        targetRect.left -
        containerRect.left +
        containerRef.current!.scrollLeft +
        targetRect.width / 2,
      top: targetRect.top - containerRect.top,
    });
  }

  const svgWidth =
    PADDING_LEFT + PADDING_RIGHT + SLOT_W * Math.max(data.length, 1);

  return (
    <div className="asset-reservation-chart">
      <div className="activity-chart__toolbar">
        <div
          className="segmented"
          role="tablist"
          aria-label="Statistics period"
        >
          {PERIODS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={period === option.value}
              className={cx(period === option.value && "segmented--active")}
              onClick={() => onPeriodChange(option.value)}
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

      {data.length === 0 ? (
        <EmptyState
          title="No assets to chart"
          description="No assets are visible to your account yet."
        />
      ) : showTable ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>P/N</th>
                <th>Management area</th>
                <th>Reserved</th>
              </tr>
            </thead>
            <tbody>
              {data.map((asset) => (
                <tr key={asset.assetId}>
                  <td className="table-primary">{asset.name}</td>
                  <td className="mono">{asset.partNumber || "—"}</td>
                  <td className="table-secondary">
                    {asset.managementArea.name}
                  </td>
                  <td className="mono table-primary">{asset.reservedCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="asset-reservation-chart__scroll" ref={containerRef}>
          <svg
            className="asset-reservation-chart__svg"
            width={svgWidth}
            height={VIEW_H}
            role="img"
            aria-label={`Reservation requests per asset, ${period}`}
          >
            {gridTicks.map((tick) => {
              const y = BASELINE_Y - scaleY(tick);
              return (
                <g key={tick}>
                  <line
                    x1={PADDING_LEFT}
                    x2={svgWidth - PADDING_RIGHT}
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

            {data.map((asset, index) => {
              const slotX = PADDING_LEFT + index * SLOT_W;
              const barWidth = Math.min(MAX_BAR_WIDTH, SLOT_W - 8);
              const barX = slotX + (SLOT_W - barWidth) / 2;
              const height = Math.max(
                scaleY(asset.reservedCount),
                asset.reservedCount > 0 ? 1 : 0,
              );
              const label = asset.partNumber || asset.name;
              const labelX = slotX + SLOT_W / 2;
              const labelY = BASELINE_Y + 14;

              return (
                <g
                  key={asset.assetId}
                  className="activity-chart__bar-group"
                  tabIndex={0}
                  role="button"
                  aria-label={`${asset.name}: ${asset.reservedCount} reservation requests`}
                  onMouseEnter={(event) => handleHover(asset, event)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={(event) => handleHover(asset, event)}
                  onBlur={() => setHover(null)}
                >
                  <rect
                    x={slotX}
                    y={PADDING_TOP}
                    width={SLOT_W}
                    height={PLOT_H}
                    fill="transparent"
                  />
                  {height > 0 && (
                    <path
                      d={roundedTopRectPath(
                        barX,
                        BASELINE_Y - height,
                        barWidth,
                        height,
                        4,
                      )}
                      fill={BAR_COLOR}
                    />
                  )}
                  <text
                    x={labelX}
                    y={labelY}
                    textAnchor="end"
                    className="asset-reservation-chart__axis-label"
                    transform={`rotate(-50 ${labelX} ${labelY})`}
                  >
                    {label}
                  </text>
                </g>
              );
            })}

            <line
              x1={PADDING_LEFT}
              x2={svgWidth - PADDING_RIGHT}
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
              <strong>{hover.asset.name}</strong>
              <div className="activity-chart__tooltip-row">
                <span>P/N</span>
                <b>{hover.asset.partNumber || "—"}</b>
              </div>
              <div className="activity-chart__tooltip-row">
                <span>Area</span>
                <b>{hover.asset.managementArea.name}</b>
              </div>
              <div className="activity-chart__tooltip-row activity-chart__tooltip-row--total">
                <span>Reserved</span>
                <b>{hover.asset.reservedCount}</b>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
