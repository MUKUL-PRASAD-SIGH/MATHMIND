import { useEffect, useState } from 'react'
import { SolutionBlock } from '../equations/SolutionBlock'
import type { ImageObject, NotebookObject, TextObject } from '../model'
import { useNotebookStore } from '../store'
import { ObjectFrame } from './ObjectFrame'

const EMPTY: NotebookObject[] = []

function TextNote({ object }: { object: TextObject }) {
  const updateObjectPayload = useNotebookStore((s) => s.updateObjectPayload)
  return (
    <ObjectFrame object={object} title="Text note">
      <textarea
        aria-label="Text note"
        value={object.payload.text}
        onChange={(e) => updateObjectPayload(object, { text: e.target.value })}
        rows={3}
        className="block w-full resize-y bg-transparent p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        placeholder="Write a note…"
      />
    </ObjectFrame>
  )
}

/** The working copy is displayed; the original file stays untouched in IndexedDB. */
function ImageView({ object }: { object: ImageObject }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const u = URL.createObjectURL(object.payload.image)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [object.payload.image])
  return (
    <ObjectFrame object={object} title="Image" fixedHeight resizable>
      {url && (
        <img
          src={url}
          alt="Imported work"
          draggable={false}
          className="pointer-events-none h-full w-full object-contain select-none"
        />
      )}
    </ObjectFrame>
  )
}

/** DOM objects placed on a page (solution blocks, notes), above the ink. */
export function ObjectLayer({
  pageId,
  virtualKeyboard,
}: {
  pageId: string
  virtualKeyboard: boolean
}) {
  const objects = useNotebookStore((s) => s.objects[pageId] ?? EMPTY)
  return (
    <div className="pointer-events-none absolute inset-0">
      {objects.map((o) => {
        if (o.kind === 'equation') {
          return <SolutionBlock key={o.id} object={o} virtualKeyboard={virtualKeyboard} />
        }
        if (o.kind === 'text') return <TextNote key={o.id} object={o} />
        return <ImageView key={o.id} object={o} />
      })}
    </div>
  )
}
