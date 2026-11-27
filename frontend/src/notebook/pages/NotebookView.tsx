import { useEffect, useState } from 'react'
import { readLast } from '../autosave'
import type { Background } from '../model'
import { SaveStatus } from '../SaveStatus'
import { useNotebookStore } from '../store'
import { Toolbar } from '../tools/Toolbar'
import { isEditableTarget } from '../tools/shortcuts'
import { PageSidebar } from './PageSidebar'
import { PageSurface } from './PageSurface'
import { PageViewport } from './PageViewport'

export function NotebookView({ notebookId }: { notebookId: string }) {
  const notebook = useNotebookStore((s) => s.notebook)
  const pages = useNotebookStore((s) => s.pages)
  const currentPageId = useNotebookStore((s) => s.currentPageId)
  const openNotebook = useNotebookStore((s) => s.openNotebook)
  const goToPage = useNotebookStore((s) => s.goToPage)
  const updatePage = useNotebookStore((s) => s.updatePage)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (useNotebookStore.getState().notebook?.id === notebookId) return
    const last = readLast()
    const pageId = last?.notebookId === notebookId ? last.pageId : null
    openNotebook(notebookId, pageId).catch((e: unknown) => setError(String(e)))
  }, [notebookId, openNotebook])

  const top = pages.filter((p) => !p.parent_page_id).sort((a, b) => a.order - b.order)
  const index = top.findIndex((p) => p.id === currentPageId)
  const page = top[index]
  const areas = pages.filter((p) => p.parent_page_id === currentPageId)

  const go = (delta: number) => {
    const next = top[index + delta]
    if (next) void goToPage(next.id)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      if (e.key === 'PageDown') {
        e.preventDefault()
        go(1)
      } else if (e.key === 'PageUp') {
        e.preventDefault()
        go(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (error) {
    return (
      <p role="alert" className="p-6">
        Could not open this notebook. <a href="#/">Back to notebooks</a>
      </p>
    )
  }
  if (!notebook || notebook.id !== notebookId) return <p className="p-6">Opening notebook…</p>

  const pageTitle = page ? page.title || `Page ${index + 1}` : ''
  const navBtn =
    'min-h-9 rounded px-3 text-sm hover:bg-slate-200 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-blue-600'

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b bg-white px-3 py-2">
        <a href="#/" className="rounded px-2 py-1 text-sm text-blue-700 hover:bg-slate-100">
          ← Notebooks
        </a>
        <h2 className="flex-1 truncate font-semibold">{notebook.title}</h2>
        <SaveStatus />
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 border-r bg-slate-50">
          <PageSidebar />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <Toolbar />
          {page && (
            <div className="flex flex-wrap items-center gap-2 border-b bg-white px-3 py-1 text-sm">
              <button type="button" className={navBtn} disabled={index <= 0} onClick={() => go(-1)}>
                ← Previous page
              </button>
              <span aria-live="polite" className="font-medium" data-testid="current-page-title">
                {pageTitle}
              </span>
              <button
                type="button"
                className={navBtn}
                disabled={index >= top.length - 1}
                onClick={() => go(1)}
              >
                Next page →
              </button>
              <button
                type="button"
                className={navBtn}
                aria-pressed={page.bookmarked}
                aria-label="Bookmark page"
                onClick={() => updatePage(page.id, { bookmarked: !page.bookmarked })}
              >
                {page.bookmarked ? '★' : '☆'}
              </button>
              <label className="ml-auto flex items-center gap-1">
                Background
                <select
                  value={page.background}
                  onChange={(e) =>
                    updatePage(page.id, { background: e.target.value as Background })
                  }
                  className="rounded border px-1 py-0.5"
                >
                  <option value="ruled">Ruled</option>
                  <option value="squared">Squared</option>
                  <option value="blank">Blank</option>
                </select>
              </label>
            </div>
          )}
          {page && (
            <PageViewport>
              {(zoom) => (
                <div className="flex flex-col gap-4">
                  <PageSurface
                    key={page.id}
                    pageId={page.id}
                    background={page.background}
                    zoom={zoom}
                    label={pageTitle}
                  />
                  {areas.map((a, i) => (
                    <PageSurface
                      key={a.id}
                      pageId={a.id}
                      background={a.background}
                      zoom={zoom}
                      label={`${pageTitle} — working space ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </PageViewport>
          )}
        </main>
      </div>
    </div>
  )
}
