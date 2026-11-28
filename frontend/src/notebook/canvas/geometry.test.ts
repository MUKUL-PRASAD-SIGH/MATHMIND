import { describe, expect, it } from 'vitest'
import {
  computeBBox,
  distanceToSegment,
  isStrokeSelected,
  normalizePoint,
  pointInPolygon,
  pressureWidth,
  smoothPath,
  strokeHit,
  unionBBox,
} from './geometry'

describe('pointInPolygon', () => {
  const square = [
    [0.2, 0.2],
    [0.6, 0.2],
    [0.6, 0.6],
    [0.2, 0.6],
  ]
  // A "C" shape: the notch between x 0.3..0.6, y 0.3..0.5 is outside.
  const cShape = [
    [0.2, 0.2],
    [0.6, 0.2],
    [0.6, 0.3],
    [0.3, 0.3],
    [0.3, 0.5],
    [0.6, 0.5],
    [0.6, 0.6],
    [0.2, 0.6],
  ]

  it('detects points inside and outside a convex polygon', () => {
    expect(pointInPolygon([0.4, 0.4], square)).toBe(true)
    expect(pointInPolygon([0.1, 0.4], square)).toBe(false)
    expect(pointInPolygon([0.4, 0.7], square)).toBe(false)
  })

  it('handles concave polygons', () => {
    expect(pointInPolygon([0.25, 0.4], cShape)).toBe(true)
    expect(pointInPolygon([0.45, 0.4], cShape)).toBe(false)
    expect(pointInPolygon([0.45, 0.25], cShape)).toBe(true)
  })
})

