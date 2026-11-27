import { useCallback, useState } from 'react'
import { ApiError, type Schemas } from '../../services/api/client'

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

/** Sends one submission and tracks its state for <SubmissionStatus>. */
export function useSubmission() {
  const [state, setState] = useState<SubmissionState>({ kind: 'idle' })

  const submit = useCallback(async (send: () => Promise<Schemas['SubmissionAccepted']>) => {
    setState({ kind: 'sending' })
    try {
      const res = await send()
      setState({ kind: 'tracking', submissionId: res.submission_id, status: res.status })
    } catch (err) {
      setState({ kind: 'error', message: describeError(err) })
    }
  }, [])

  const fail = useCallback((message: string) => setState({ kind: 'error', message }), [])
  const reset = useCallback(() => setState({ kind: 'idle' }), [])

  return { state, submit, fail, reset }
}
