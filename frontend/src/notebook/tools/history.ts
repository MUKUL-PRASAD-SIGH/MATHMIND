import type { BBox, NotebookObject, Stroke } from '../model'

/** Undoable edits. Each carries the data needed to reverse it. */
export type Command =
  | { type: 'addStrokes'; pageId: string; strokes: Stroke[] }
  | { type: 'deleteStrokes'; pageId: string; strokes: Stroke[] }
  | { type: 'addObject'; pageId: string; object: NotebookObject }
  | {
      type: 'moveObjects'
      pageId: string
      strokeIds: string[]
      objectIds: string[]
      dx: number
      dy: number
    }
  | { type: 'resizeObject'; pageId: string; id: string; from: BBox; to: BBox }
  | { type: 'deleteObjects'; pageId: string; objects: NotebookObject[] }

export const HISTORY_CAP = 200

interface Stacks<C> {
  undo: C[]
  redo: C[]
}

/** Per-page undo/redo stacks, each capped at `cap` entries (oldest dropped first). */
export class History<C = Command> {
  private stacks = new Map<string, Stacks<C>>()
  private readonly cap: number

  constructor(cap = HISTORY_CAP) {
    this.cap = cap
  }

  private get(pageId: string): Stacks<C> {
    let s = this.stacks.get(pageId)
    if (!s) {
      s = { undo: [], redo: [] }
      this.stacks.set(pageId, s)
    }
    return s
  }

  /** Record a command that has just been applied. Clears the redo stack. */
  push(pageId: string, cmd: C): void {
    const s = this.get(pageId)
    s.undo.push(cmd)
    if (s.undo.length > this.cap) s.undo.splice(0, s.undo.length - this.cap)
    s.redo = []
  }

  /** Pop the command to revert, moving it to the redo stack. */
  undo(pageId: string): C | undefined {
    const s = this.get(pageId)
    const cmd = s.undo.pop()
    if (cmd !== undefined) s.redo.push(cmd)
    return cmd
  }

  /** Pop the command to re-apply, moving it back to the undo stack. */
  redo(pageId: string): C | undefined {
    const s = this.get(pageId)
    const cmd = s.redo.pop()
    if (cmd !== undefined) s.undo.push(cmd)
    return cmd
  }

  canUndo(pageId: string): boolean {
    return (this.stacks.get(pageId)?.undo.length ?? 0) > 0
  }

  canRedo(pageId: string): boolean {
    return (this.stacks.get(pageId)?.redo.length ?? 0) > 0
  }

  size(pageId: string): number {
    return this.stacks.get(pageId)?.undo.length ?? 0
  }

  clear(): void {
    this.stacks.clear()
  }
}
