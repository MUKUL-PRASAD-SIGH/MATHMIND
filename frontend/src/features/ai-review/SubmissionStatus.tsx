import type { Schemas } from '../../services/api/client'
import type { SubmissionState } from './useSubmission'

const LABELS: Record<Schemas['SubmissionStatus'], string> = {
  received: 'Sent for checking (received).',
  recognizing: 'Reading your handwriting…',
  awaiting_confirmation: 'Please confirm what was recognised.',
  verifying: 'Checking each step…',
  reasoning: 'Writing feedback…',
  completed: 'Review ready.',
  completed_without_ai: 'Steps checked (AI feedback unavailable).',
  failed_recognition: 'The handwriting could not be read — try a clearer crop or type it.',
  failed: 'The check failed — try again.',
}

export function SubmissionStatus({ state }: { state: SubmissionState }) {
  return (
    <span role="status" className="text-sm text-slate-600">
      {state.kind === 'sending' && 'Sending…'}
      {state.kind === 'tracking' && LABELS[state.status]}
      {state.kind === 'error' && <span className="text-red-700">{state.message}</span>}
    </span>
  )
}
