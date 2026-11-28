import type { Schemas } from '../../services/api/client'
import type { ActiveReview } from './reviewStore'

type Status = Schemas['SubmissionStatus']

const LABELS: Record<Status, string> = {
  received: 'Sent for checking.',
  recognizing: 'Reading your handwriting…',
  awaiting_confirmation: 'Please check what we read.',
  verifying: 'Checking each step…',
  reasoning: 'Writing feedback…',
  completed: 'Review ready.',
  completed_without_ai: 'Steps checked (AI feedback unavailable).',
  failed_recognition: "We couldn't read this — try a clearer crop or type it.",
  failed: 'The check failed — try again.',
}

interface Stage {
  key: string
  label: string
  statuses: Status[]
}

const IMAGE_STAGES: Stage[] = [
  { key: 'recognize', label: 'Recognizing', statuses: ['received', 'recognizing'] },
  { key: 'confirm', label: 'Check recognition', statuses: ['awaiting_confirmation'] },
  { key: 'verify', label: 'Verifying', statuses: ['verifying'] },
  { key: 'explain', label: 'Explaining', statuses: ['reasoning'] },
]
const TYPED_STAGES = IMAGE_STAGES.slice(2)

function stageIndex(stages: Stage[], status: Status | null): number {
  if (!status) return 0
  if (status === 'completed' || status === 'completed_without_ai') return stages.length
  const i = stages.findIndex((s) => s.statuses.includes(status))
  return i < 0 ? 0 : i
}

/** Recognizing → (Check recognition) → Verifying → Explaining, with cancel while it runs. */
export function SubmissionStatus({
  review,
  onCancel,
  onOpenConfirm,
}: {
  review: ActiveReview
  onCancel?(): void
  onOpenConfirm?(): void
}) {
  const stages =
    review.upload || review.origin === 'selection' || review.origin === 'capture'
      ? IMAGE_STAGES
      : TYPED_STAGES
  const running = review.phase === 'sending' || review.phase === 'working'
  const current = stageIndex(stages, review.status)

  let text: string
  if (review.phase === 'sending') text = 'Sending…'
  else if (review.phase === 'error' || review.phase === 'unreadable') text = review.message ?? ''
  else if (review.phase === 'confirm') text = review.message ?? LABELS.awaiting_confirmation
  else text = review.status ? LABELS[review.status] : 'Sending…'

  return (
    <div className="flex flex-col gap-1">
      {running || review.phase === 'confirm' ? (
        <ol aria-label="Review progress" className="flex flex-wrap items-center gap-1 text-xs">
          {stages.map((s, i) => {
            const state = i < current ? 'done' : i === current ? 'current' : 'todo'
            return (
              <li
                key={s.key}
                aria-current={state === 'current' ? 'step' : undefined}
                className={
                  state === 'done'
                    ? 'text-green-700'
                    : state === 'current'
                      ? 'font-semibold text-blue-700'
                      : 'text-slate-500'
                }
              >
                {state === 'done' ? '✓ ' : ''}
                {s.label}
                {i < stages.length - 1 && (
                  <span aria-hidden className="px-1 text-slate-400">
                    →
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <span
          role="status"
          className={`text-sm ${review.phase === 'error' || review.phase === 'unreadable' ? 'text-red-700' : 'text-slate-700'}`}
        >
          {text}
          {running && review.slow && ' This is taking longer than usual.'}
        </span>
        {review.phase === 'confirm' && !review.confirmOpen && onOpenConfirm && (
          <button
            type="button"
            onClick={onOpenConfirm}
            className="min-h-8 rounded bg-amber-100 px-2 text-sm font-medium text-amber-900 hover:bg-amber-200"
          >
            Check recognition
          </button>
        )}
        {(running || review.phase === 'confirm') && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-8 rounded px-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
