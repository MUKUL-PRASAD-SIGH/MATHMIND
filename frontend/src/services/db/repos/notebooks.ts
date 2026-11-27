import type { Notebook } from '../../../notebook/model'
import { db } from '../db'

export const notebooksRepo = {
  put: (notebook: Notebook) => db.notebooks.put(notebook),
  get: (id: string) => db.notebooks.get(id),
  /** Most recently updated first. */
  list: () => db.notebooks.orderBy('updated_at').reverse().toArray(),
  update: (id: string, changes: Partial<Notebook>) => db.notebooks.update(id, changes),
  /** Hard delete (the UI asks for confirmation) including everything in the notebook. */
  remove: (id: string) =>
    db.transaction('rw', [db.notebooks, db.pages, db.strokes, db.objects, db.reviews], async () => {
      const pageIds = (await db.pages.where('notebook_id').equals(id).primaryKeys()) as string[]
      await db.strokes.where('page_id').anyOf(pageIds).delete()
      await db.objects.where('page_id').anyOf(pageIds).delete()
      await db.reviews.where('page_id').anyOf(pageIds).delete()
      await db.pages.bulkDelete(pageIds)
      await db.notebooks.delete(id)
    }),
}
