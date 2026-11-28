import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { BBox } from '../model'

const FULL: BBox = { x: 0, y: 0, w: 1, h: 1 }
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * Phone capture flow: preview the photo, drag a crop rectangle (defaults to the whole photo)
 * and confirm with "Use this". The crop is normalized to the photo (0..1).
 */
export function CaptureDialog({
  file,
  onCancel,
  onUse,
}: {
  file: Blob
  onCancel(): void
  onUse(crop: BBox): void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [crop, setCrop] = useState<BBox>(FULL)
  const start = useRef<[number, number] | null>(null)
  const frame = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  const point = (e: ReactPointerEvent): [number, number] => {
    const r = frame.current!.getBoundingClientRect()
    return [clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height)]
  }
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    start.current = point(e)
  }
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current) return
    const [x0, y0] = start.current
    const [x1, y1] = point(e)
    setCrop({
      x: Math.min(x0, x1),
      y: Math.min(y0, y1),
      w: Math.abs(x1 - x0),
      h: Math.abs(y1 - y0),
    })
  }
  const onUp = () => {
    start.current = null
    setCrop((c) => (c.w < 0.02 || c.h < 0.02 ? FULL : c))
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crop your photo"
      className="fixed inset-0 z-50 flex flex-col items-center gap-3 bg-slate-900/90 p-4 text-white"
    >
      <p className="text-sm">Drag over the part of the photo you want checked.</p>
      <div
        ref={frame}
        data-testid="crop-frame"
        className="relative max-h-[70vh] touch-none select-none"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
      >
        {url && (
          <img
            src={url}
            alt="Captured photo"
            draggable={false}
            className="max-h-[70vh] max-w-full"
          />
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute border-2 border-yellow-300 shadow-[0_0_0_9999px_rgb(0_0_0/0.45)]"
          style={{
            left: `${crop.x * 100}%`,
            top: `${crop.y * 100}%`,
            width: `${crop.w * 100}%`,
            height: `${crop.h * 100}%`,
          }}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded bg-white/10 px-4 hover:bg-white/20"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => setCrop(FULL)}
          className="min-h-11 rounded bg-white/10 px-4 hover:bg-white/20"
        >
          Whole photo
        </button>
        <button
          type="button"
          autoFocus
          onClick={() => onUse(crop)}
          className="min-h-11 rounded bg-blue-600 px-4 font-semibold hover:bg-blue-500"
        >
          Use this
        </button>
      </div>
    </div>
  )
}
