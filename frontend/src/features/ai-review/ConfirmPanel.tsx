import { useEffect, useRef, useState } from 'react'
import type { MathfieldElement } from 'mathlive'
import { KatexMath } from '../../components/KatexMath'
import { MathField } from '../../notebook/equations/MathField'
import { uuidv7 } from '../../notebook/ids'
import type { BBox } from '../../notebook/model'
import { newSolutionBlock } from '../../notebook/objects'
import { useNotebookStore } from '../../notebook/store'
import type { Schemas } from '../../services/api/client'
import { relativeTo, UNCERTAIN_BELOW } from './annotations'
import { useReviewStore } from './reviewStore'

type Region = Schemas['RecognizedRegion']

/** The part of the uploaded crop that one recognized line came from. */
function Thumbnail({ url, crop, line }: { url: string; crop: BBox; line: BBox }) {
  const r = relativeTo(line, crop)
  const [failed, setFailed] = useState(false)
  // A crop that cannot load (revoked blob URL, offline) shows nothing rather than a broken-image icon.
  if (failed || r.w <= 0 || r.h <= 0) return null
  // Page units: y is PAGE_ASPECT times longer than x, so keep the line's real proportions.
  const aspect = (line.w / line.h) * (1 / 1.414)
  return (
    <div
      className="relative w-full overflow-hidden rounded border border-slate-200 bg-white"
      style={{ aspectRatio: String(Math.max(1, Math.min(aspect, 12))) }}
    >
      <img
        src={url}
        alt=""
        onError={() => setFailed(true)}
        className="absolute max-w-none"
        style={{
          width: `${100 / r.w}%`,
          height: `${100 / r.h}%`,
          left: `${(-r.x / r.w) * 100}%`,
          top: `${(-r.y / r.h) * 100}%`,
        }}
      />
    </div>
  )
}

/** Keep Tab inside `root` while it is mounted. */
function useFocusTrap(root: React.RefObject<HTMLElement | null>, onEscape: () => void) {
  const escape = useRef(onEscape)
  useEffect(() => {
    escape.current = onEscape
  })
  useEffect(() => {
    const el = root.current
    if (!el) return
    const previous = document.activeElement as HTMLElement | null
    const focusables = () =>
      Array.from(
        el.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, math-field, [tabindex]:not([tabindex="-1"])',
        ),
      )
    el.querySelector<HTMLElement>('h2')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        escape.current()
        return
      }
      if (e.key !== 'Tab') return
      const list = focusables()
      if (list.length === 0) return
      const first = list[0]
      const last = list[list.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !el.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !el.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      previous?.focus?.()
    }
  }, [root])
}

/**
 * "Check recognition": shown when OCR is unsure. A side panel, not a blocking modal: the
 * notebook stays visible. Escape closes it; edits are kept in the review store.
 */
