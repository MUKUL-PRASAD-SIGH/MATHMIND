import { useState } from 'react'
import { KatexMath } from '../../components/KatexMath'
import type { Schemas } from '../../services/api/client'
import { AI_UNAVAILABLE, RECOMMENDED_ACTION, VERDICT_STYLE } from './annotations'
import { shownReview, useReviewStore } from './reviewStore'

const OVERALL: Record<Schemas['Overall'], { text: string; cls: string }> = {
  correct: { text: 'Every step checks out.', cls: 'bg-green-50 text-green-900' },
  incorrect: { text: 'One of the steps needs another look.', cls: 'bg-red-50 text-red-900' },
  inconclusive: {
    text: "We couldn't check every step for sure. The marks below say which ones.",
    cls: 'bg-slate-100 text-slate-800',
  },
}

/** Feedback for one finished review. SymPy's verdicts are the authority; the AI text explains. */
export function ReviewBody({ response }: { response: Schemas['ReviewResponse'] }) {
  const [hint, setHint] = useState(false)
  const v = response.verification
  const r = response.review
  const overall = v?.overall ?? r?.status ?? 'inconclusive'
  const firstError = v?.first_error_step ?? r?.first_error_step ?? null
  const aiMissing = response.ai_status !== 'ok' || !r

  return (
    <div className="flex flex-col gap-3 text-sm">
      {aiMissing && (
        <p role="note" className="rounded bg-amber-50 px-2 py-1.5 text-amber-900">
          {AI_UNAVAILABLE}
        </p>
      )}
      <p
        data-testid="review-overall"
        className={`rounded px-2 py-1.5 font-medium ${OVERALL[overall].cls}`}
      >
        {OVERALL[overall].text}
        {firstError != null && ` First step to check: step ${firstError}.`}
      </p>
      {v && v.steps.length > 0 && (
        <ol aria-label="Step checks" className="flex flex-col gap-1">
          {v.steps.map((s) => {
            const style = VERDICT_STYLE[s.verdict]
            return (
              <li
                key={s.index}
                data-verdict={s.verdict}
                className="flex items-start gap-2 rounded border-l-4 bg-white px-2 py-1"
                style={{
                  borderLeftColor: style.stroke,
                  borderLeftStyle: style.dash ? 'dashed' : 'solid',
                }}
              >
                <span className="w-12 shrink-0 text-xs text-slate-500">Step {s.index}</span>
                <span className="min-w-0 flex-1">
                  <KatexMath latex={s.latex} />
                  <span className="block text-xs text-slate-600">
                    {style.label}
                    {s.after_error && ' (after an earlier issue)'}
                    {s.domain_warning && ` — ${s.domain_warning}`}
                  </span>
                </span>
              </li>
            )
          })}
        </ol>
      )}
      {r && !aiMissing && (
        <>
          <div>
            <h3 className="font-semibold">What happened</h3>
            <p>{r.explanation}</p>
          </div>
          <div>
            {hint ? (
              <p>
                <span className="font-semibold">Hint: </span>
                {r.hint}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setHint(true)}
                className="min-h-9 rounded border border-slate-300 px-3 hover:bg-slate-50"
              >
                Show hint
              </button>
            )}
          </div>
          <p>
            <span className="font-semibold">Next: </span>
            {RECOMMENDED_ACTION[r.recommended_action]}
          </p>
        </>
      )}
    </div>
  )
}

/** Right-hand panel with the review currently shown (just finished, or picked on the page). */
export function ReviewPanel() {
  const cached = useReviewStore(shownReview)
  const closePanel = useReviewStore((s) => s.closePanel)
  const setDismissed = useReviewStore((s) => s.setDismissed)
  if (!cached) return null
  const hasMarks = cached.response.regions.length > 0
  return (
    <aside
      aria-labelledby="review-title"
      className="fixed inset-y-0 right-0 z-40 flex w-[24rem] max-w-full flex-col border-l bg-slate-50 shadow-2xl"
    >
      <header className="flex items-center gap-2 border-b bg-white p-3">
        <h2 id="review-title" className="flex-1 font-semibold">
          Review
        </h2>
        {hasMarks && (
          <button
            type="button"
            onClick={() => void setDismissed(cached.submission_id, !cached.dismissed)}
            className="min-h-8 rounded px-2 text-sm hover:bg-slate-100"
          >
            {cached.dismissed ? 'Show marks on page' : 'Hide marks on page'}
          </button>
        )}
        <button
          type="button"
          aria-label="Close review"
          onClick={closePanel}
          className="min-h-8 min-w-8 rounded hover:bg-slate-100"
        >
          ✕
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-3">
        <ReviewBody key={cached.submission_id} response={cached.response} />
      </div>
    </aside>
  )
}
