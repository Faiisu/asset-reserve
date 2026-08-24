/** Rounds a magnitude up to a clean axis-tick value (1, 2, 5, 10, 20, 25, 50, 100, ...). */
export function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  for (const step of steps) {
    if (value <= step) return step;
  }
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

/** A rect path with only its top two corners rounded -- the dataviz mark spec calls
 * for the bar's data-end (away from the baseline) rounded and the baseline end
 * square; SVG <rect rx> can't round only two corners. */
export function roundedTopRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h} L${x},${y + radius} Q${x},${y} ${x + radius},${y} L${x + w - radius},${y} Q${x + w},${y} ${x + w},${y + radius} L${x + w},${y + h} Z`;
}
