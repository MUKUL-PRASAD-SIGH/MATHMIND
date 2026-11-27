import { describe, expect, it } from 'vitest'
import { computeBBox, normalizePoint, pressureWidth, smoothPath } from './geometry'

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

describe('pressureWidth', () => {
  it('scales with pressure and is constant without it', () => {
    expect(pressureWidth(2, 0.5)).toBe(2)
    expect(pressureWidth(2, 1)).toBe(3)
    expect(pressureWidth(2, null)).toBe(2)
  })
})
