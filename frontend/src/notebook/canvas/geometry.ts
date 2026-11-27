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
  { op: 'M'; p: Point } | { op: 'Q'; c: Point; p: Point } | { op: 'L'; p: Point }

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

// --- Eraser ----------------------------------------------------------------------------

/**
 * Distance from p to segment ab. `aspect` (height / width) makes y comparable to x, so
 * distances are measured in page-width units on a non-square page.
 */
export function distanceToSegment(
  p: readonly number[],
  a: readonly number[],
  b: readonly number[],
  aspect = 1,
): number {
  const px = p[0]
  const py = p[1] * aspect
  const ax = a[0]
  const ay = a[1] * aspect
  const bx = b[0]
  const by = b[1] * aspect
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

export function bboxesIntersect(a: BBox, b: BBox, pad = 0): boolean {
  return (
    a.x - pad <= b.x + b.w &&
    b.x - pad <= a.x + a.w &&
    a.y - pad <= b.y + b.h &&
    b.y - pad <= a.y + a.h
  )
}

interface HitStroke {
  points: readonly (readonly number[])[]
  bbox: BBox
}

const cross = (o: readonly number[], a: readonly number[], b: readonly number[]) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

/** Distance between segments ab and cd (0 when they cross). */
export function segmentDistance(
  a: readonly number[],
  b: readonly number[],
  c: readonly number[],
  d: readonly number[],
  aspect = 1,
): number {
  const d1 = cross(c, d, a)
  const d2 = cross(c, d, b)
  const d3 = cross(a, b, c)
  const d4 = cross(a, b, d)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return 0
  }
  return Math.min(
    distanceToSegment(a, c, d, aspect),
    distanceToSegment(b, c, d, aspect),
    distanceToSegment(c, a, b, aspect),
    distanceToSegment(d, a, b, aspect),
  )
}

const segments = (pts: readonly (readonly number[])[]) =>
  pts.length === 1 ? [[pts[0], pts[0]]] : pts.slice(1).map((p, i) => [pts[i], p])

/**
 * Stroke eraser hit-test: cheap bbox rejection first, then the distance between the
 * eraser path and the stroke's segments. `radius` is in page-width units.
 */
export function strokeHit(
  stroke: HitStroke,
  eraserPath: readonly (readonly number[])[],
  radius: number,
  aspect = 1,
): boolean {
  if (eraserPath.length === 0) return false
  if (!bboxesIntersect(stroke.bbox, computeBBox(eraserPath), radius)) return false
  const strokeSegs = segments(stroke.points)
  for (const [a, b] of segments(eraserPath)) {
    for (const [c, d] of strokeSegs) if (segmentDistance(a, b, c, d, aspect) <= radius) return true
  }
  return false
}

// --- Selection -------------------------------------------------------------------------

/** Ray-casting point-in-polygon (the polygon is implicitly closed). */
export function pointInPolygon(
  p: readonly number[],
  poly: readonly (readonly number[])[],
): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

export const bboxCenter = (b: BBox): Point => [b.x + b.w / 2, b.y + b.h / 2]

/** Selected when its bbox centre is inside the polygon, or ≥ `threshold` of its points are. */
export function isStrokeSelected(
  stroke: HitStroke,
  poly: readonly (readonly number[])[],
  threshold = 0.6,
): boolean {
  if (poly.length < 3) return false
  if (pointInPolygon(bboxCenter(stroke.bbox), poly)) return true
  const inside = stroke.points.filter((p) => pointInPolygon(p, poly)).length
  return inside / stroke.points.length >= threshold
}

export function unionBBox(boxes: readonly BBox[]): BBox | null {
  if (boxes.length === 0) return null
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  const right = Math.max(...boxes.map((b) => b.x + b.w))
  const bottom = Math.max(...boxes.map((b) => b.y + b.h))
  return { x, y, w: right - x, h: bottom - y }
}
