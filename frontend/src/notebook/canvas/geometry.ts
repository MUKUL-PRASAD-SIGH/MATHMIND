/** Pure geometry on page-normalized coordinates (0..1 on each axis). */
import type { BBox, Point } from '../model'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Screen (client) position → page-normalized point, clamped to the page. */
export function normalizePoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): Point {
  if (rect.width <= 0 || rect.height <= 0) return [0, 0]
  return [clamp01((clientX - rect.left) / rect.width), clamp01((clientY - rect.top) / rect.height)]
}

export function computeBBox(points: readonly (readonly number[])[]): BBox {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export type PathCommand =
  | { op: 'M'; p: Point }
  | { op: 'Q'; c: Point; p: Point }
  | { op: 'L'; p: Point }

const mid = (a: readonly number[], b: readonly number[]): Point => [
  (a[0] + b[0]) / 2,
  (a[1] + b[1]) / 2,
]

/**
 * Smooth a polyline with quadratic curves through segment midpoints: each input point
 * becomes a control point, and the curve passes through the midpoints between them.
 */
export function smoothPath(points: readonly (readonly number[])[]): PathCommand[] {
  if (points.length === 0) return []
  const first: Point = [points[0][0], points[0][1]]
  if (points.length < 3) {
    return points.length === 1
      ? [{ op: 'M', p: first }]
      : [
          { op: 'M', p: first },
          { op: 'L', p: [points[1][0], points[1][1]] },
        ]
  }
  const cmds: PathCommand[] = [
    { op: 'M', p: first },
    { op: 'L', p: mid(points[0], points[1]) },
  ]
  for (let i = 1; i < points.length - 1; i++) {
    cmds.push({ op: 'Q', c: [points[i][0], points[i][1]], p: mid(points[i], points[i + 1]) })
  }
  const last = points[points.length - 1]
  cmds.push({ op: 'L', p: [last[0], last[1]] })
  return cmds
}

/** Line width for a pressure sample: `base * (0.5 + pressure)`, or constant without pressure. */
export function pressureWidth(base: number, pressure: number | null | undefined): number {
  return pressure == null ? base : base * (0.5 + pressure)
}
