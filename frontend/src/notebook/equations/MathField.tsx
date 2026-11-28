import { useEffect, useLayoutEffect, useRef } from 'react'
import type { MathfieldElement } from 'mathlive'
import { loadMathLive } from './mathlive'

export interface MathFieldProps {
  value: string
  label: string
  virtualKeyboard?: boolean
  onChange(latex: string): void
  /** Capture-phase keydown, before MathLive handles the key. */
  onKeyDown?(e: KeyboardEvent, mf: MathfieldElement): void
  onMount?(mf: MathfieldElement | null): void
}

/** One editable `<math-field>`, created imperatively once MathLive has loaded. */
export function MathField(props: MathFieldProps) {
  const host = useRef<HTMLDivElement>(null)
  const field = useRef<MathfieldElement | null>(null)
  const latest = useRef(props)
  useLayoutEffect(() => {
    latest.current = props
  })
  const { value, label } = props

  useEffect(() => {
    let cancelled = false
    let mf: MathfieldElement | null = null
    const onInput = () => mf && latest.current.onChange(mf.value)
    const onKeyDown = (e: KeyboardEvent) => mf && latest.current.onKeyDown?.(e, mf)
    void loadMathLive().then((MF) => {
      if (cancelled || !host.current) return
      mf = new MF()
      mf.value = latest.current.value
      mf.setAttribute('aria-label', latest.current.label)
      mf.mathVirtualKeyboardPolicy = latest.current.virtualKeyboard ? 'auto' : 'manual'
      mf.className = 'block w-full rounded border border-slate-300 bg-white px-1 text-lg'
      mf.addEventListener('input', onInput)
      mf.addEventListener('keydown', onKeyDown, { capture: true })
      host.current.appendChild(mf)
      field.current = mf
      latest.current.onMount?.(mf)
    })
    return () => {
      cancelled = true
      mf?.removeEventListener('input', onInput)
      mf?.removeEventListener('keydown', onKeyDown, { capture: true })
      mf?.remove()
      field.current = null
      latest.current.onMount?.(null)
    }
  }, [])

  useEffect(() => {
    field.current?.setAttribute('aria-label', label)
  }, [label])

  // External changes (e.g. undo of the whole block) flow back into an unfocused field.
  useEffect(() => {
    const mf = field.current
    if (mf && mf.value !== value && document.activeElement !== mf) mf.value = value
  }, [value])

  return <div ref={host} className="min-w-0 flex-1" />
}
