import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { isEditableTarget } from '../tools/shortcuts'
import { clampZoom, zoomAt, type View } from './viewport'

const MAX_PAGE_WIDTH = 900

export interface PageViewportProps {
  children(zoom: number): ReactNode
}

/**
 * Scrollable, zoomable page area. Zoom is a CSS transform on a wrapper (strokes stay
 * page-normalized); pan is scrolling. Gestures: Ctrl+wheel and pinch zoom, two-finger and
 * space+drag (or middle-button drag) pan.
 */
export function PageViewport({ children }: PageViewportProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const sizerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [baseWidth, setBaseWidth] = useState(MAX_PAGE_WIDTH)
  const [contentHeight, setContentHeight] = useState(0)
  const [spaceDown, setSpaceDown] = useState(false)
  const pending = useRef<View | null>(null)
  const touches = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef<{ id: number; x: number; y: number } | null>(null)
  const zoomRef = useRef(zoom)
  useLayoutEffect(() => {
    zoomRef.current = zoom
  })

  useLayoutEffect(() => {
    const el = scrollRef.current
    const content = contentRef.current
    if (!el || !content) return
    const measure = () => {
      if (el.clientWidth > 0)
        setBaseWidth(Math.max(280, Math.min(MAX_PAGE_WIDTH, el.clientWidth - 32)))
      setContentHeight(content.offsetHeight)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    ro.observe(content)
    return () => ro.disconnect()
  }, [])

  // Apply the scroll offset computed by zoomAt once the new size is laid out.
  useLayoutEffect(() => {
    const el = scrollRef.current
    const sizer = sizerRef.current
    const v = pending.current
    if (!el || !sizer || !v) return
    pending.current = null
    el.scrollLeft = v.scrollX + sizer.offsetLeft
    el.scrollTop = v.scrollY + sizer.offsetTop
  }, [zoom])

  const zoomBy = (factor: number, focal?: { x: number; y: number }) => {
    const el = scrollRef.current
    const sizer = sizerRef.current
    if (!el || !sizer) return
    const f = focal ?? { x: el.clientWidth / 2, y: el.clientHeight / 2 }
    const view = {
      zoom: zoomRef.current,
      scrollX: el.scrollLeft - sizer.offsetLeft,
      scrollY: el.scrollTop - sizer.offsetTop,
    }
    const next = zoomAt(view, f, factor)
    if (next.zoom === view.zoom) return
    pending.current = next
    setZoom(next.zoom)
  }
  const zoomByRef = useRef(zoomBy)
  useLayoutEffect(() => {
    zoomByRef.current = zoomBy
  })

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomByRef.current(Math.exp(-e.deltaY * 0.01), { x: e.clientX - r.left, y: e.clientY - r.top })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isEditableTarget(e.target)) return
      if (e.type === 'keydown') e.preventDefault()
      setSpaceDown(e.type === 'keydown')
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => {
      el.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [])

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'touch') touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    else if (spaceDown || e.button === 1) {
      e.preventDefault()
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
      scrollRef.current?.setPointerCapture?.(e.pointerId)
    }
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const el = scrollRef.current
    if (!el) return
    if (drag.current?.id === e.pointerId) {
      el.scrollLeft -= e.clientX - drag.current.x
      el.scrollTop -= e.clientY - drag.current.y
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
      return
    }
    const t = touches.current
    if (e.pointerType !== 'touch' || !t.has(e.pointerId)) return
    if (t.size !== 2) {
      t.set(e.pointerId, { x: e.clientX, y: e.clientY })
      return
    }
    const [a0, b0] = [...t.values()]
    t.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const [a1, b1] = [...t.values()]
    const r = el.getBoundingClientRect()
    const mid0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }
    const mid1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 }
    el.scrollLeft -= mid1.x - mid0.x
    el.scrollTop -= mid1.y - mid0.y
    const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y)
    const d1 = Math.hypot(a1.x - b1.x, a1.y - b1.y)
    if (d0 > 0 && Math.abs(d1 / d0 - 1) > 0.01) {
      zoomBy(d1 / d0, { x: mid1.x - r.left, y: mid1.y - r.top })
    }
  }

  const onPointerEnd = (e: ReactPointerEvent) => {
    touches.current.delete(e.pointerId)
    if (drag.current?.id === e.pointerId) drag.current = null
  }

  const btn =
    'min-h-9 min-w-9 rounded-md bg-white/90 px-2 text-sm shadow hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600'

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        data-testid="page-viewport"
        className={`absolute inset-0 overflow-auto ${spaceDown ? 'cursor-grab [&_canvas]:pointer-events-none' : ''}`}
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <div
          ref={sizerRef}
          className="mx-auto"
          style={{ width: baseWidth * zoom, height: contentHeight * zoom }}
        >
          <div
            ref={contentRef}
            className="py-4"
            style={{ width: baseWidth, transform: `scale(${zoom})`, transformOrigin: '0 0' }}
          >
            {children(zoom)}
          </div>
        </div>
      </div>
      <div className="absolute right-3 bottom-3 flex gap-1" role="group" aria-label="Zoom">
        <button
          type="button"
          className={btn}
          aria-label="Zoom out"
          onClick={() => zoomBy(1 / 1.25)}
        >
          −
        </button>
        <button
          type="button"
          className={btn}
          aria-label="Reset zoom"
          onClick={() => zoomBy(1 / zoom)}
        >
          {Math.round(clampZoom(zoom) * 100)}%
        </button>
        <button type="button" className={btn} aria-label="Zoom in" onClick={() => zoomBy(1.25)}>
          +
        </button>
      </div>
    </div>
  )
}
