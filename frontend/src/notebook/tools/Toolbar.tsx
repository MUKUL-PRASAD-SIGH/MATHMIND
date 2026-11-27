import type { ReactNode } from 'react'
import type { InkTool, ToolName } from '../model'
import { useNotebookStore } from '../store'
import { useUndoShortcuts } from './shortcuts'

const TOOLS: { id: ToolName; label: string; icon: string }[] = [
  { id: 'pen', label: 'Pen', icon: '✒' },
  { id: 'pencil', label: 'Pencil', icon: '✏' },
  { id: 'highlighter', label: 'Highlighter', icon: '▮' },
  { id: 'eraser', label: 'Eraser', icon: '⌫' },
  { id: 'lasso', label: 'Lasso select', icon: '◌' },
  { id: 'rect', label: 'Rectangle select', icon: '⬚' },
]

const SWATCHES = ['#1f2937', '#2563eb', '#dc2626', '#16a34a', '#facc15', '#a855f7']

const isInk = (t: ToolName): t is InkTool => t === 'pen' || t === 'pencil' || t === 'highlighter'

export interface ToolbarProps {
  orientation?: 'horizontal' | 'vertical'
  /** Large touch targets (≥ 44 px) for tablet and phone. */
  large?: boolean
  children?: ReactNode
}

export function Toolbar({ orientation = 'horizontal', large = false, children }: ToolbarProps) {
  const tool = useNotebookStore((s) => s.tool)
  const setTool = useNotebookStore((s) => s.setTool)
  const settings = useNotebookStore((s) => (isInk(s.tool) ? s.toolSettings[s.tool] : null))
  const setToolSettings = useNotebookStore((s) => s.setToolSettings)
  const undo = useNotebookStore((s) => s.undo)
  const redo = useNotebookStore((s) => s.redo)
  useNotebookStore((s) => s.historyVersion) // re-render when history changes
  const canUndo = useNotebookStore.getState().canUndo()
  const canRedo = useNotebookStore.getState().canRedo()
  useUndoShortcuts({ undo: () => undo(), redo: () => redo() })

  const vertical = orientation === 'vertical'
  const btn = `${large ? 'min-h-11 min-w-11' : 'min-h-9 min-w-9'} rounded-md px-2 text-sm font-medium
    hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-40
    aria-pressed:bg-blue-600 aria-pressed:text-white`

  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      aria-orientation={orientation}
      className={`flex items-center gap-1 bg-white p-1 shadow-sm ${
        vertical ? 'flex-col' : large ? 'flex-row overflow-x-auto' : 'flex-row flex-wrap'
      }`}
    >
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={btn}
          aria-pressed={tool === t.id}
          aria-label={t.label}
          title={t.label}
          onClick={() => setTool(t.id)}
        >
          <span aria-hidden>{t.icon}</span>
        </button>
      ))}

      <span className={vertical ? 'h-px w-8 bg-slate-200' : 'h-6 w-px bg-slate-200'} />

      {settings && isInk(tool) && (
        <fieldset className={`flex shrink-0 items-center gap-1 ${vertical ? 'flex-col' : ''}`}>
          <legend className="sr-only">Colour and width</legend>
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={settings.color === c}
              onClick={() => setToolSettings(tool, { color: c })}
              className={`${large ? 'size-9' : 'size-6'} rounded-full border-2 aria-pressed:border-slate-900 border-white ring-1 ring-slate-300`}
              style={{ background: c }}
            />
          ))}
          <input
            type="color"
            aria-label="Custom colour"
            value={settings.color}
            onChange={(e) => setToolSettings(tool, { color: e.target.value })}
            className={`${large ? 'size-9' : 'size-7'} cursor-pointer`}
          />
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <span className="sr-only">Width</span>
            <input
              type="range"
              aria-label="Width"
              min={tool === 'highlighter' ? 6 : 0.5}
              max={tool === 'highlighter' ? 40 : 12}
              step={0.5}
              value={settings.width}
              onChange={(e) => setToolSettings(tool, { width: Number(e.target.value) })}
              className={vertical ? 'w-16' : 'w-20'}
            />
          </label>
        </fieldset>
      )}

      <span className={vertical ? 'h-px w-8 bg-slate-200' : 'h-6 w-px bg-slate-200'} />

      <button
        type="button"
        className={btn}
        aria-label="Undo"
        title="Undo (Ctrl+Z)"
        disabled={!canUndo}
        onClick={() => undo()}
      >
        ↶
      </button>
      <button
        type="button"
        className={btn}
        aria-label="Redo"
        title="Redo (Ctrl+Shift+Z)"
        disabled={!canRedo}
        onClick={() => redo()}
      >
        ↷
      </button>
      {children}
    </div>
  )
}
