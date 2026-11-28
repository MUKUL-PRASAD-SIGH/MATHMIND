import { describe, expect, it } from 'vitest'
import { pageToScreen, screenToPage, zoomAt, type View } from './viewport'

const size = { w: 800, h: 1131 }

describe('viewport transform', () => {
  const views: View[] = [
    { zoom: 1, scrollX: 0, scrollY: 0 },
    { zoom: 2.5, scrollX: 120, scrollY: 900 },
    { zoom: 0.5, scrollX: -40, scrollY: 10 },
  ]

  it.each(views)('screen ↔ page is invertible at %o', (view) => {
    for (const p of [
      [0, 0],
      [0.25, 0.75],
      [1, 1],
    ]) {
      const back = screenToPage(pageToScreen(p, view, size), view, size)
      expect(back[0]).toBeCloseTo(p[0], 10)
      expect(back[1]).toBeCloseTo(p[1], 10)
    }
    const s = { x: 333, y: 444 }
    const round = pageToScreen(screenToPage(s, view, size), view, size)
    expect(round.x).toBeCloseTo(s.x, 10)
    expect(round.y).toBeCloseTo(s.y, 10)
  })

  it('zoomAt keeps the focal point fixed on screen', () => {
    const view = { zoom: 1, scrollX: 50, scrollY: 200 }
    const focal = { x: 300, y: 400 }
    const before = screenToPage(focal, view, size)
    const after = zoomAt(view, focal, 2)
    expect(after.zoom).toBe(2)
    const p = screenToPage(focal, after, size)
    expect(p[0]).toBeCloseTo(before[0], 10)
    expect(p[1]).toBeCloseTo(before[1], 10)
  })

  it('clamps zoom between 0.5 and 4', () => {
    expect(zoomAt({ zoom: 3, scrollX: 0, scrollY: 0 }, { x: 0, y: 0 }, 10).zoom).toBe(4)
    expect(zoomAt({ zoom: 1, scrollX: 0, scrollY: 0 }, { x: 0, y: 0 }, 0.01).zoom).toBe(0.5)
  })
})
