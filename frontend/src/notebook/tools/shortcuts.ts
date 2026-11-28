import { useEffect } from 'react'

/** True when the key event belongs to a text/maths field that handles its own keys. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    tag === 'MATH-FIELD' ||
    target.isContentEditable
  )
}

export interface UndoHandlers {
  undo(): void
  redo(): void
}

/** Ctrl/Cmd+Z → undo, Ctrl/Cmd+Shift+Z or Ctrl+Y → redo. */
export function useUndoShortcuts({ undo, redo }: UndoHandlers): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || isEditableTarget(e.target)) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((key === 'z' && e.shiftKey) || (key === 'y' && e.ctrlKey)) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])
}
