import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeStroke } from '../../test/factories'
import { PAGE_ASPECT } from '../model'
import {
  EXPORT_PADDING,
  exportRegion,
  fitWithin,
  MAX_IMAGE_BYTES,
  newImageObject,
  prepareImage,
  validateImageFile,
} from './image'

afterEach(() => vi.unstubAllGlobals())

describe('validateImageFile', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp'])('accepts %s', (type) => {
    expect(validateImageFile({ type, size: 1000 })).toEqual({ ok: true })
  })

  it.each(['image/gif', 'image/svg+xml', 'application/pdf', ''])('rejects %s', (type) => {
    expect(validateImageFile({ type, size: 1000 }).ok).toBe(false)
  })

  it('enforces the 5 MB limit and rejects empty files', () => {
    expect(validateImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES }).ok).toBe(true)
    expect(validateImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).toMatchObject({
      ok: false,
      reason: expect.stringContaining('5 MB'),
    })
    expect(validateImageFile({ type: 'image/png', size: 0 }).ok).toBe(false)
  })
})

describe('fitWithin', () => {
  it('downscales so the long side is 2048 px, keeping the aspect ratio', () => {
    expect(fitWithin(4000, 3000)).toEqual({ w: 2048, h: 1536 })
    expect(fitWithin(1000, 4096)).toEqual({ w: 500, h: 2048 })
  })

  it('never upscales', () => {
    expect(fitWithin(800, 600)).toEqual({ w: 800, h: 600 })
    expect(fitWithin(2048, 10)).toEqual({ w: 2048, h: 10 })
  })
})

describe('prepareImage', () => {
  const bitmap = (width: number, height: number) =>
    vi.fn(async () => ({ width, height, close: () => {} }))

  it('keeps the original file untouched and downscales a working copy', async () => {
    vi.stubGlobal('createImageBitmap', bitmap(4096, 2048))
    const file = new File([new Uint8Array(10)], 'photo.jpg', { type: 'image/jpeg' })
    const out = await prepareImage(file)
    expect(out.source).toBe(file)
    expect(out.image).not.toBe(file)
    expect(out).toMatchObject({ width: 2048, height: 1024 })
  })

  it('uses the file as-is when it is already small', async () => {
    vi.stubGlobal('createImageBitmap', bitmap(640, 480))
    const file = new File([new Uint8Array(10)], 'scan.png', { type: 'image/png' })
    const out = await prepareImage(file)
    expect(out.image).toBe(file)
  })

  it('rejects unsupported files before decoding', async () => {
    const decode = bitmap(1, 1)
    vi.stubGlobal('createImageBitmap', decode)
    await expect(prepareImage(new File(['x'], 'a.gif', { type: 'image/gif' }))).rejects.toThrow(
      /PNG, JPEG or WebP/,
    )
    expect(decode).not.toHaveBeenCalled()
  })
})

describe('newImageObject', () => {
  it('places the image keeping its aspect ratio on the page', () => {
    const blob = new Blob()
    const o = newImageObject('pg', [], { source: blob, image: blob, width: 1000, height: 500 })
    expect(o.bbox.w).toBeCloseTo(0.6)
    expect(o.bbox.h).toBeCloseTo((0.6 * 0.5) / PAGE_ASPECT)
  })
})

describe('exportRegion', () => {
  it('renders the region to a PNG blob sized at 2× with padding', async () => {
    const created: HTMLCanvasElement[] = []
    const orig = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = orig(tag)
      if (tag === 'canvas') created.push(el as HTMLCanvasElement)
      return el
    })
    const stroke = makeStroke('pg', [
      [0.1, 0.1],
      [0.3, 0.2],
    ])
    const blob = await exportRegion({ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }, { strokes: [stroke] })
    expect(blob.type).toBe('image/png')
    expect(created[0].width).toBe(Math.ceil(0.2 * 2000 + 2 * EXPORT_PADDING))
    expect(created[0].height).toBe(Math.ceil(0.1 * 2000 * PAGE_ASPECT + 2 * EXPORT_PADDING))
  })

  it('caps very large regions at 4096 px', async () => {
    const created: HTMLCanvasElement[] = []
    const orig = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = orig(tag)
      if (tag === 'canvas') created.push(el as HTMLCanvasElement)
      return el
    })
    await exportRegion({ x: 0, y: 0, w: 1, h: 1 }, { strokes: [] })
    expect(Math.max(created[0].width, created[0].height)).toBeLessThanOrEqual(4096)
  })
})
