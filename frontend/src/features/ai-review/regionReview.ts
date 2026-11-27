import { cropImage, exportRegion, newImageObject, prepareImage } from '../../notebook/images/image'
import type { BBox, ImageObject } from '../../notebook/model'
import { getSelection, useNotebookStore } from '../../notebook/store'
import { api } from '../../services/api/client'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Crop the current selection to a PNG and upload it with its bbox and stroke ids. */
export async function sendSelectionForReview() {
  const sel = getSelection()
  if (!sel) throw new Error('Select some work with the lasso first.')
  const state = useNotebookStore.getState()
  const ids = new Set(sel.strokeIds)
  const strokes = (state.strokes[sel.pageId] ?? []).filter((s) => ids.has(s.id))
  const images = (state.objects[sel.pageId] ?? []).filter(
    (o): o is ImageObject => o.kind === 'image',
  )
  const file = await exportRegion(sel.bbox, { strokes, images })
  return api.submitImage({ file, pageId: sel.pageId, bbox: sel.bbox, strokeIds: sel.strokeIds })
}

/**
 * Phone capture: keep the photo on the page (original untouched), then upload the cropped
 * part with its page-normalized bbox.
 */
export async function sendCaptureForReview(file: File, crop: BBox, pageId: string) {
  const prepared = await prepareImage(file)
  const state = useNotebookStore.getState()
  const obj = newImageObject(pageId, state.objects[pageId] ?? [], prepared)
  state.addObject(obj)
  const png = await cropImage(prepared.image, crop)
  const b = obj.bbox
  const bbox = {
    x: clamp01(b.x + crop.x * b.w),
    y: clamp01(b.y + crop.y * b.h),
    w: clamp01(crop.w * b.w),
    h: clamp01(crop.h * b.h),
  }
  return api.submitImage({ file: png, pageId, bbox })
}
