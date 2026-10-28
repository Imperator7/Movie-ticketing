/** Zoom state and pinch math for the seat map. Pure, so clamping and anchoring are unit-tested. */

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2.5;
export const ZOOM_STEP = 1.25;
/** On a narrow screen the map starts at least this big, so a 32 px seat stays above a 24 px tap target. */
export const MIN_DEFAULT_ZOOM = 0.8;

export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)) * 100) / 100;
}

export type ZoomAction =
  { type: "in" } | { type: "out" } | { type: "reset"; to: number } | { type: "set"; value: number };

export function zoomReducer(state: number, action: ZoomAction): number {
  switch (action.type) {
    case "in":
      return clampZoom(state * ZOOM_STEP);
    case "out":
      return clampZoom(state / ZOOM_STEP);
    case "reset":
      return clampZoom(action.to);
    case "set":
      return clampZoom(action.value);
  }
}

/** The zoom the map starts with: 1, or a bit smaller on a narrow screen (never below 0.8). */
export function defaultZoom(containerWidth: number, contentWidth: number): number {
  if (containerWidth <= 0 || contentWidth <= 0) return 1;
  return clampZoom(Math.min(1, Math.max(MIN_DEFAULT_ZOOM, containerWidth / contentWidth)));
}

/** Scale after a pinch: the start scale times how much the fingers moved apart. */
export function pinchScale(startScale: number, startDistance: number, distance: number): number {
  if (startDistance <= 0) return clampZoom(startScale);
  return clampZoom(startScale * (distance / startDistance));
}

/**
 * Scroll offset that keeps the content point under `anchor` (a position inside the viewport)
 * where it is while the scale changes from `from` to `to`.
 */
export function anchoredScroll(scroll: number, anchor: number, from: number, to: number): number {
  if (from <= 0) return scroll;
  return Math.max(0, ((scroll + anchor) / from) * to - anchor);
}

export function distanceBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
