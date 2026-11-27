import { InkCanvas } from '../canvas/InkCanvas'
import { PAGE_ASPECT, type Background, type InkTool, type Stroke } from '../model'
import { useNotebookStore } from '../store'

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
}

/** One writable page: background, ink layers and (later) overlays, bound to the store. */
export function PageSurface({ pageId, background = 'ruled', zoom = 1, label }: PageSurfaceProps) {
  const strokes = useNotebookStore((s) => s.strokes[pageId] ?? EMPTY)
  const tool = useNotebookStore((s) => s.tool)
  const settings = useNotebookStore((s) => s.toolSettings[isInk(s.tool) ? s.tool : 'pen'])
  const addStroke = useNotebookStore((s) => s.addStroke)
  const erase = useNotebookStore((s) => s.erase)

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
        onStrokeComplete={addStroke}
        onErase={(segment, phase) => erase(pageId, segment, phase)}
      />
    </section>
  )
}
