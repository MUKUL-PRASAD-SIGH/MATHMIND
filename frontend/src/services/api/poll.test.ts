import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type Schemas } from './client'
import { backoffDelay, pollStatus } from './poll'

type Status = Schemas['SubmissionStatus']
const res = (status: Status): Schemas['SubmissionStatusResponse'] => ({
  submission_id: 'sub_1',
  input_mode: 'typed',
  status,
  message: null,
  updated_at: '2026-01-01T10:00:00Z',
})

/** fetchStatus that walks through the given statuses, recording when each call happened. */
function sequence(...statuses: (Status | Error)[]) {
  const calls: number[] = []
  const fn = vi.fn(async () => {
    calls.push(Date.now())
    const next = statuses[Math.min(calls.length - 1, statuses.length - 1)]
    if (next instanceof Error) throw next
    return res(next)
  })
  return { fn, calls }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
})
afterEach(() => vi.useRealTimers())

describe('backoffDelay', () => {
  it('starts at 1 s and backs off to a 3 s ceiling', () => {
    expect([0, 1, 2, 3, 4, 5, 10].map(backoffDelay)).toEqual([
      1000, 1000, 1000, 1500, 2250, 3000, 3000,
    ])
  })
})

describe('pollStatus', () => {
  it.each<Status>([
    'completed',
    'completed_without_ai',
    'failed',
    'failed_recognition',
    'awaiting_confirmation',
  ])('stops on %s', async (terminal) => {
    const { fn } = sequence('received', 'verifying', terminal, 'completed')
    const updates: Status[] = []
    const done = pollStatus('sub_1', { fetchStatus: fn, onUpdate: (r) => updates.push(r.status) })
    await vi.runAllTimersAsync()
    await expect(done).resolves.toMatchObject({ status: terminal })
    expect(fn).toHaveBeenCalledTimes(3)
    expect(updates).toEqual(['received', 'verifying', terminal])
  })

  it('polls every 1 s, then backs off to 3 s', async () => {
    const { fn, calls } = sequence(...Array<Status>(7).fill('verifying'), 'completed')
    const done = pollStatus('sub_1', { fetchStatus: fn })
    await vi.runAllTimersAsync()
    await done
    const gaps = calls.map((t, i) => t - (i === 0 ? 0 : calls[i - 1]))
    expect(gaps).toEqual([1000, 1000, 1000, 1500, 2250, 3000, 3000, 3000])
  })

  it('is cancellable with an AbortController', async () => {
    const { fn } = sequence('verifying')
    const ctrl = new AbortController()
    const done = pollStatus('sub_1', { fetchStatus: fn, signal: ctrl.signal })
    const settled = expect(done).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(2500)
    ctrl.abort()
    await settled
    const n = fn.mock.calls.length
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fn).toHaveBeenCalledTimes(n)
  })

  it('rides out short network failures but surfaces API errors', async () => {
    const offline = new ApiError(0, 'network', 'offline')
    const ok = sequence(offline, offline, 'completed')
    const done = pollStatus('sub_1', { fetchStatus: ok.fn })
    await vi.runAllTimersAsync()
    await expect(done).resolves.toMatchObject({ status: 'completed' })

    const notFound = sequence(new ApiError(404, 'not_found', 'Submission not found'))
    const failed = pollStatus('sub_1', { fetchStatus: notFound.fn })
    const settled = expect(failed).rejects.toMatchObject({ status: 404 })
    await vi.runAllTimersAsync()
    await settled
  })
})
