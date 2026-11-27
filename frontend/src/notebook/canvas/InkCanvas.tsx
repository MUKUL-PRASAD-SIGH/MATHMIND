import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { uuidv7 } from '../ids'
import type { Point, Stroke, ToolName } from '../model'
import { computeBBox, normalizePoint } from './geometry'
import { drawStroke, prepareCanvas } from './render'

export interface InkCanvasProps {
  pageId: string
  strokes: readonly Stroke[]
  tool: ToolName
  color: string
  width: number
  /** Extra backing-store scale (e.g. zoom) so ink stays sharp. */
  resolution?: number
  /** Ignore touch input once a pen has been seen (touch is still used for gestures). */
  ignoreTouchWithPen?: boolean
  disabled?: boolean
  /** Live preview offset for strokes being moved. */
  moving?: { ids: ReadonlySet<string>; dx: number; dy: number } | null
  onStrokeComplete?(stroke: Stroke): void
  onErase?(segment: Point[], phase: 'start' | 'move' | 'end'): void
  onSelectArea?(polygon: Point[], mode: 'lasso' | 'rect'): void
  onPenSeen?(): void
}

type Mode = 'ink' | 'erase' | 'lasso' | 'rect'

interface Live {
  pointerId: number
  pointerType: string
  mode: Mode
  points: Point[]
  pressure: number[]
  timestamps: number[]
  t0: number
}

const modeFor = (tool: ToolName): Mode =>
  tool === 'eraser' ? 'erase' : tool === 'lasso' ? 'lasso' : tool === 'rect' ? 'rect' : 'ink'

const rectPolygon = (a: Point, b: Point): Point[] => [
  [a[0], a[1]],
  [b[0], a[1]],
  [b[0], b[1]],
  [a[0], b[1]],
]

/**
 * Pointer Events ink surface with three layers: committed highlighter strokes (bottom),
 * committed ink, and a live layer that only holds the stroke being drawn.
 */
