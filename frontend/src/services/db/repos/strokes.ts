import Dexie from 'dexie'
import type { Stroke } from '../../../notebook/model'
import { db } from '../db'

export const strokesRepo = {
  put: (stroke: Stroke) => db.strokes.put(stroke),
  bulkPut: (strokes: Stroke[]) => db.strokes.bulkPut(strokes),
  get: (id: string) => db.strokes.get(id),
  /** Strokes of a page in insertion order (UUIDv7 ids). Soft-deleted ones only on request. */
  listByPage: async (pageId: string, { includeDeleted = false } = {}) => {
    const all = await db.strokes
      .where('[page_id+id]')
      .between([pageId, Dexie.minKey], [pageId, Dexie.maxKey])
      .toArray()
    return includeDeleted ? all : all.filter((s) => !s.deleted)
  },
  update: (id: string, changes: Partial<Stroke>) => db.strokes.update(id, changes),
  /** Soft delete so undo can bring strokes back. Original points are never touched. */
  softDelete: (ids: string[]) => setDeleted(ids, true),
  restore: (ids: string[]) => setDeleted(ids, false),
}

function setDeleted(ids: string[], deleted: boolean) {
  return db.transaction('rw', db.strokes, () =>
    Promise.all(ids.map((id) => db.strokes.update(id, { deleted }))),
  )
}
