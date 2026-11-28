import { useState } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { BBox, NotebookObject } from '../model'
import { useNotebookStore } from '../store'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Keep the bbox on the page: clamp a proposed move. */
function clampMove(b: BBox, dx: number, dy: number) {
  return { dx: clamp(dx, -b.x, 1 - b.w - b.x), dy: clamp(dy, -b.y, 1 - b.y - Math.min(b.h, 1)) }
}

function pageRect(el: Element): DOMRect | null {
  return el.closest('[data-page-id]')?.getBoundingClientRect() ?? null
}

export interface ObjectFrameProps {
  object: NotebookObject
  title: string
  children: ReactNode
  /** Fixed height from the bbox (images); otherwise the content sets the height. */
  fixedHeight?: boolean
  /** Corner handle that scales the object keeping its aspect ratio (images). */
  resizable?: boolean
}

/**
 * Positions a page object at its bbox and gives it a move handle (drag or arrow keys) and a
 * delete button. Moves, resizes and deletes go through the undo stack.
 */
export function ObjectFrame({ object, title, children, fixedHeight, resizable }: ObjectFrameProps) {
  const execute = useNotebookStore((s) => s.execute)
  const [drag, setDrag] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null)
  const [scale, setScale] = useState<{ x: number; k: number } | null>(null)
  const b = object.bbox

  const move = (dx: number, dy: number) => {
    const m = clampMove(b, dx, dy)
    if (m.dx === 0 && m.dy === 0) return
    execute({
      type: 'moveObjects',
      pageId: object.page_id,
      strokeIds: [],
      objectIds: [object.id],
      ...m,
    })
  }

  const onHandleDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDrag({ x: e.clientX, y: e.clientY, dx: 0, dy: 0 })
  }
  const onHandleMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag) return
    const r = pageRect(e.currentTarget)
    if (!r || r.width === 0) return
    const m = clampMove(b, (e.clientX - drag.x) / r.width, (e.clientY - drag.y) / r.height)
    setDrag({ ...drag, ...m })
  }
  const onHandleUp = () => {
    if (drag && (drag.dx !== 0 || drag.dy !== 0)) move(drag.dx, drag.dy)
    setDrag(null)
  }
  const onHandleKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.05 : 0.01
    const d = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[e.key]
    if (!d) return
    e.preventDefault()
    move(d[0], d[1])
  }

  const onResizeDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setScale({ x: e.clientX, k: 1 })
  }
  const onResizeMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!scale) return
    const r = pageRect(e.currentTarget)
    if (!r || r.width === 0) return
    const w = clamp(b.w + (e.clientX - scale.x) / r.width, 0.05, 1 - b.x)
    const k = Math.min(w / b.w, (1 - b.y) / b.h)
    setScale({ ...scale, k })
  }
  const onResizeUp = () => {
    if (scale && scale.k !== 1) {
      execute({
        type: 'resizeObject',
        pageId: object.page_id,
        id: object.id,
        from: b,
        to: { ...b, w: b.w * scale.k, h: b.h * scale.k },
      })
    }
    setScale(null)
  }

  const k = scale?.k ?? 1
  const iconBtn =
    'min-h-7 min-w-7 rounded text-xs text-slate-600 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-blue-600'

  return (
    <div
      role="group"
      aria-label={title}
      data-object-id={object.id}
      className="pointer-events-auto absolute flex flex-col rounded-md border border-slate-300 bg-white/95 shadow-sm"
      style={{
        left: `${(b.x + (drag?.dx ?? 0)) * 100}%`,
        top: `${(b.y + (drag?.dy ?? 0)) * 100}%`,
        width: `${b.w * k * 100}%`,
        height: fixedHeight ? `${b.h * k * 100}%` : undefined,
      }}
    >
      <div className="flex items-center gap-1 border-b border-slate-200 px-1 text-xs text-slate-500">
        <button
          type="button"
          aria-label={`Move ${title}`}
          title="Drag, or use the arrow keys, to move"
          className={`${iconBtn} cursor-move touch-none`}
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={() => setDrag(null)}
          onKeyDown={onHandleKey}
        >
          ⠿
        </button>
        <span className="flex-1 truncate">{title}</span>
        <button
          type="button"
          aria-label={`Delete ${title}`}
          className={iconBtn}
          onClick={() =>
            execute({ type: 'deleteObjects', pageId: object.page_id, objects: [object] })
          }
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
      {resizable && (
        <button
          type="button"
          aria-label={`Resize ${title}`}
          className="absolute -right-2 -bottom-2 size-5 cursor-nwse-resize touch-none rounded-full border-2 border-white bg-blue-600"
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={() => setScale(null)}
        />
      )}
    </div>
  )
}