describe('selection by threshold', () => {
  const lasso = [
    [0, 0],
    [0.5, 0],
    [0.5, 1],
    [0, 1],
  ]
  const stroke = (xs: number[]) => {
    const points = xs.map((x) => [x, 0.5])
    return { points, bbox: computeBBox(points) }
  }

  it('selects when the bbox centre is inside', () => {
    expect(isStrokeSelected(stroke([0.1, 0.2, 0.3]), lasso)).toBe(true)
  })

  it('selects when at least 60% of the points are inside', () => {
    // centre 0.55 is outside, 3 of 5 points (60%) inside
    expect(isStrokeSelected(stroke([0.1, 0.2, 0.3, 0.9, 1.0]), lasso)).toBe(true)
    // centre 0.55 outside, 2 of 5 points (40%) inside
    expect(isStrokeSelected(stroke([0.1, 0.45, 0.7, 0.8, 1.0]), lasso)).toBe(false)
  })

  it('ignores degenerate lassos', () => {
    expect(isStrokeSelected(stroke([0.1]), lasso.slice(0, 2))).toBe(false)
  })

  it('unions bounding boxes', () => {
    expect(
      unionBBox([
        { x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
        { x: 0.3, y: 0.05, w: 0.1, h: 0.1 },
      ]),
    ).toEqual({ x: 0.1, y: 0.05, w: expect.closeTo(0.3), h: expect.closeTo(0.15) })
    expect(unionBBox([])).toBeNull()
  })
})

describe('normalizePoint', () => {
  const rect = { left: 100, top: 50, width: 200, height: 400 }

  it('maps client coordinates to 0..1 page coordinates', () => {
    expect(normalizePoint(100, 50, rect)).toEqual([0, 0])
    expect(normalizePoint(200, 250, rect)).toEqual([0.5, 0.5])
    expect(normalizePoint(300, 450, rect)).toEqual([1, 1])
  })

  it('clamps points outside the page and survives an empty rect', () => {
    expect(normalizePoint(0, 1000, rect)).toEqual([0, 1])
    expect(normalizePoint(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual([0, 0])
  })
})

describe('computeBBox', () => {
  it('returns the tight bounding box', () => {
    expect(
      computeBBox([
        [0.2, 0.5],
        [0.1, 0.7],
        [0.4, 0.6],
      ]),
    ).toEqual({ x: 0.1, y: 0.5, w: expect.closeTo(0.3), h: expect.closeTo(0.2) })
  })

  it('handles single points and empty input', () => {
    expect(computeBBox([[0.3, 0.3]])).toEqual({ x: 0.3, y: 0.3, w: 0, h: 0 })
    expect(computeBBox([])).toEqual({ x: 0, y: 0, w: 0, h: 0 })
  })
})

describe('smoothPath', () => {
  it('passes through midpoints using the samples as control points', () => {
    const cmds = smoothPath([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ])
    expect(cmds).toEqual([
      { op: 'M', p: [0, 0] },
      { op: 'L', p: [0.5, 0] },
      { op: 'Q', c: [1, 0], p: [1, 0.5] },
      { op: 'Q', c: [1, 1], p: [0.5, 1] },
      { op: 'L', p: [0, 1] },
    ])
  })

  it('starts at the first point and ends at the last point', () => {
    const pts: [number, number][] = Array.from({ length: 10 }, (_, i) => [i / 10, (i * i) / 100])
    const cmds = smoothPath(pts)
    expect(cmds[0]).toEqual({ op: 'M', p: pts[0] })
    expect(cmds[cmds.length - 1]).toEqual({ op: 'L', p: pts[9] })
    expect(cmds.filter((c) => c.op === 'Q')).toHaveLength(8)
  })

  it('degrades to a dot or a line for short input', () => {
    expect(smoothPath([])).toEqual([])
    expect(smoothPath([[0.1, 0.1]])).toEqual([{ op: 'M', p: [0.1, 0.1] }])
    expect(
      smoothPath([
        [0, 0],
        [1, 1],
      ]),
    ).toEqual([
      { op: 'M', p: [0, 0] },
      { op: 'L', p: [1, 1] },
    ])
  })
})

describe('eraser hit-test', () => {
  const horizontal = {
    points: [
      [0.1, 0.5],
      [0.5, 0.5],
    ],
    bbox: { x: 0.1, y: 0.5, w: 0.4, h: 0 },
  }

  it('measures distance to a segment, clamped to its ends', () => {
    expect(distanceToSegment([0.3, 0.6], [0.1, 0.5], [0.5, 0.5])).toBeCloseTo(0.1)
    expect(distanceToSegment([0.0, 0.5], [0.1, 0.5], [0.5, 0.5])).toBeCloseTo(0.1)
    expect(distanceToSegment([0.3, 0.3], [0.3, 0.3], [0.3, 0.3])).toBe(0)
    expect(distanceToSegment([0, 0.1], [0, 0], [1, 0], 2)).toBeCloseTo(0.2)
  })

  it('hits a stroke the eraser crosses', () => {
    const vertical = [
      [0.3, 0.3],
      [0.3, 0.7],
    ]
    expect(strokeHit(horizontal, vertical, 0.01)).toBe(true)
  })

  it('hits when an eraser sample lands near the stroke', () => {
    expect(strokeHit(horizontal, [[0.3, 0.505]], 0.01)).toBe(true)
  })

  it('misses strokes outside the radius or the bbox', () => {
    expect(strokeHit(horizontal, [[0.3, 0.6]], 0.01)).toBe(false)
    expect(strokeHit(horizontal, [[0.9, 0.9]], 0.05)).toBe(false)
    expect(strokeHit(horizontal, [], 0.05)).toBe(false)
  })

  it('hits single-point strokes (dots)', () => {
    const dot = { points: [[0.2, 0.2]], bbox: { x: 0.2, y: 0.2, w: 0, h: 0 } }
    expect(strokeHit(dot, [[0.205, 0.2]], 0.01)).toBe(true)
  })
})

describe('pressureWidth', () => {
  it('scales with pressure and is constant without it', () => {
    expect(pressureWidth(2, 0.5)).toBe(2)
    expect(pressureWidth(2, 1)).toBe(3)
    expect(pressureWidth(2, null)).toBe(2)
  })
})
