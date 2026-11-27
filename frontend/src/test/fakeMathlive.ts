/**
 * Minimal stand-in for MathLive's <math-field> in jsdom (the real one needs layout APIs).
 * It behaves like a plain one-line input: printable keys append, Backspace deletes, and
 * `insert` commands append their LaTeX. Keys the app handled (defaultPrevented) are ignored.
 */
export class MathfieldElement extends HTMLElement {
  static fontsDirectory: string | null = './fonts'
  static soundsDirectory: string | null = './sounds'
  mathVirtualKeyboardPolicy = 'auto'
  #value = ''

  constructor() {
    super()
    this.tabIndex = 0
    this.addEventListener('keydown', (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey) return
      if (e.key.length === 1) this.#value += e.key
      else if (e.key === 'Backspace') this.#value = this.#value.slice(0, -1)
      else return
      this.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  get value(): string {
    return this.#value
  }

  set value(v: string) {
    this.#value = v
  }

  executeCommand(cmd: unknown): boolean {
    if (Array.isArray(cmd) && cmd[0] === 'insert') {
      this.#value += String(cmd[1]).replace(/#[@?0]/g, '')
      this.dispatchEvent(new Event('input', { bubbles: true }))
    }
    return true
  }
}

if (!customElements.get('math-field')) customElements.define('math-field', MathfieldElement)
