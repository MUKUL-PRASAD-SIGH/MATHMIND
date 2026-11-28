import { useEffect, useRef } from 'react'

type Katex = typeof import('katex')
let loading: Promise<Katex> | null = null

/** KaTeX is loaded on demand with its CSS (fonts are bundled, so it works offline). */
function loadKatex(): Promise<Katex> {
  loading ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(
    ([k]) => (k as unknown as { default?: Katex }).default ?? k,
  )
  return loading
}

/** Read-only maths. Rendered into the element by KaTeX with `trust: false` (no raw HTML). */
export function KatexMath({ latex, label }: { latex: string; label?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let cancelled = false
    void loadKatex().then((katex) => {
      if (cancelled || !ref.current) return
      katex.render(latex, ref.current, {
        trust: false,
        throwOnError: false,
        strict: 'ignore',
        output: 'htmlAndMathml',
      })
    })
    return () => {
      cancelled = true
    }
  }, [latex])
  return (
    <span ref={ref} aria-label={label} className="inline-block min-h-6">
      {latex}
    </span>
  )
}
