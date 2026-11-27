import Dexie, { type Table } from 'dexie'
import type { CachedReview, Notebook, NotebookObject, Page, Stroke } from '../../notebook/model'

/** IndexedDB is the offline source of truth for the notebook. */
export class MathMindDB extends Dexie {
  notebooks!: Table<Notebook, string>
  pages!: Table<Page, string>
  strokes!: Table<Stroke, string>
  objects!: Table<NotebookObject, string>
  reviews!: Table<CachedReview, string>

  constructor(name = 'mathmind') {
    super(name)
    this.version(1).stores({
      notebooks: 'id, updated_at',
      pages: 'id, notebook_id, order',
      // Ids are UUIDv7, so [page_id+id] orders strokes by insertion.
      strokes: 'id, page_id, [page_id+id]',
      objects: 'id, page_id, kind',
      reviews: 'submission_id, page_id',
    })
    // Migrations: add `this.version(2).stores({...}).upgrade((tx) => ...)` here; never edit version(1).
  }
}

export const db = new MathMindDB()
