/**
 * "Export my data" and "Delete all my data" (spec §13, T7.7). The notebook lives in IndexedDB
 * first, so both act on the local copy and on the backend; a backend that can't be reached
 * is reported, never silently skipped.
 */
import { forgetLast } from '../../notebook/autosave'
import { useNotebookStore } from '../../notebook/store'
import { api, type Schemas } from '../../services/api/client'
import { db } from '../../services/db/db'
import { useReviewStore, describeError } from '../ai-review/reviewStore'

export interface LocalExport {
  notebooks: unknown[]
  pages: unknown[]
  strokes: unknown[]
  objects: unknown[]
  reviews: unknown[]
}

export interface MyDataExport {
  format: 'mathmind-export'
  format_version: 1
  exported_at: string
  /** Everything stored in this browser (the offline source of truth). */
  local: LocalExport
  /** The backend's copy (submissions, reviews, mastery), or why it is missing. */
  server: Schemas['LearnerExport'] | { unavailable: string }
}

export async function collectExport(): Promise<MyDataExport> {
  const [notebooks, pages, strokes, objects, reviews] = await Promise.all([
    db.notebooks.toArray(),
    db.pages.toArray(),
    db.strokes.toArray(),
    db.objects.toArray(),
    db.reviews.toArray(),
  ])
  let server: MyDataExport['server']
  try {
    server = await api.exportMyData()
  } catch (err) {
    server = { unavailable: describeError(err) }
  }
  return {
    format: 'mathmind-export',
    format_version: 1,
    exported_at: new Date().toISOString(),
    local: { notebooks, pages, strokes, objects, reviews },
    server,
  }
}

/** Offer the export as a .json download. */
export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export interface DeleteOutcome {
  localDeleted: boolean
  server: Schemas['DeletionSummary'] | { unavailable: string }
}

/** Delete on the backend first (it refuses while a review runs), then wipe this browser. */
export async function deleteEverything(): Promise<DeleteOutcome> {
  let server: DeleteOutcome['server']
  try {
    server = await api.deleteMyData()
  } catch (err) {
    server = { unavailable: describeError(err) }
  }
  useReviewStore.getState().cancel()
  useNotebookStore.getState().closeNotebook()
  await db.transaction('rw', [db.notebooks, db.pages, db.strokes, db.objects, db.reviews], () =>
    Promise.all([
      db.notebooks.clear(),
      db.pages.clear(),
      db.strokes.clear(),
      db.objects.clear(),
      db.reviews.clear(),
    ]),
  )
  forgetLast()
  useNotebookStore.setState({ notebooks: [] })
  useReviewStore.setState({ active: null, byPage: {}, shownId: null })
  return { localDeleted: true, server }
}
