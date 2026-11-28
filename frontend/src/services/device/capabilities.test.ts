import { describe, expect, it } from 'vitest'
import { deriveMode, detectCapabilities, screenClassFor, type DeviceMode } from './capabilities'

/** A fake matchMedia that answers from a fixed set of matching queries. */
const media =
  (matching: { coarse?: boolean; fine?: boolean; hover?: boolean }) => (query: string) => ({
    matches:
      (query.includes('coarse') && !!matching.coarse) ||
      (query.includes('fine') && !!matching.fine) ||
      (query.includes('hover') && !!matching.hover),
  })

describe('screenClassFor', () => {
  it.each([
    [390, 'phone'],
    [639, 'phone'],
    [640, 'tablet'],
    [1279, 'tablet'],
    [1280, 'desktop'],
  ])('%i px → %s', (w, cls) => expect(screenClassFor(w)).toBe(cls))
})

describe('deriveMode', () => {
  const cases: [string, Parameters<typeof media>[0], number, object, DeviceMode][] = [
    ['phone (coarse, narrow)', { coarse: true }, 390, {}, 'phone'],
    ['tablet (coarse, medium)', { coarse: true }, 1024, {}, 'tablet'],
    ['large tablet (coarse, wide)', { coarse: true }, 1366, {}, 'tablet'],
    [
      'tablet with pen + trackpad cover',
      { coarse: true, fine: true, hover: true },
      1024,
      { penSeen: true },
      'tablet',
    ],
    [
      '2-in-1 (touch screen + trackpad)',
      { coarse: true, fine: true, hover: true },
      1440,
      {},
      'hybrid',
    ],
    ['laptop (fine + hover)', { fine: true, hover: true }, 1440, {}, 'laptop'],
    ['small laptop window', { fine: true, hover: true }, 600, {}, 'laptop'],
    [
      'laptop after a touch event',
      { fine: true, hover: true },
      1440,
      { touchSeen: true },
      'hybrid',
    ],
    ['no pointer info at all', {}, 1280, {}, 'laptop'],
  ]

  it.each(cases)('%s', (_name, matching, width, seen, expected) => {
    expect(deriveMode(detectCapabilities(media(matching), width, seen))).toBe(expected)
  })
})
