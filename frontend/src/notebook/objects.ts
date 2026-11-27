import { uuidv7 } from './ids'
import type { EquationObject, NotebookObject, TextObject } from './model'

/** Top of the first free row below the existing objects on a page. */
export function nextSlotY(objects: readonly NotebookObject[], height: number): number {
  const bottom = objects.reduce((max, o) => Math.max(max, o.bbox.y + o.bbox.h), 0.02)
  return Math.min(bottom + 0.02, Math.max(0, 1 - height))
}

export function newSolutionBlock(
  pageId: string,
  existing: readonly NotebookObject[],
): EquationObject {
  const h = 0.18
  return {
    id: uuidv7(),
    page_id: pageId,
    kind: 'equation',
    bbox: { x: 0.06, y: nextSlotY(existing, h), w: 0.7, h },
    payload: { steps: [{ id: uuidv7(), latex: '' }] },
    deleted: false,
  }
}

export function newTextNote(pageId: string, existing: readonly NotebookObject[]): TextObject {
  const h = 0.08
  return {
    id: uuidv7(),
    page_id: pageId,
    kind: 'text',
    bbox: { x: 0.06, y: nextSlotY(existing, h), w: 0.6, h },
    payload: { text: '' },
    deleted: false,
  }
}
