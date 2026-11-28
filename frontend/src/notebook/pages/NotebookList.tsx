import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Notebook } from '../model'
import { useNotebookStore } from '../store'

const notebookHref = (id: string) => `#/nb/${id}`

function NotebookRow({ notebook }: { notebook: Notebook }) {
  const renameNotebook = useNotebookStore((s) => s.renameNotebook)
  const deleteNotebook = useNotebookStore((s) => s.deleteNotebook)
  const [mode, setMode] = useState<'view' | 'rename' | 'confirm'>('view')
  const [title, setTitle] = useState(notebook.title)

  const rename = (e: FormEvent) => {
    e.preventDefault()
    if (title.trim()) void renameNotebook(notebook.id, title.trim())
    setMode('view')
  }

  const btn = 'min-h-9 rounded px-3 text-sm hover:bg-slate-100'
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-3 shadow-sm">
      {mode === 'rename' ? (
        <form onSubmit={rename} className="flex flex-1 gap-2">
          <label className="sr-only" htmlFor={`rename-${notebook.id}`}>
            Notebook title
          </label>
          <input
            id={`rename-${notebook.id}`}
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 rounded border px-2"
          />
          <button type="submit" className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
            Save
          </button>
        </form>
      ) : (
        <a
          href={notebookHref(notebook.id)}
          className="flex-1 truncate text-lg font-medium text-blue-700 hover:underline"
        >
          {notebook.title}
        </a>
      )}
      {mode === 'confirm' ? (
        <span role="alert" className="flex items-center gap-2 text-sm">
          Delete “{notebook.title}” and all its pages?
          <button
            type="button"
            className={`${btn} bg-red-600 text-white hover:bg-red-700`}
            onClick={() => void deleteNotebook(notebook.id)}
          >
            Delete
          </button>
          <button type="button" className={btn} onClick={() => setMode('view')}>
            Cancel
          </button>
        </span>
      ) : (
        mode === 'view' && (
          <>
            <button
              type="button"
              className={btn}
              aria-label={`Rename ${notebook.title}`}
              onClick={() => setMode('rename')}
            >
              Rename
            </button>
            <button
              type="button"
              className={`${btn} text-red-700`}
              aria-label={`Delete ${notebook.title}`}
              onClick={() => setMode('confirm')}
            >
              Delete
            </button>
          </>
        )
      )}
    </li>
  )
}

export function NotebookList() {
  const notebooks = useNotebookStore((s) => s.notebooks)
  const loadNotebooks = useNotebookStore((s) => s.loadNotebooks)
  const createNotebook = useNotebookStore((s) => s.createNotebook)
  const [title, setTitle] = useState('')

  useEffect(() => {
    void loadNotebooks()
  }, [loadNotebooks])

  const create = async (e: FormEvent) => {
    e.preventDefault()
    const nb = await createNotebook(title.trim() || 'Untitled notebook')
    setTitle('')
    window.location.hash = notebookHref(nb.id)
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <h2 className="text-xl font-semibold">Your notebooks</h2>
      <form onSubmit={create} className="flex gap-2">
        <label htmlFor="new-notebook" className="sr-only">
          New notebook title
        </label>
        <input
          id="new-notebook"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New notebook title"
          className="min-h-11 flex-1 rounded border px-3"
        />
        <button type="submit" className="min-h-11 rounded bg-blue-600 px-4 font-medium text-white">
          Create notebook
        </button>
      </form>
      {notebooks.length === 0 ? (
        <p className="text-slate-600">No notebooks yet. Create one to start writing.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notebooks.map((n) => (
            <NotebookRow key={n.id} notebook={n} />
          ))}
        </ul>
      )}
    </div>
  )
}
