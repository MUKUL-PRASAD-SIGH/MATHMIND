import { bboxesIntersect } from '../canvas/geometry'
import { drawStroke } from '../canvas/render'
import { uuidv7 } from '../ids'
import { PAGE_ASPECT, REF_PAGE_WIDTH, type BBox, type ImageObject, type Stroke } from '../model'
import { nextSlotY } from '../objects'
import type { NotebookObject } from '../model'

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_LONG_SIDE = 2048
/** Export scale: 2× the reference page width; padding around the crop in px. */
export const EXPORT_SCALE = 2
export const EXPORT_PADDING = 16
const MAX_EXPORT_SIDE = 4096

export type Validation = { ok: true } | { ok: false; reason: string }

export function validateImageFile(file: { type: string; size: number }): Validation {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, reason: 'Only PNG, JPEG or WebP images can be imported.' }
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, reason: 'This image is larger than 5 MB. Crop it or take a smaller photo.' }
  }
  if (file.size === 0) return { ok: false, reason: 'This file is empty.' }
  return { ok: true }
}

/** Scale (w, h) so the long side is at most `max`; never upscales. */
export function fitWithin(w: number, h: number, max = MAX_LONG_SIDE): { w: number; h: number } {
  const long = Math.max(w, h)
  if (long <= max) return { w, h }
  const k = max / long
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not encode the image'))),
      type,
      quality,
    ),
  )
}

function newCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  return [canvas, ctx]
}

/**
 * Validate and decode an imported file. The file itself is kept untouched as `source`;
 * `image` is a working copy downscaled to ≤ 2048 px on the long side.
 */
export async function prepareImage(
  file: File,
): Promise<{ source: Blob; image: Blob; width: number; height: number }> {
  const check = validateImageFile(file)
  if (!check.ok) throw new Error(check.reason)
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('This image could not be read.')
  }
  const { w, h } = fitWithin(bitmap.width, bitmap.height)
  let image: Blob = file
  if (w !== bitmap.width || h !== bitmap.height) {
    const [canvas, ctx] = newCanvas(w, h)
    ctx.drawImage(bitmap, 0, 0, w, h)
    image = await canvasToBlob(canvas, file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.92)
  }
  bitmap.close?.()
  return { source: file, image, width: w, height: h }
}

/** An image object placed on the page at `width` (page-normalized), keeping its aspect. */
export function newImageObject(
  pageId: string,
  existing: readonly NotebookObject[],
  img: { source: Blob; image: Blob; width: number; height: number },
): ImageObject {
  let w = 0.6
  let h = (w * (img.height / img.width)) / PAGE_ASPECT
  if (h > 0.6) {
    w *= 0.6 / h
    h = 0.6
  }
  return {
    id: uuidv7(),
    page_id: pageId,
    kind: 'image',
    bbox: { x: 0.06, y: nextSlotY(existing, h), w, h },
    payload: img,
    deleted: false,
  }
}

/**
 * Render a page region to a PNG for upload: white background, images cropped to the region,
 * then ink in black at 2× scale with 16 px padding. Highlighter strokes are left out.
 */
export async function exportRegion(
  bbox: BBox,
  content: { strokes: readonly Stroke[]; images?: readonly ImageObject[] },
): Promise<Blob> {
  let scale = REF_PAGE_WIDTH * EXPORT_SCALE // px per page width
  const sizeFor = (s: number) => ({
    w: Math.ceil(bbox.w * s + 2 * EXPORT_PADDING),
    h: Math.ceil(bbox.h * s * PAGE_ASPECT + 2 * EXPORT_PADDING),
  })
  let size = sizeFor(scale)
  const over = Math.max(size.w, size.h) / MAX_EXPORT_SIDE
  if (over > 1) {
    scale /= over
    size = sizeFor(scale)
  }
  const [canvas, ctx] = newCanvas(size.w, size.h)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size.w, size.h)

  const target = { width: scale, height: scale * PAGE_ASPECT }
  const px = (x: number) => (x - bbox.x) * target.width + EXPORT_PADDING
  const py = (y: number) => (y - bbox.y) * target.height + EXPORT_PADDING

  for (const img of content.images ?? []) {
    if (!bboxesIntersect(img.bbox, bbox)) continue
    const bitmap = await createImageBitmap(img.payload.image)
    ctx.drawImage(
      bitmap,
      px(img.bbox.x),
      py(img.bbox.y),
      img.bbox.w * target.width,
      img.bbox.h * target.height,
    )
    bitmap.close?.()
  }

  for (const s of content.strokes) {
    if (s.tool === 'highlighter') continue
    drawStroke(ctx, s, target, {
      color: '#000000',
      alpha: 1,
      dx: -bbox.x + EXPORT_PADDING / target.width,
      dy: -bbox.y + EXPORT_PADDING / target.height,
    })
  }
  return canvasToBlob(canvas, 'image/png')
}

/** Crop part of an image (rect normalized to the image) to a PNG. */
export async function cropImage(image: Blob, rect: BBox): Promise<Blob> {
  const bitmap = await createImageBitmap(image)
  const sx = Math.round(rect.x * bitmap.width)
  const sy = Math.round(rect.y * bitmap.height)
  const sw = Math.max(1, Math.round(rect.w * bitmap.width))
  const sh = Math.max(1, Math.round(rect.h * bitmap.height))
  const [canvas, ctx] = newCanvas(sw, sh)
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh)
  bitmap.close?.()
  return canvasToBlob(canvas, 'image/png')
}
