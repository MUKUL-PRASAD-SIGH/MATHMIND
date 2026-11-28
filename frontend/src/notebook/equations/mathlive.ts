import type { MathfieldElement } from 'mathlive'

let loading: Promise<typeof MathfieldElement> | null = null

/**
 * Lazy-load MathLive (keeps it out of the initial bundle). Fonts come from the bundled
 * `mathlive/fonts.css` so equations render offline; MathLive must not fetch fonts or sounds
 * itself.
 */
export function loadMathLive(): Promise<typeof MathfieldElement> {
  loading ??= Promise.all([import('mathlive'), import('mathlive/fonts.css')]).then(([ml]) => {
    ml.MathfieldElement.fontsDirectory = null
    ml.MathfieldElement.soundsDirectory = null
    return ml.MathfieldElement
  })
  return loading
}
