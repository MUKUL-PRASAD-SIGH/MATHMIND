import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../services/db/db'
import { strokesRepo } from '../services/db/repos/strokes'
import { makeStroke, resetDb } from '../test/factories'
import { debounce, readLast, rememberLast, saveQueue, SaveQueue } from './autosave'
import { SaveStatus } from './SaveStatus'
import { useNotebookStore } from './store'

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('runs once with the last arguments after the quiet period', () => {
    const fn = vi.fn()
    const d = debounce(fn, 500)
    d(1)
    vi.advanceTimersByTime(300)
    d(2)
    vi.advanceTimersByTime(499)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledExactlyOnceWith(2)
  })

  it('flushes immediately and cancels cleanly', () => {
    const fn = vi.fn()
    const d = debounce(fn, 500)
    d('a')
    expect(d.pending()).toBe(true)
    d.flush()
    expect(fn).toHaveBeenCalledWith('a')
    d('b')
    d.cancel()
    vi.advanceTimersByTime(1000)
    expect(fn).toHaveBeenCalledTimes(1)
    d.flush() // nothing pending
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('SaveQueue', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('runs writes in order and retries a failed write with backoff', async () => {
    const q = new SaveQueue({ baseDelay: 100 })
    const statuses: string[] = []
    q.subscribe((s) => statuses.push(s))
    const order: string[] = []
    let failures = 2
    q.enqueue(async () => {
      if (failures-- > 0) throw new Error('QuotaExceededError')
      order.push('a')
    })
    q.enqueue(async () => order.push('b'))
    await vi.advanceTimersByTimeAsync(0)
    expect(q.status).toBe('error')
    await vi.advanceTimersByTimeAsync(99)
    expect(order).toEqual([])
    await vi.advanceTimersByTimeAsync(1) // retry 1 (100 ms) fails again
    expect(q.status).toBe('error')
    await vi.advanceTimersByTimeAsync(200) // retry 2 (200 ms) succeeds
    expect(order).toEqual(['a', 'b'])
    expect(q.status).toBe('saved')
    expect(statuses).toEqual(['saving', 'error', 'saving', 'saved'])
  })

  it('replaces a not-yet-started task with the same key', async () => {
    const q = new SaveQueue()
    const ran: number[] = []
    let release!: () => void
    q.enqueue(() => new Promise<void>((r) => (release = r)))
    q.enqueue(async () => ran.push(1), { key: 'meta' })
    q.enqueue(async () => ran.push(2), { key: 'meta' })
    release()
    await q.idle()
    expect(ran).toEqual([2])
  })
})

describe('last page', () => {
  it('round-trips through localStorage and tolerates garbage', () => {
    rememberLast('nb', 'pg')
    expect(readLast()).toEqual({ notebookId: 'nb', pageId: 'pg' })
    localStorage.setItem('mathmind.last', '{not json')
    expect(readLast()).toBeNull()
  })
})

describe('autosave integration', () => {
  beforeEach(async () => {
    await resetDb()
    useNotebookStore.getState().closeNotebook()
  })

  it('restores strokes after the store is recreated', async () => {
    const { useNotebookStore: store1 } = await import('./store')
    const nb = await store1.getState().createNotebook('Restore')
    await store1.getState().openNotebook(nb.id)
    const pageId = store1.getState().currentPageId!
    const strokes = [0.1, 0.2, 0.3].map((y) =>
      makeStroke(pageId, [
        [0.1, y],
        [0.4, y],
      ]),
    )
    strokes.forEach((s) => store1.getState().addStroke(s))
    await saveQueue.idle()

    vi.resetModules()
    const fresh = await import('./store')
    expect(fresh.useNotebookStore).not.toBe(store1)
    await fresh.useNotebookStore.getState().openNotebook(nb.id)
    const state = fresh.useNotebookStore.getState()
    expect(state.strokes[pageId].map((s) => s.id)).toEqual(strokes.map((s) => s.id))
  })

  it('shows a banner when an IndexedDB write fails and retries until it succeeds', async () => {
    const nb = await useNotebookStore.getState().createNotebook('Failing disk')
    await useNotebookStore.getState().openNotebook(nb.id)
    const pageId = useNotebookStore.getState().currentPageId!
    render(<SaveStatus />)
    expect(screen.getByRole('status')).toHaveTextContent('Saved')

    const put = vi
      .spyOn(db.strokes, 'bulkPut')
      .mockRejectedValueOnce(new Error('QuotaExceededError'))
    const stroke = makeStroke(pageId, [[0.5, 0.5]])
    act(() => useNotebookStore.getState().addStroke(stroke))

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved')
    expect(screen.getByRole('status')).toHaveTextContent('Not saved — retrying')
    // The stroke is still visible (kept in memory) while the write is failing.
    expect(useNotebookStore.getState().strokes[pageId]).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: 'Retry now' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(put).toHaveBeenCalledTimes(2)
    expect(await strokesRepo.get(stroke.id)).toBeDefined()
  })
})
