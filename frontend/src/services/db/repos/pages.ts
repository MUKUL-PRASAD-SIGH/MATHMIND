import type { Page } from '../../../notebook/model'
import { db } from '../db'

export const pagesRepo = {
  put: (page: Page) => db.pages.put(page),
  get: (id: string) => db.pages.get(id),
  /** Pages (and working-space areas) of a notebook, by `order`. */
  listByNotebook: async (notebookId: string) =>
    (await db.pages.where('notebook_id').equals(notebookId).toArray()).sort(
      (a, b) => a.order - b.order,
    ),
  /** Partial update so concurrent writers (autosave, sync) never clobber each other's fields. */
  update: (id: string, changes: Partial<Page>) => db.pages.update(id, changes),
  remove: (id: string) =>
    db.transaction('rw', [db.pages, db.strokes, db.objects], async () => {
      await db.strokes.where('page_id').equals(id).delete()
      await db.objects.where('page_id').equals(id).delete()
      await db.pages.delete(id)
    }),
}