export function InkCanvas(props: InkCanvasProps) {
  const { strokes, moving, resolution = 1 } = props
  const wrapperRef = useRef<HTMLDivElement>(null)
  const highlightRef = useRef<HTMLCanvasElement>(null)
  const inkRef = useRef<HTMLCanvasElement>(null)
  const liveRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const live = useRef<Live | null>(null)
  const touches = useRef(new Set<number>())
  const penActive = useRef(false)
  const penSeen = useRef(false)
  const frame = useRef(0)
  const propsRef = useRef(props)
  useLayoutEffect(() => {
    propsRef.current = props
  })

  const res = (window.devicePixelRatio || 1) * Math.min(Math.max(resolution, 1), 3)

  useLayoutEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Committed layers: redrawn from data on load, resize, zoom or change.
  useEffect(() => {
    const hl = highlightRef.current
    const ink = inkRef.current
    if (!hl || !ink || size.w === 0) return
    const hctx = prepareCanvas(hl, size.w, size.h, res)
    const ictx = prepareCanvas(ink, size.w, size.h, res)
    const target = { width: size.w, height: size.h }
    for (const s of strokes) {
      const ctx = s.tool === 'highlighter' ? hctx : ictx
      if (!ctx) continue
      const offset = moving?.ids.has(s.id) ? { dx: moving.dx, dy: moving.dy } : {}
      drawStroke(ctx, s, target, offset)
    }
  }, [strokes, size, moving, res])

  const drawLive = useCallback(() => {
    frame.current = 0
    const canvas = liveRef.current
    if (!canvas || size.w === 0) return
    const ctx = prepareCanvas(canvas, size.w, size.h, res)
    const l = live.current
    if (!ctx || !l) return
    const target = { width: size.w, height: size.h }
    const p = propsRef.current
    if (l.mode === 'ink' && p.tool !== 'eraser' && p.tool !== 'lasso' && p.tool !== 'rect') {
      drawStroke(
        ctx,
        {
          points: l.points,
          pressure: l.pointerType === 'pen' ? l.pressure : null,
          tool: p.tool,
          color: p.color,
          width: p.width,
        },
        target,
      )
    } else if (l.mode === 'lasso' || l.mode === 'rect') {
      const poly =
        l.mode === 'rect' ? rectPolygon(l.points[0], l.points[l.points.length - 1]) : l.points
      ctx.save()
      ctx.setLineDash([6, 4])
      ctx.strokeStyle = '#2563eb'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      poly.forEach(([x, y], i) =>
        i === 0 ? ctx.moveTo(x * size.w, y * size.h) : ctx.lineTo(x * size.w, y * size.h),
      )
      ctx.closePath()
      ctx.stroke()
      ctx.restore()
    }
  }, [size, res])

  const schedule = () => {
    if (!frame.current) frame.current = requestAnimationFrame(drawLive)
  }

  const clearLive = () => {
    live.current = null
    const canvas = liveRef.current
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
  }

  const shouldIgnore = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'touch') return false
    return penActive.current || (penSeen.current && (propsRef.current.ignoreTouchWithPen ?? true))
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') {
      touches.current.add(e.pointerId)
      // A second finger means pinch/pan, not ink: drop the stroke in progress.
      if (touches.current.size > 1) {
        if (live.current?.pointerType === 'touch') clearLive()
        return
      }
    }
    if (e.pointerType === 'pen') {
      penActive.current = true
      if (!penSeen.current) {
        penSeen.current = true
        propsRef.current.onPenSeen?.()
      }
      if (live.current?.pointerType === 'touch') clearLive() // palm landed first
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return
    if (shouldIgnore(e) || live.current) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const p = normalizePoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
    const mode = modeFor(propsRef.current.tool)
    live.current = {
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      mode,
      points: [p],
      pressure: [e.pressure],
      timestamps: [0],
      t0: e.timeStamp,
    }
    if (mode === 'erase') propsRef.current.onErase?.([p], 'start')
    schedule()
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const l = live.current
    if (!l || e.pointerId !== l.pointerId) return
    const rect = e.currentTarget.getBoundingClientRect()
    const native = e.nativeEvent as PointerEvent
    const events =
      typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : []
    const samples = events.length > 0 ? events : [native]
    const added: Point[] = []
    for (const ev of samples) {
      const p = normalizePoint(ev.clientX, ev.clientY, rect)
      const last = l.points[l.points.length - 1]
      if (last[0] === p[0] && last[1] === p[1]) continue
      l.points.push(p)
      l.pressure.push(ev.pressure)
      l.timestamps.push(Math.max(0, ev.timeStamp - l.t0))
      added.push(p)
    }
    if (l.mode === 'erase' && added.length > 0) {
      propsRef.current.onErase?.([l.points[l.points.length - added.length - 1], ...added], 'move')
    }
    schedule()
  }

  const finish = (e: ReactPointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
    if (e.pointerType === 'touch') touches.current.delete(e.pointerId)
    if (e.pointerType === 'pen') penActive.current = false
    const l = live.current
    if (!l || e.pointerId !== l.pointerId) return
    clearLive()
    const p = propsRef.current
    if (l.mode === 'erase') {
      p.onErase?.([], 'end')
      return
    }
    if (cancelled) return
    if (l.mode === 'lasso' || l.mode === 'rect') {
      const poly =
        l.mode === 'rect' ? rectPolygon(l.points[0], l.points[l.points.length - 1]) : l.points
      p.onSelectArea?.(poly, l.mode)
      return
    }
    if (p.tool === 'eraser' || p.tool === 'lasso' || p.tool === 'rect') return
    const hasPressure = l.pointerType === 'pen'
    p.onStrokeComplete?.({
      id: uuidv7(),
      page_id: p.pageId,
      points: l.points,
      pressure: hasPressure ? l.pressure : null,
      timestamps: l.timestamps,
      tool: p.tool,
      color: p.color,
      width: p.width,
      bbox: computeBBox(l.points),
      deleted: false,
    })
  }

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  return (
    <div ref={wrapperRef} className="absolute inset-0">
      <canvas
        ref={highlightRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
      <canvas ref={inkRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
      <canvas
        ref={liveRef}
        data-testid="ink-canvas"
        role="img"
        aria-label="Handwriting area"
        style={{ touchAction: 'none' }}
        className={`absolute inset-0 h-full w-full ${props.disabled ? 'pointer-events-none' : ''} ${
          props.tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair'
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
      />
    </div>
  )
}
