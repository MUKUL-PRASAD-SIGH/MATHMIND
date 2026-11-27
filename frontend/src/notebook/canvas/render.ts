import { REF_PAGE_WIDTH, type InkTool, type Stroke } from '../model'
import { pressureWidth, smoothPath } from './geometry'

/** Per-tool look: pencil is lighter, highlighter is translucent and sits under the ink. */
export const TOOL_ALPHA: Record<InkTool, number> = { pen: 1, pencil: 0.7, highlighter: 0.3 }

export interface RenderTarget {
  /** Page size in CSS px (or export px). */
  width: number
  height: number
}

type DrawableStroke = Pick<Stroke, 'points' | 'pressure' | 'tool' | 'color' | 'width'>

/**
 * Draw one stroke. Coordinates are page-normalized and scaled to `target` here, at the
 * render boundary. Pen strokes with pressure are drawn per segment with varying width.
 */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: DrawableStroke,
  target: RenderTarget,
  opts: { color?: string; alpha?: number; dx?: number; dy?: number } = {},
): void {
  const { points } = stroke
  if (points.length === 0) return
  const scale = target.width / REF_PAGE_WIDTH
  const dx = opts.dx ?? 0
  const dy = opts.dy ?? 0
  const X = (p: readonly number[]) => (p[0] + dx) * target.width
  const Y = (p: readonly number[]) => (p[1] + dy) * target.height
  const base = stroke.width * scale

  ctx.save()
  ctx.globalAlpha = opts.alpha ?? TOOL_ALPHA[stroke.tool]
  ctx.strokeStyle = opts.color ?? stroke.color
  ctx.fillStyle = opts.color ?? stroke.color
  ctx.lineCap = stroke.tool === 'highlighter' ? 'butt' : 'round'
  ctx.lineJoin = 'round'

  if (points.length === 1) {
    ctx.beginPath()
    ctx.arc(X(points[0]), Y(points[0]), base / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    return
  }

  const pressure = stroke.tool === 'pen' ? stroke.pressure : null
  if (!pressure || pressure.length !== points.length) {
    ctx.lineWidth = base
    ctx.beginPath()
    for (const cmd of smoothPath(points)) {
      if (cmd.op === 'M') ctx.moveTo(X(cmd.p), Y(cmd.p))
      else if (cmd.op === 'L') ctx.lineTo(X(cmd.p), Y(cmd.p))
      else ctx.quadraticCurveTo(X(cmd.c), Y(cmd.c), X(cmd.p), Y(cmd.p))
    }
    ctx.stroke()
    ctx.restore()
    return
  }

  // Variable width: one short quadratic per input point, width from its pressure sample.
  const cmds = smoothPath(points)
  let prev = cmds[0].p
  for (let i = 1; i < cmds.length; i++) {
    const cmd = cmds[i]
    const sample = pressure[Math.min(i - 1, pressure.length - 1)]
    ctx.lineWidth = pressureWidth(base, sample)
    ctx.beginPath()
    ctx.moveTo(X(prev), Y(prev))
    if (cmd.op === 'Q') ctx.quadraticCurveTo(X(cmd.c), Y(cmd.c), X(cmd.p), Y(cmd.p))
    else ctx.lineTo(X(cmd.p), Y(cmd.p))
    ctx.stroke()
    prev = cmd.p
  }
  ctx.restore()
}

/** Size a canvas for its CSS box and return a context drawing in CSS px. */
export function prepareCanvas(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
  resolution: number,
): CanvasRenderingContext2D | null {
  const w = Math.max(1, Math.round(cssWidth * resolution))
  const h = Math.max(1, Math.round(cssHeight * resolution))
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.setTransform(resolution, 0, 0, resolution, 0, 0)
  ctx.clearRect(0, 0, cssWidth, cssHeight)
  return ctx
}
