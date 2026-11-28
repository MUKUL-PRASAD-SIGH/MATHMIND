/**
 * Autosave: every committed change is written to IndexedDB through one sequential queue.
 * On a write failure the data stays in memory, the status flips to `error` (banner) and the
 * write is retried with exponential backoff until it succeeds (spec §13.3).
 */

export type SaveStatus = 'saved' | 'saving' | 'error'

export interface Debounced<A extends unknown[]> {
  (...args: A): void
  flush(): void
  cancel(): void
  pending(): boolean
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastArgs: A | undefined
  const run = () => {
    timer = undefined
    const args = lastArgs
    lastArgs = undefined
    if (args) fn(...args)
  }
  const d = (...args: A) => {
    lastArgs = args
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(run, ms)
  }
  d.flush = () => {
    if (timer !== undefined) clearTimeout(timer)
    run()
  }
  d.cancel = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    lastArgs = undefined
  }
  d.pending = () => timer !== undefined
  return d
}

interface Task {
  run(): Promise<unknown>
  key?: string
  pageId?: string
}

export interface SaveQueueOptions {
  baseDelay?: number
  maxDelay?: number
}

export class SaveQueue {
  private tasks: Task[] = []
  private running = false
  private attempt = 0
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private listeners = new Set<(s: SaveStatus) => void>()
  private idleWaiters: (() => void)[] = []
  status: SaveStatus = 'saved'
  lastError: unknown = null
  /** Called after a page's data reached IndexedDB (used to queue server sync). */
  onPageSaved: ((pageId: string) => void) | null = null
  private readonly baseDelay: number
  private readonly maxDelay: number

  constructor({ baseDelay = 500, maxDelay = 10_000 }: SaveQueueOptions = {}) {
    this.baseDelay = baseDelay
    this.maxDelay = maxDelay
  }

  subscribe(fn: (s: SaveStatus) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Queue a write. A task with the same `key` that has not started yet is replaced. */
  enqueue(run: () => Promise<unknown>, opts: { key?: string; pageId?: string } = {}): void {
    if (opts.key) {
      const i = this.tasks.findIndex((t, idx) => t.key === opts.key && (idx > 0 || !this.running))
      if (i >= 0) {
        this.tasks[i] = { run, ...opts }
        return
      }
    }
    this.tasks.push({ run, ...opts })
    if (this.status === 'saved') this.setStatus('saving')
    void this.pump()
  }

  /** Retry immediately (the banner's "Retry now"). */
  retryNow(): void {
    if (this.retryTimer === undefined) return
    clearTimeout(this.retryTimer)
    this.retryTimer = undefined
    void this.pump()
  }

  /** Resolves once every queued write has succeeded. */
  idle(): Promise<void> {
    if (this.tasks.length === 0 && !this.running) return Promise.resolve()
    return new Promise((resolve) => this.idleWaiters.push(resolve))
  }

  get pending(): number {
    return this.tasks.length
  }

  private setStatus(s: SaveStatus) {
    if (s === this.status) return
    this.status = s
    for (const fn of this.listeners) fn(s)
  }

  private async pump(): Promise<void> {
    if (this.running || this.retryTimer !== undefined) return
    this.running = true
    while (this.tasks.length > 0) {
      const task = this.tasks[0]
      try {
        await task.run()
      } catch (err) {
        this.lastError = err
        this.running = false
        this.setStatus('error')
        const delay = Math.min(this.maxDelay, this.baseDelay * 2 ** this.attempt)
        this.attempt += 1
        this.retryTimer = setTimeout(() => {
          this.retryTimer = undefined
          void this.pump()
        }, delay)
        return
      }
      this.tasks.shift()
      this.attempt = 0
      if (this.status === 'error') this.setStatus('saving')
      if (task.pageId) this.onPageSaved?.(task.pageId)
    }
    this.running = false
    this.setStatus('saved')
    const waiters = this.idleWaiters
    this.idleWaiters = []
    waiters.forEach((w) => w())
  }
}

export const saveQueue = new SaveQueue()

// --- Last position + storage persistence --------------------------------------------------

const LAST_KEY = 'mathmind.last'

export function rememberLast(notebookId: string, pageId: string | null): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ notebookId, pageId }))
  } catch {
    // Private mode / storage disabled: restoring the last page is a convenience only.
  }
}

export function readLast(): { notebookId: string; pageId: string | null } | null {
  try {
    const raw = localStorage.getItem(LAST_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as { notebookId?: unknown; pageId?: unknown }
    if (typeof v.notebookId !== 'string') return null
    return { notebookId: v.notebookId, pageId: typeof v.pageId === 'string' ? v.pageId : null }
  } catch {
    return null
  }
}

export function forgetLast(): void {
  try {
    localStorage.removeItem(LAST_KEY)
  } catch {
    // ignore
  }
}

/** Ask once for persistent storage so the browser is less likely to evict the notebook. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
