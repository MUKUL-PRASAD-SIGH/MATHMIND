import type { NotebookObject } from '../../../notebook/model'
import { db } from '../db'

export const objectsRepo = {
  put: (object: NotebookObject) => db.objects.put(object),
  get: (id: string) => db.objects.get(id),
  listByPage: async (pageId: string, { includeDeleted = false } = {}) => {
    const all = await db.objects.where('page_id').equals(pageId).toArray()
    all.sort((a, b) => (a.id < b.id ? -1 : 1))
    return includeDeleted ? all : all.filter((o) => !o.deleted)
  },
  update: (id: string, changes: Partial<NotebookObject>) => db.objects.update(id, changes),
  softDelete: (ids: string[]) => setDeleted(ids, true),
  restore: (ids: string[]) => setDeleted(ids, false),
}

function setDeleted(ids: string[], deleted: boolean) {
  return db.transaction('rw', db.objects, () =>
    Promise.all(ids.map((id) => db.objects.update(id, { deleted }))),
  )
}
