import { useEffect, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { PAGE_ASPECT } from '../model'
import { selectionBBox, useNotebookStore } from '../store'
import { isEditableTarget } from './shortcuts'

export type ReviewKind = 'review' | 'explain'

export interface SelectionOverlayProps {
  pageId: string
  /** Live move offset while dragging (page-normalized), null when idle. */
  onPreview(offset: { dx: number; dy: number } | null): void
  /** Hand the selection to the review flow. Menu items are hidden without it. */
  onReview?(kind: ReviewKind): void
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const HANDLE = 0.012

/**
 * SVG layer above the ink, in page-normalized units (viewBox 0..1). Only the selection box
 * takes pointer events: drag it to move the selection. Shows the selection context menu.
 */
export function SelectionOverlay({ pageId, onPreview, onReview }: SelectionOverlayProps) {
  const selection = useNotebookStore((s) => (s.selection?.pageId === pageId ? s.selection : null))
  const strokes = useNotebookStore((s) => s.strokes[pageId])
  const objects = useNotebookStore((s) => s.objects[pageId])
  const box = selection
    ? selectionBBox(
        { strokes: { [pageId]: strokes ?? [] }, objects: { [pageId]: objects ?? [] } },
        selection,
      )
    : null
  const moveSelection = useNotebookStore((s) => s.moveSelection)
  const deleteSelection = useNotebookStore((s) => s.deleteSelection)
  const copySelection = useNotebookStore((s) => s.copySelection)
  const clearSelection = useNotebookStore((s) => s.clearSelection)
  const [drag, setDrag] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null)

  useEffect(() => {
    if (!selection) return
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      if (e.key === 'Escape') clearSelection()
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteSelection()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selection, clearSelection, deleteSelection])

  if (!selection || !box) return null

  const clampMove = (dx: number, dy: number) => ({
    dx: clamp(dx, -box.x, 1 - box.x - box.w),
    dy: clamp(dy, -box.y, 1 - box.y - box.h),
  })

  const onDown = (e: ReactPointerEvent<SVGRectElement>) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDrag({ x: e.clientX, y: e.clientY, dx: 0, dy: 0 })
  }
  const onMove = (e: ReactPointerEvent<SVGRectElement>) => {
    if (!drag) return
    const r = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
    if (!r || r.width === 0) return
    const m = clampMove((e.clientX - drag.x) / r.width, (e.clientY - drag.y) / r.height)
    setDrag({ ...drag, ...m })
    onPreview(m)
  }
  const onUp = () => {
    if (drag) moveSelection(drag.dx, drag.dy)
    setDrag(null)
    onPreview(null)
  }

  const x = box.x + (drag?.dx ?? 0)
  const y = box.y + (drag?.dy ?? 0)
  const pad = 0.006
  const hw = HANDLE
  const hh = HANDLE / PAGE_ASPECT
  const corners = [
    [x - pad, y - pad],
    [x + box.w + pad, y - pad],
    [x - pad, y + box.h + pad],
    [x + box.w + pad, y + box.h + pad],
  ]
  const count = selection.strokeIds.length + selection.objectIds.length
  const menuBtn =
    'min-h-9 rounded px-2 text-sm hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600'

  return (
    <>
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        aria-hidden
      >
        <rect
          data-testid="selection-box"
          x={x - pad}
          y={y - pad}
          width={box.w + 2 * pad}
          height={box.h + 2 * pad}
          fill="rgb(37 99 235 / 0.06)"
          stroke="#2563eb"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          className="pointer-events-auto cursor-move touch-none"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => {
            setDrag(null)
            onPreview(null)
          }}
        />
        {corners.map(([cx, cy], i) => (
          <rect
            key={i}
            x={cx - hw / 2}
            y={cy - hh / 2}
            width={hw}
            height={hh}
            fill="white"
            stroke="#2563eb"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {!drag && (
        <div
          role="menu"
          aria-label={`Selection (${count} item${count === 1 ? '' : 's'})`}
          className="absolute z-20 flex gap-1 rounded-lg border bg-white p-1 shadow-lg"
          style={{
            left: `${clamp(x, 0, 0.6) * 100}%`,
            top: `${Math.min(y + box.h + 0.015, 0.95) * 100}%`,
          }}
        >
          {onReview && (
            <>
              <button
                type="button"
                role="menuitem"
                className={`${menuBtn} font-medium text-blue-700`}
                onClick={() => onReview('review')}
              >
                Review this
              </button>
              <button
                type="button"
                role="menuitem"
                className={menuBtn}
                onClick={() => onReview('explain')}
              >
                Explain step
              </button>
            </>
          )}
          <button type="button" role="menuitem" className={menuBtn} onClick={copySelection}>
            Copy
          </button>
          <button
            type="button"
            role="menuitem"
            className={`${menuBtn} text-red-700`}
            onClick={deleteSelection}
          >
            Delete
          </button>
        </div>
      )}
    </>
  )
}
