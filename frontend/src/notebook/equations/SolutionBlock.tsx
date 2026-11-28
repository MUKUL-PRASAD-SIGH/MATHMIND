import { useRef, useState } from 'react'
import type { MathfieldElement } from 'mathlive'
import { shownReview, useReviewStore } from '../../features/ai-review/reviewStore'
import { SubmissionStatus } from '../../features/ai-review/SubmissionStatus'
import { api } from '../../services/api/client'
import { uuidv7 } from '../ids'
import type { EquationObject, SolutionStep } from '../model'
import { ObjectFrame } from '../pages/ObjectFrame'
import { useNotebookStore } from '../store'
import { MathField } from './MathField'

const SYMBOLS: { label: string; text: string; latex: string }[] = [
  { label: 'Fraction', text: 'a⁄b', latex: '\\frac{#@}{#?}' },
  { label: 'Square root', text: '√', latex: '\\sqrt{#0}' },
  { label: 'Power', text: 'xⁿ', latex: '#@^{#?}' },
  { label: 'Subscript', text: 'xₙ', latex: '#@_{#?}' },
  { label: 'Pi', text: 'π', latex: '\\pi' },
  { label: 'Plus or minus', text: '±', latex: '\\pm' },
  { label: 'Less than or equal', text: '≤', latex: '\\le' },
  { label: 'Greater than or equal', text: '≥', latex: '\\ge' },
  { label: 'Integral', text: '∫', latex: '\\int_{#?}^{#?}' },
  { label: 'Sum', text: 'Σ', latex: '\\sum_{#?}^{#?}' },
  { label: 'Matrix', text: '[ ]', latex: '\\begin{pmatrix}#0 & #?\\\\ #? & #?\\end{pmatrix}' },
]

const VERDICT_MARK: Record<string, { icon: string; label: string; cls: string }> = {
  supported: { icon: '✓', label: 'supported', cls: 'text-green-700' },
  incorrect: { icon: '✗', label: 'not supported by the previous step', cls: 'text-red-700' },
  inconclusive: { icon: '?', label: 'inconclusive', cls: 'text-slate-500' },
}

interface StepProps {
  step: SolutionStep
  index: number
  virtualKeyboard: boolean
  verdict?: string
  onChange(id: string, latex: string): void
  onKey(e: KeyboardEvent, id: string, mf: MathfieldElement): void
  register(id: string, mf: MathfieldElement | null): void
}

function MathStep({ step, index, virtualKeyboard, verdict, onChange, onKey, register }: StepProps) {
  const mark = verdict ? VERDICT_MARK[verdict] : undefined
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden className="w-6 shrink-0 text-right text-xs text-slate-500">
        {index + 1}
      </span>
      <MathField
        value={step.latex}
        label={`Step ${index + 1}`}
        virtualKeyboard={virtualKeyboard}
        onChange={(latex) => onChange(step.id, latex)}
        onKeyDown={(e, mf) => onKey(e, step.id, mf)}
        onMount={(mf) => register(step.id, mf)}
      />
      {mark && (
        <span className={`w-5 shrink-0 text-center font-bold ${mark.cls}`} title={mark.label}>
          <span aria-hidden>{mark.icon}</span>
          <span className="sr-only">{`Step ${index + 1}: ${mark.label}`}</span>
        </span>
      )}
    </li>
  )
}

/**
 * Keyboard-first solution: one MathLive field per step. Enter adds a step below, Backspace on
 * an empty step removes it, ↑/↓ move between steps. "Review my solution" submits them.
 */