export function ConfirmPanel({ onRecrop }: { onRecrop?(): void }) {
  const active = useReviewStore((s) => s.active)
  const setEdit = useReviewStore((s) => s.setEdit)
  const setLooksRight = useReviewStore((s) => s.setLooksRight)
  const setConfirmOpen = useReviewStore((s) => s.setConfirmOpen)
  const submitConfirm = useReviewStore((s) => s.submitConfirm)
  const cancel = useReviewStore((s) => s.cancel)
  const panel = useRef<HTMLElement>(null)
  const fields = useRef(new Map<string, MathfieldElement>())
  useFocusTrap(panel, () => setConfirmOpen(false))

  // Create and revoke in the same effect: with useMemo, StrictMode's extra cleanup revoked a URL still in use.
  const blob = active?.upload?.blob
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) return setUrl(null)
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])

  if (!active) return null
  const regions: Region[] = active.regions ?? []

  const typeInstead = () => {
    const pageId = active.pageId
    const nb = useNotebookStore.getState()
    const block = newSolutionBlock(pageId, nb.objects[pageId] ?? [])
    const lines = regions.map((r) => (active.edits[r.id] ?? r.latex).trim()).filter(Boolean)
    if (lines.length > 0) block.payload.steps = lines.map((latex) => ({ id: uuidv7(), latex }))
    nb.addObject(block)
    cancel()
  }
  const recrop = () => {
    cancel()
    onRecrop?.()
  }

  const btn =
    'min-h-9 rounded px-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-blue-600'

  return (
    <aside
      ref={panel}
      role="dialog"
      aria-modal="false"
      aria-labelledby="confirm-title"
      className="fixed inset-y-0 right-0 z-50 flex w-[26rem] max-w-full flex-col border-l bg-white shadow-2xl"
    >
      <header className="flex items-start gap-2 border-b p-3">
        <div className="flex-1">
          <h2 id="confirm-title" tabIndex={-1} className="font-semibold outline-none">
            Check recognition
          </h2>
          <p className="text-sm text-slate-700">
            {active.message ?? "We're not sure we read this correctly. Please check."}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close (your edits are kept)"
          onClick={() => setConfirmOpen(false)}
          className="min-h-8 min-w-8 rounded hover:bg-slate-100"
        >
          ✕
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {regions.length === 0 ? (
          <p className="text-sm text-slate-700">
            We can't show the lines we read right now. You can re-crop the work or type the steps
            instead.
          </p>
        ) : (
          <ol aria-label="Recognized lines" className="flex flex-col gap-3">
            {regions.map((r, i) => {
              const uncertain = r.confidence < UNCERTAIN_BELOW
              const ok = active.looksRight[r.id]
              return (
                <li
                  key={r.id}
                  data-testid="recognized-line"
                  className={`rounded-lg border p-2 ${uncertain ? 'border-amber-400 bg-amber-50/50' : 'border-slate-200'}`}
                >
                  <div className="mb-1 flex items-center gap-2 text-xs text-slate-600">
                    <span className="font-medium">Line {i + 1}</span>
                    {uncertain && (
                      <span className="rounded bg-amber-200 px-1.5 py-0.5 font-semibold text-amber-900">
                        uncertain
                      </span>
                    )}
                    {ok && <span className="text-green-700">✓ looks right</span>}
                  </div>
                  {url && active.upload && (
                    <Thumbnail url={url} crop={active.upload.bbox} line={r.bbox} />
                  )}
                  <div className="my-1 text-sm">
                    <span className="mr-1 text-slate-500">We read:</span>
                    <KatexMath latex={r.latex} label={`We read line ${i + 1} as ${r.latex}`} />
                  </div>
                  <MathField
                    value={active.edits[r.id] ?? r.latex}
                    label={`Line ${i + 1}`}
                    onChange={(latex) => {
                      setEdit(r.id, latex)
                      if (ok) setLooksRight(r.id, false)
                    }}
                    onMount={(mf) => {
                      if (mf) fields.current.set(r.id, mf)
                      else fields.current.delete(r.id)
                    }}
                  />
                  <div className="mt-1 flex gap-1">
                    <button
                      type="button"
                      aria-pressed={!!ok}
                      onClick={() => setLooksRight(r.id, true)}
                      className={`${btn} ${ok ? 'bg-green-100 text-green-800' : 'hover:bg-slate-100'}`}
                    >
                      Looks right
                    </button>
                    <button
                      type="button"
                      onClick={() => fields.current.get(r.id)?.focus()}
                      className={`${btn} hover:bg-slate-100`}
                    >
                      Fix it
                    </button>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>

      <footer className="flex flex-wrap gap-2 border-t p-3">
        {regions.length > 0 && (
          <button
            type="button"
            onClick={() => void submitConfirm()}
            className={`${btn} bg-blue-600 px-3 text-white hover:bg-blue-700`}
          >
            Continue checking
          </button>
        )}
        <button type="button" onClick={recrop} className={`${btn} hover:bg-slate-100`}>
          Re-crop
        </button>
        <button type="button" onClick={typeInstead} className={`${btn} hover:bg-slate-100`}>
          Type instead
        </button>
      </footer>
    </aside>
  )
}
