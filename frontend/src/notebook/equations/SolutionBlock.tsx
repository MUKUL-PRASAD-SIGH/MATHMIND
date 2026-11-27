import { useEffect, useLayoutEffect, useRef } from 'react'
import type { MathfieldElement } from 'mathlive'
import { SubmissionStatus } from '../../features/ai-review/SubmissionStatus'
import { useSubmission } from '../../features/ai-review/useSubmission'
import { api } from '../../services/api/client'
import { uuidv7 } from '../ids'
import type { EquationObject, SolutionStep } from '../model'
import { ObjectFrame } from '../pages/ObjectFrame'
import { useNotebookStore } from '../store'
import { loadMathLive } from './mathlive'

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

interface StepProps {
  step: SolutionStep
  index: number
  virtualKeyboard: boolean
  onChange(id: string, latex: string): void
  onKey(e: KeyboardEvent, id: string, mf: MathfieldElement): void
  register(id: string, mf: MathfieldElement | null): void
}

/** One `<math-field>`, created imperatively once MathLive has loaded. */
function MathStep(props: StepProps) {
  const host = useRef<HTMLDivElement>(null)
  const field = useRef<MathfieldElement | null>(null)
  const latest = useRef(props)
  useLayoutEffect(() => {
    latest.current = props
  })
  const { step, index } = props

  useEffect(() => {
    let cancelled = false
    let mf: MathfieldElement | null = null
    const onInput = () => mf && latest.current.onChange(step.id, mf.value)
    const onKeyDown = (e: KeyboardEvent) => mf && latest.current.onKey(e, step.id, mf)
    void loadMathLive().then((MF) => {
      if (cancelled || !host.current) return
      mf = new MF()
      mf.value = latest.current.step.latex
      mf.setAttribute('aria-label', `Step ${latest.current.index + 1}`)
      mf.mathVirtualKeyboardPolicy = latest.current.virtualKeyboard ? 'auto' : 'manual'
      mf.className = 'block w-full rounded border border-slate-200 px-1 text-lg'
      mf.addEventListener('input', onInput)
      mf.addEventListener('keydown', onKeyDown, { capture: true })
      host.current.appendChild(mf)
      field.current = mf
      latest.current.register(step.id, mf)
    })
    return () => {
      cancelled = true
      mf?.removeEventListener('input', onInput)
      mf?.removeEventListener('keydown', onKeyDown, { capture: true })
      mf?.remove()
      field.current = null
      latest.current.register(step.id, null)
    }
  }, [step.id])

  useEffect(() => {
    field.current?.setAttribute('aria-label', `Step ${index + 1}`)
  }, [index])

  // External changes (e.g. undo of the whole block) flow back into an unfocused field.
  useEffect(() => {
    const mf = field.current
    if (mf && mf.value !== step.latex && document.activeElement !== mf) mf.value = step.latex
  }, [step.latex])

  return (
    <li className="flex items-center gap-2">
      <span aria-hidden className="w-6 shrink-0 text-right text-xs text-slate-400">
        {index + 1}
      </span>
      <div ref={host} className="min-w-0 flex-1" />
    </li>
  )
}

/**
 * Keyboard-first solution: one MathLive field per step. Enter adds a step below, Backspace on
 * an empty step removes it, ↑/↓ move between steps. "Check these steps" submits them.
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
  const check = useSubmission()
  const steps = object.payload.steps

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
      }
    } else fields.current.delete(id)
  }

  const onChange = (id: string, latex: string) =>
    setSteps(latest().payload.steps.map((s) => (s.id === id ? { ...s, latex } : s)))

  const onKey = (e: KeyboardEvent, id: string, mf: MathfieldElement) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return
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
    if (filled.length === 0) return check.fail('Write at least one step first.')
    void check.submit(() =>
      api.submitTyped({
        page_id: object.page_id,
        problem_id: object.payload.problemId ?? null,
        steps: filled.map((s) => ({ latex: s.latex, region_id: null })),
      }),
    )
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
            disabled={check.state.kind === 'sending'}
            className="min-h-9 rounded bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Check these steps
          </button>
          <SubmissionStatus state={check.state} />
        </div>
      </div>
    </ObjectFrame>
  )
}
