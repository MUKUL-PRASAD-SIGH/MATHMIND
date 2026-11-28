import { api, ApiError, type Schemas } from './client'

type Status = Schemas['SubmissionStatus']
type StatusResponse = Schemas['SubmissionStatusResponse']

/** States where polling stops: finished, failed, or waiting for the learner to confirm. */
export const STOP_STATES: ReadonlySet<Status> = new Set<Status>([
  'completed',
  'completed_without_ai',
  'failed',
  'failed_recognition',
  'awaiting_confirmation',
])

export interface PollOptions {
  signal?: AbortSignal
  onUpdate?(status: StatusResponse): void
  /** Delay before poll n (0-based): 1 s for the first polls, then ×1.5 up to 3 s. */
  delayFor?(n: number): number
  /** Consecutive network failures tolerated before giving up. */
  maxNetworkErrors?: number
  fetchStatus?(id: string, signal?: AbortSignal): Promise<StatusResponse>
}

export function backoffDelay(n: number): number {
  if (n < 3) return 1000
  return Math.min(3000, Math.round(1000 * 1.5 ** (n - 2)))
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Poll GET /submissions/{id}/status until a stop state. Cancel with an AbortSignal; short
 * network blips are retried, other API errors are thrown.
 */
export async function pollStatus(id: string, opts: PollOptions = {}): Promise<StatusResponse> {
  const {
    signal,
    onUpdate,
    delayFor = backoffDelay,
    maxNetworkErrors = 5,
    fetchStatus = api.getStatus,
  } = opts
  let networkErrors = 0
  for (let n = 0; ; n++) {
    await wait(delayFor(n), signal)
    let res: StatusResponse
    try {
      res = await fetchStatus(id, signal)
    } catch (err) {
      if (err instanceof ApiError && err.isNetwork && ++networkErrors <= maxNetworkErrors) continue
      throw err
    }
    networkErrors = 0
    onUpdate?.(res)
    if (STOP_STATES.has(res.status)) return res
  }
}
