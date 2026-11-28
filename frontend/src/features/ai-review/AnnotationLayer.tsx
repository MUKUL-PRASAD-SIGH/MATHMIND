import { useState } from 'react'
import type { CachedReview } from '../../notebook/model'
import { annotationsFor, VERDICT_STYLE } from './annotations'
import { useReviewStore } from './reviewStore'

const EMPTY: CachedReview[] = []
const PAD = 0.004

/**
 * Outlines for the newest visible review on this page: green supported, red incorrect,
 * grey dashed inconclusive, plus a marker on the first error. Separate from the ink: it
 * reads cached reviews only and never changes strokes.
 */
export function AnnotationLayer({ pageId }: { pageId: string }) {
  const list = useReviewStore((s) => s.byPage[pageId] ?? EMPTY)
  const show = useReviewStore((s) => s.show)
  const [callout, setCallout] = useState(false)
  const latest = [...list].reverse().find((r) => !r.dismissed && r.response.regions.length > 0)
  if (!latest) return null
  const marks = annotationsFor(latest.response)
  if (marks.length === 0) return null
  const first = marks.find((m) => m.firstError)
  const hint = latest.response.ai_status === 'ok' ? latest.response.review?.hint : undefined

  return (
    <>
      <svg
        data-testid="review-annotations"
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        aria-hidden
      >
        {marks.map((m) => {
          const style = VERDICT_STYLE[m.verdict]
          return (
            <rect
              key={m.regionId}
              data-verdict={m.verdict}
              data-region-id={m.regionId}
              x={m.bbox.x - PAD}
              y={m.bbox.y - PAD}
              width={m.bbox.w + 2 * PAD}
              height={m.bbox.h + 2 * PAD}
              rx={0.004}
              fill={m.verdict === 'incorrect' ? 'rgb(185 28 28 / 0.06)' : 'none'}
              stroke={style.stroke}
              strokeWidth={2}
              strokeDasharray={m.verdict === 'inconclusive' ? '6 4' : undefined}
              vectorEffect="non-scaling-stroke"
            />
          )
        })}
      </svg>
      {first && (
        <div
          className="absolute z-10"
          style={{
            left: `${Math.min(first.bbox.x + first.bbox.w, 0.97) * 100}%`,
            top: `${first.bbox.y * 100}%`,
          }}
        >
          <button
            type="button"
            aria-expanded={callout}
            aria-label={`Step ${first.step} needs another look`}
            onClick={() => {
              setCallout((c) => !c)
              show(latest.submission_id)
            }}
            className="-translate-x-1/2 -translate-y-1/2 rounded-full bg-red-700 px-1.5 text-xs font-bold text-white shadow ring-2 ring-white"
          >
            !
          </button>
          {callout && (
            <div
              role="note"
              className="mt-1 w-56 -translate-x-1/2 rounded-md bg-white p-2 text-xs text-slate-800 shadow-lg ring-1 ring-slate-200"
            >
              <p className="font-semibold">Step {first.step}</p>
              <p>{hint ?? first.reason}</p>
            </div>
          )}
        </div>
      )}
    </>
  )
}
