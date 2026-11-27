/**
 * Zoom/pan maths. The page content is drawn at `size` CSS px, scaled by `zoom` from the
 * top-left corner and scrolled by (`scrollX`, `scrollY`) inside the viewport. Stored
 * coordinates stay page-normalized; only this boundary knows about screen px.
 */

export interface View {
  zoom: number
  scrollX: number
  scrollY: number
}

export interface Size {
  w: number
  h: number
}

export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 4

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

/** Viewport-relative screen point → page-normalized point. */
export function screenToPage(
  pt: { x: number; y: number },
  view: View,
  size: Size,
): [number, number] {
  return [
    (pt.x + view.scrollX) / (view.zoom * size.w),
    (pt.y + view.scrollY) / (view.zoom * size.h),
  ]
}

/** Page-normalized point → viewport-relative screen point. */
export function pageToScreen(
  p: readonly number[],
  view: View,
  size: Size,
): { x: number; y: number } {
  return {
    x: p[0] * view.zoom * size.w - view.scrollX,
    y: p[1] * view.zoom * size.h - view.scrollY,
  }
}

/** Zoom by `factor` keeping the page point under `focal` (viewport px) fixed on screen. */
export function zoomAt(view: View, focal: { x: number; y: number }, factor: number): View {
  const zoom = clampZoom(view.zoom * factor)
  const k = zoom / view.zoom
  return {
    zoom,
    scrollX: (focal.x + view.scrollX) * k - focal.x,
    scrollY: (focal.y + view.scrollY) * k - focal.y,
  }
}
