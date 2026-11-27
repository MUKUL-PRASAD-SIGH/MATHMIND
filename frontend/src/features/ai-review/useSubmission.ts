import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, type Schemas } from '../../services/api/client'
import { pollStatus } from '../../services/api/poll'

export type SubmissionState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'tracking'; submissionId: string; status: Schemas['SubmissionStatus'] }
  | { kind: 'error'; message: string }

export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    return err.isNetwork
      ? 'The checker is offline. Your work is saved in this notebook — try again later.'
      : err.message
  }
  return err instanceof Error ? err.message : 'Something went wrong.'
}

/** Sends one submission, then polls its status until it settles (for <SubmissionStatus>). */
export function useSubmission() {
  const [state, setState] = useState<SubmissionState>({ kind: 'idle' })
  const polling = useRef<AbortController | null>(null)

  const stop = useCallback(() => {
    polling.current?.abort()
    polling.current = null
  }, [])
  useEffect(() => stop, [stop])

  const submit = useCallback(
    async (send: () => Promise<Schemas['SubmissionAccepted']>) => {
      stop()
      setState({ kind: 'sending' })
      let submissionId: string
      try {
        const res = await send()
        submissionId = res.submission_id
        setState({ kind: 'tracking', submissionId, status: res.status })
      } catch (err) {
        setState({ kind: 'error', message: describeError(err) })
        return
      }
      const ctrl = new AbortController()
      polling.current = ctrl
      try {
        await pollStatus(submissionId, {
          signal: ctrl.signal,
          onUpdate: (r) => setState({ kind: 'tracking', submissionId, status: r.status }),
        })
      } catch (err) {
        if (!ctrl.signal.aborted) setState({ kind: 'error', message: describeError(err) })
      }
    },
    [stop],
  )

  const fail = useCallback(
    (message: string) => {
      stop()
      setState({ kind: 'error', message })
    },
    [stop],
  )
  const reset = useCallback(() => {
    stop()
    setState({ kind: 'idle' })
  }, [stop])

  return { state, submit, fail, reset }
}
