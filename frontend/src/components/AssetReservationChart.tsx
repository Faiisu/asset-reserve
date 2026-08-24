import {
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
} from "react";
import { niceCeil, roundedTopRectPath } from "../lib/chartGeometry";
import type { AssetReservationCount } from "../types";

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
/** Rotated axis labels run down-left from the baseline, so their vertical
 * reach is sin(50 deg) * text width. Past this many 9px monospace characters
 * they would spill out of AXIS_H and get cropped by the SVG box, so they are
 * truncated here and the full value is kept in the tooltip and table view. */
const MAX_LABEL_CHARS = 13;
/** Keeps the (upward-opening) tooltip from being pushed above the card when a
 * tall bar is hovered -- roughly its own height plus the arrow gap. */
const TOOLTIP_MIN_TOP = 104;

type Hover = { asset: AssetReservationCount; left: number; top: number };

function truncate(label: string) {
  return label.length > MAX_LABEL_CHARS
    ? `${label.slice(0, MAX_LABEL_CHARS - 1)}…`
    : label;
}

export function AssetReservationChart({
  data,
  showTable,
}: {
  data: AssetReservationCount[];
  showTable: boolean;
}) {
  const [hover, setHover] = useState<Hover | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const yMax = useMemo(
    () => niceCeil(Math.max(...data.map((a) => a.reservedCount), 0)),
    [data],
  );
  // Only show the midpoint gridline when it lands on a whole number -- a
  // "2.5" tick reads as noise on a count axis.
  const gridTicks = useMemo(
    () => (yMax % 2 === 0 && yMax > 0 ? [0, yMax / 2, yMax] : [0, yMax]),
    [yMax],
  );

  function scaleY(value: number) {
    return yMax === 0 ? 0 : (value / yMax) * PLOT_H;
  }

  function handleHover(
    asset: AssetReservationCount,
    event: MouseEvent<SVGGElement> | FocusEvent<SVGGElement>,
  ) {
    const wrapperRect = wrapperRef.current?.getBoundingClientRect();
    if (!wrapperRect) return;
    const targetRect = event.currentTarget.getBoundingClientRect();
    setHover({
      asset,
      // Both rects are viewport-relative, so the scroll offset is already
      // accounted for -- the tooltip lives outside the scrolling element.
      left: targetRect.left - wrapperRect.left + targetRect.width / 2,
      top: Math.max(targetRect.top - wrapperRect.top, TOOLTIP_MIN_TOP),
    });
  }

  if (showTable) {
    return (
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
                <td className="table-secondary">{asset.managementArea.name}</td>
                <td className="mono table-primary">{asset.reservedCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const svgWidth =
    PADDING_LEFT + PADDING_RIGHT + SLOT_W * Math.max(data.length, 1);

  return (
    <div className="asset-reservation-chart" ref={wrapperRef}>
      <div className="asset-reservation-chart__scroll">
        <svg
          className="asset-reservation-chart__svg"
          width={svgWidth}
          height={VIEW_H}
          role="img"
          aria-label={`Reservation count per asset across ${data.length} assets`}
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
            const height =
              asset.reservedCount > 0
                ? Math.max(scaleY(asset.reservedCount), 1)
                : 0;
            const label = asset.partNumber || asset.name;
            const labelX = slotX + SLOT_W / 2;
            const labelY = BASELINE_Y + 14;

            return (
              <g
                key={asset.assetId}
                className="activity-chart__bar-group"
                tabIndex={0}
                role="button"
                aria-label={`${asset.name}: ${asset.reservedCount} reservations`}
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
                  {truncate(label)}
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
      </div>

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
  );
}
