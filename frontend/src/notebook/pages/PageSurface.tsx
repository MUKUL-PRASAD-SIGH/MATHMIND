import { useDeviceSettings } from '../../services/device/capabilities'
import { useMemo, useState } from 'react'
import { InkCanvas } from '../canvas/InkCanvas'
import { PAGE_ASPECT, type Background, type InkTool, type Stroke } from '../model'
import { useNotebookStore } from '../store'
import { SelectionOverlay, type ReviewKind } from '../tools/SelectionOverlay'
import { ObjectLayer } from './ObjectLayer'

const EMPTY: Stroke[] = []

const isInk = (t: string): t is InkTool => t === 'pen' || t === 'pencil' || t === 'highlighter'

/** CSS background patterns drawn behind the canvas (never part of the ink data). */
function backgroundStyle(bg: Background): React.CSSProperties {
  const line = 'rgb(203 213 225)'
  if (bg === 'ruled') {
    return {
      backgroundImage: `linear-gradient(to bottom, transparent calc(100% - 1px), ${line} 1px)`,
      backgroundSize: '100% 3.2%',
    }
  }
  if (bg === 'squared') {
    return {
      backgroundImage: `linear-gradient(to right, ${line} 1px, transparent 1px), linear-gradient(to bottom, ${line} 1px, transparent 1px)`,
      backgroundSize: '4% 2.83%',
    }
  }
  return {}
}

export interface PageSurfaceProps {
  pageId: string
  background?: Background
  /** Current zoom, used to keep the canvas backing store sharp. */
  zoom?: number
  label?: string
  /** Show MathLive's on-screen keyboard (touch devices). */
  virtualKeyboard?: boolean
  /** Send the current selection to the review flow. */
  onReview?(kind: ReviewKind): void
}

/** One writable page: background, ink layers and (later) overlays, bound to the store. */
export function PageSurface({
  pageId,
  background = 'ruled',
  zoom = 1,
  label,
  virtualKeyboard = false,
  onReview,
}: PageSurfaceProps) {
  const strokes = useNotebookStore((s) => s.strokes[pageId] ?? EMPTY)
  const tool = useNotebookStore((s) => s.tool)
  const settings = useNotebookStore((s) => s.toolSettings[isInk(s.tool) ? s.tool : 'pen'])
  const addStroke = useNotebookStore((s) => s.addStroke)
  const erase = useNotebookStore((s) => s.erase)
  const ignoreTouchWithPen = useDeviceSettings((s) => s.ignoreTouchWithPen)
  const selectArea = useNotebookStore((s) => s.selectArea)
  const selection = useNotebookStore((s) => (s.selection?.pageId === pageId ? s.selection : null))
  const [preview, setPreview] = useState<{ dx: number; dy: number } | null>(null)
  const moving = useMemo(
    () => (preview && selection ? { ids: new Set(selection.strokeIds), ...preview } : null),
    [preview, selection],
  )

  return (
    <section
      aria-label={label ?? 'Page'}
      data-page-id={pageId}
      className="relative w-full bg-white shadow-md"
      style={{ aspectRatio: `1 / ${PAGE_ASPECT}`, ...backgroundStyle(background) }}
    >
      <InkCanvas
        pageId={pageId}
        strokes={strokes}
        tool={tool}
        color={settings.color}
        width={settings.width}
        resolution={zoom}
        ignoreTouchWithPen={ignoreTouchWithPen}
        onStrokeComplete={addStroke}
        onErase={(segment, phase) => erase(pageId, segment, phase)}
        onSelectArea={(polygon) => selectArea(pageId, polygon)}
        moving={moving}
      />
      <ObjectLayer pageId={pageId} virtualKeyboard={virtualKeyboard} />
      <SelectionOverlay pageId={pageId} onPreview={setPreview} onReview={onReview} />
    </section>
  )
}
