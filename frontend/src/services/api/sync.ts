/**
 * Best-effort page sync: after a page's data reaches IndexedDB it is queued for
 * PUT /notebooks/{id}/pages/{page_id}. IndexedDB stays the source of truth; when offline or
 * the server is down the queue waits (persisted in localStorage) and flushes on `online`.
 */
import type { Page } from '../../notebook/model'
import { notebooksRepo } from '../db/repos/notebooks'
import { pagesRepo } from '../db/repos/pages'
import { strokesRepo } from '../db/repos/strokes'
import { api, ApiError, type Schemas } from './client'

const QUEUE_KEY = 'mathmind.syncQueue'
/** Contract limit on strokes per PUT. */
const MAX_STROKES_PER_PUT = 5000

export type SyncResult = 'synced' | 'skipped' | 'retry'

function toUpsert(
  page: Page,
  version: number,
  strokes?: Schemas['Stroke'][],
): Schemas['PageUpsert'] {
  return {
    chapter: page.chapter,
    order: page.order,
    title: page.title,
    background: page.background,
    bookmarked: page.bookmarked,
    version,
    strokes,
  }
}

/** Server id of the page's notebook, creating the notebook on the server the first time. */
async function remoteNotebookId(notebookId: string): Promise<string | null> {
  const nb = await notebooksRepo.get(notebookId)
  if (!nb) return null
  if (nb.remote_id) return nb.remote_id
  const created = await api.createNotebook({ title: nb.title, domain: nb.domain })
  await notebooksRepo.update(notebookId, { remote_id: created.id })
  return created.id
}

/** Push one page (metadata + every stroke, including soft-deleted ones) to the server. */
export async function syncPage(pageId: string, retried = false): Promise<SyncResult> {
  const page = await pagesRepo.get(pageId)
  // Working-space areas have no place in the contract's Page yet; they stay local.
  if (!page || page.parent_page_id) return 'skipped'
  const remoteId = await remoteNotebookId(page.notebook_id)
  if (!remoteId) return 'skipped'
  const strokes = await strokesRepo.listByPage(pageId, { includeDeleted: true })
  const chunks: (Schemas['Stroke'][] | undefined)[] = []
  for (let i = 0; i < strokes.length; i += MAX_STROKES_PER_PUT) {
    chunks.push(strokes.slice(i, i + MAX_STROKES_PER_PUT))
  }
  if (chunks.length === 0) chunks.push(undefined)

  let version = page.version
  try {
    for (const chunk of chunks) {
      const saved = await api.upsertPage(remoteId, pageId, toUpsert(page, version, chunk))
      version = saved.version
      await pagesRepo.update(pageId, { version })
    }
    return 'synced'
  } catch (err) {
    if (!(err instanceof ApiError) || retried) throw err
    if (err.status === 409) {
      // This device wins: adopt the server's version and push again (IndexedDB is the truth).
      const remote = (await api.listPages(remoteId)).find((p) => p.id === pageId)
      await pagesRepo.update(pageId, { version: remote?.version ?? 0 })
      return syncPage(pageId, true)
    }
    if (err.status === 404) {
      // The server lost the notebook (e.g. a fresh database): create it again.
      await notebooksRepo.update(page.notebook_id, { remote_id: null })
      return syncPage(pageId, true)
    }
    throw err
  }
}

const isTransient = (err: unknown) =>
  !(err instanceof ApiError) || err.isNetwork || err.status >= 500 || err.status === 408

export interface PageSyncOptions {
  debounceMs?: number
  retryMs?: number
}

export class PageSync {
  private pending = new Set<string>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private flushing: Promise<void> | null = null
  private retries = 0
  private readonly debounceMs: number
  private readonly retryMs: number

  constructor({ debounceMs = 2000, retryMs = 30_000 }: PageSyncOptions = {}) {
    this.debounceMs = debounceMs
    this.retryMs = retryMs
    this.pending = new Set(this.load())
  }

  get queued(): string[] {
    return [...this.pending]
  }

  enqueue(pageId: string): void {
    this.pending.add(pageId)
    this.save()
    this.schedule(this.debounceMs)
  }

  /** Begin listening for `online` and flush anything left from a previous session. */
  start(): () => void {
    const onOnline = () => void this.flush()
    window.addEventListener('online', onOnline)
    if (this.pending.size > 0) this.schedule(this.debounceMs)
    return () => window.removeEventListener('online', onOnline)
  }

  flush(): Promise<void> {
    this.flushing ??= this.run().finally(() => (this.flushing = null))
    return this.flushing
  }

  private schedule(ms: number) {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.flush()
    }, ms)
  }

  private async run(): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return // wait for `online`
    for (const pageId of [...this.pending]) {
      // Dequeue first: a change saved while this request is in flight re-queues the page.
      this.pending.delete(pageId)
      try {
        await syncPage(pageId)
      } catch (err) {
        if (isTransient(err)) {
          // Server or network down: keep everything queued and try again later.
          this.pending.add(pageId)
          this.save()
          this.retries += 1
          this.schedule(Math.min(this.retryMs * 2 ** (this.retries - 1), 5 * 60_000))
          return
        }
        console.warn(`Page ${pageId} was not synced`, err)
      }
      this.save()
    }
    this.retries = 0
  }

  private load(): string[] {
    try {
      const raw = localStorage.getItem(QUEUE_KEY)
      const v: unknown = raw ? JSON.parse(raw) : []
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
    } catch {
      return []
    }
  }

  private save(): void {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify([...this.pending]))
    } catch {
      // Without storage the queue still works for this session.
    }
  }
}

export const pageSync = new PageSync()