export function SolutionBlock({
  object,
  virtualKeyboard = false,
}: {
  object: EquationObject
  virtualKeyboard?: boolean
}) {
  const updateObjectPayload = useNotebookStore((s) => s.updateObjectPayload)
  const fields = useRef(new Map<string, MathfieldElement>())
  const lastFocused = useRef<string | null>(null)
  const pendingFocus = useRef<string | null>(null)
  /** Keys typed after Enter, before the new step's field exists, go into the new step. */
  const typedAhead = useRef('')
  const [hint, setHint] = useState<string | null>(null)
  const steps = object.payload.steps
  const active = useReviewStore((s) => (s.active?.origin === object.id ? s.active : null))
  const startReview = useReviewStore((s) => s.start)
  const [submitted, setSubmitted] = useState<{ ids: string[]; submissionId: string | null }>({
    ids: [],
    submissionId: null,
  })
  const result = useReviewStore((s) => {
    if (active?.result) return active.result
    const cached = submitted.submissionId
      ? shownReview({ byPage: s.byPage, shownId: submitted.submissionId })
      : null
    return cached?.response ?? null
  })
  const verdicts = new Map<string, string>()
  result?.verification?.steps.forEach((v) => {
    const id = submitted.ids[v.index - 1]
    if (id) verdicts.set(id, v.verdict)
  })

  /** Latest copy from the store, so rapid key presses never work on a stale payload. */
  const latest = (): EquationObject =>
    (useNotebookStore.getState().objects[object.page_id]?.find((o) => o.id === object.id) as
      EquationObject | undefined) ?? object

  const setSteps = (next: SolutionStep[]) => {
    const o = latest()
    updateObjectPayload(o, { ...o.payload, steps: next })
  }

  const focusStep = (id: string | undefined) => {
    if (!id) return
    const mf = fields.current.get(id)
    if (mf) mf.focus()
    else pendingFocus.current = id
  }

  const register = (id: string, mf: MathfieldElement | null) => {
    if (mf) {
      fields.current.set(id, mf)
      mf.addEventListener('focus', () => (lastFocused.current = id))
      if (pendingFocus.current === id) {
        pendingFocus.current = null
        mf.focus()
        if (typedAhead.current) {
          mf.executeCommand(['insert', typedAhead.current])
          typedAhead.current = ''
          onChange(id, mf.value)
        }
      }
    } else fields.current.delete(id)
  }

  const onChange = (id: string, latex: string) =>
    setSteps(latest().payload.steps.map((s) => (s.id === id ? { ...s, latex } : s)))

  const onKey = (e: KeyboardEvent, id: string, mf: MathfieldElement) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    if (pendingFocus.current && e.key.length === 1) {
      e.preventDefault()
      e.stopPropagation()
      typedAhead.current += e.key
      return
    }
    const list = latest().payload.steps
    const i = list.findIndex((s) => s.id === id)
    const stop = () => {
      e.preventDefault()
      e.stopPropagation()
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      stop()
      const step = { id: uuidv7(), latex: '' }
      setSteps([...list.slice(0, i + 1), step, ...list.slice(i + 1)])
      focusStep(step.id)
    } else if (e.key === 'Backspace' && mf.value === '' && list.length > 1) {
      stop()
      setSteps(list.filter((s) => s.id !== id))
      focusStep(list[i - 1]?.id ?? list[i + 1]?.id)
    } else if (e.key === 'ArrowUp' && !e.shiftKey && i > 0) {
      stop()
      focusStep(list[i - 1].id)
    } else if (e.key === 'ArrowDown' && !e.shiftKey && i < list.length - 1) {
      stop()
      focusStep(list[i + 1].id)
    }
  }

  const insertSymbol = (latex: string) => {
    const list = latest().payload.steps
    const id = lastFocused.current ?? list[list.length - 1]?.id
    const mf = id ? fields.current.get(id) : undefined
    if (!mf) return
    mf.executeCommand(['insert', latex, { focus: true, selectionMode: 'placeholder' }])
    mf.focus()
    onChange(id!, mf.value)
  }

  const submit = () => {
    const filled = latest().payload.steps.filter((s) => s.latex.trim() !== '')
    if (filled.length === 0) return setHint('Write at least one step first.')
    setHint(null)
    setSubmitted({ ids: filled.map((s) => s.id), submissionId: null })
    void startReview({
      pageId: object.page_id,
      origin: object.id,
      send: async () => {
        const res = await api.submitTyped({
          page_id: object.page_id,
          problem_id: object.payload.problemId ?? null,
          steps: filled.map((s) => ({ latex: s.latex, region_id: null })),
        })
        setSubmitted((prev) => ({ ...prev, submissionId: res.submission_id }))
        return res
      },
    })
  }

  const btn =
    'min-h-8 min-w-8 rounded border border-slate-200 bg-white px-1.5 text-sm hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600'

  return (
    <ObjectFrame object={object} title="Solution">
      <div className="flex flex-col gap-2 p-2">
        <ol aria-label="Solution steps" className="flex flex-col gap-1">
          {steps.map((step, index) => (
            <MathStep
              key={step.id}
              step={step}
              index={index}
              virtualKeyboard={virtualKeyboard}
              verdict={verdicts.get(step.id)}
              onChange={onChange}
              onKey={onKey}
              register={register}
            />
          ))}
        </ol>
        <div role="toolbar" aria-label="Maths symbols" className="flex flex-wrap gap-1">
          {SYMBOLS.map((s) => (
            <button
              key={s.label}
              type="button"
              className={btn}
              aria-label={s.label}
              title={s.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertSymbol(s.latex)}
            >
              {s.text}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={active?.phase === 'sending' || active?.phase === 'working'}
            className="min-h-9 rounded bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Review my solution
          </button>
          {hint ? (
            <span role="status" className="text-sm text-red-700">
              {hint}
            </span>
          ) : (
            active && <SubmissionStatus review={active} />
          )}
        </div>
      </div>
    </ObjectFrame>
  )
}
