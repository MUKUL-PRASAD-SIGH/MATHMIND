import { useEffect, useState } from 'react'
import { SettingsMenu } from '../../components/SettingsMenu'
import { useDeviceMode } from '../../services/device/capabilities'
import { readLast } from '../autosave'
import { newSolutionBlock, newTextNote } from '../objects'
import type { Background } from '../model'
import { SaveStatus } from '../SaveStatus'
import { useNotebookStore } from '../store'
import { Toolbar } from '../tools/Toolbar'
import { isEditableTarget } from '../tools/shortcuts'
import { PageSidebar } from './PageSidebar'
import { PageSurface } from './PageSurface'
import { PageViewport } from './PageViewport'

/** Pages that already got their automatic solution block this session. */
const autoBlocked = new Set<string>()

export function NotebookView({ notebookId }: { notebookId: string }) {
  const notebook = useNotebookStore((s) => s.notebook)
  const pages = useNotebookStore((s) => s.pages)
  const currentPageId = useNotebookStore((s) => s.currentPageId)
  const openNotebook = useNotebookStore((s) => s.openNotebook)
  const goToPage = useNotebookStore((s) => s.goToPage)
  const updatePage = useNotebookStore((s) => s.updatePage)
  const addObject = useNotebookStore((s) => s.addObject)
  const loaded = useNotebookStore((s) =>
    s.currentPageId ? !!s.strokes[s.currentPageId] && !!s.objects[s.currentPageId] : false,
  )
  const [error, setError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { mode } = useDeviceMode()
  const phone = mode === 'phone'
  const tablet = mode === 'tablet'
  const keyboardFirst = mode === 'laptop' || mode === 'hybrid'

  useEffect(() => {
    if (useNotebookStore.getState().notebook?.id === notebookId) return
    const last = readLast()
    const pageId = last?.notebookId === notebookId ? last.pageId : null
    openNotebook(notebookId, pageId).catch((e: unknown) => setError(String(e)))
  }, [notebookId, openNotebook])

  // Laptop mode is keyboard-first: an empty page starts with a solution block (not an undo step).
  useEffect(() => {
    if (!keyboardFirst || !loaded || !currentPageId) return
    const s = useNotebookStore.getState()
    if (s.strokes[currentPageId].length > 0 || s.objects[currentPageId].length > 0) return
    if (autoBlocked.has(currentPageId)) return
    autoBlocked.add(currentPageId)
    s.addObject(newSolutionBlock(currentPageId, []), { record: false })
  }, [keyboardFirst, loaded, currentPageId])

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

  const pageBar = page && (
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
          onChange={(e) => updatePage(page.id, { background: e.target.value as Background })}
          className="rounded border px-1 py-0.5"
        >
          <option value="ruled">Ruled</option>
          <option value="squared">Squared</option>
          <option value="blank">Blank</option>
        </select>
      </label>
    </div>
  )

  const actionBtn = (large: boolean) =>
    `${large ? 'min-h-11' : 'min-h-9'} rounded-md px-2 text-sm font-medium hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-blue-600`
  const add = (factory: typeof newSolutionBlock | typeof newTextNote) => {
    const pageId = useNotebookStore.getState().activePageId ?? currentPageId
    if (!pageId) return
    addObject(factory(pageId, useNotebookStore.getState().objects[pageId] ?? []))
  }
  const toolbar = (orientation: 'horizontal' | 'vertical', large: boolean) => (
    <Toolbar orientation={orientation} large={large}>
      <button
        type="button"
        className={actionBtn(large)}
        title="Add a typed solution block"
        onClick={() => add(newSolutionBlock)}
      >
        ∑ Solution
      </button>
      <button type="button" className={actionBtn(large)} onClick={() => add(newTextNote)}>
        ✎ Note
      </button>
    </Toolbar>
  )

  return (
    <div className="flex h-full flex-col" data-mode={mode}>
      <header className="flex items-center gap-2 border-b bg-white px-3 py-2">
        <a href="#/" className="rounded px-2 py-1 text-sm text-blue-700 hover:bg-slate-100">
          ← Notebooks
        </a>
        <h2 className="flex-1 truncate font-semibold">{notebook.title}</h2>
        <SaveStatus />
        {phone && (
          <button
            type="button"
            aria-expanded={drawerOpen}
            aria-controls="page-drawer"
            onClick={() => setDrawerOpen((o) => !o)}
            className="min-h-11 rounded px-3 text-sm hover:bg-slate-100"
          >
            Pages
          </button>
        )}
        <SettingsMenu mode={mode} />
      </header>
      {phone && (
        <p className="bg-amber-50 px-3 py-1 text-xs text-amber-900">
          Phone mode is for short practice and photos of your work. Use a tablet or laptop for long
          solutions.
        </p>
      )}
      <div className="relative flex min-h-0 flex-1">
        {phone ? (
          drawerOpen && (
            <div
              id="page-drawer"
              className="absolute inset-y-0 left-0 z-30 w-72 max-w-[85%] border-r bg-slate-50 shadow-xl"
            >
              <PageSidebar onNavigate={() => setDrawerOpen(false)} />
            </div>
          )
        ) : (
          <aside className={`${tablet ? 'w-48' : 'w-56'} shrink-0 border-r bg-slate-50`}>
            <PageSidebar />
          </aside>
        )}
        {tablet && <div className="shrink-0 border-r bg-white">{toolbar('vertical', true)}</div>}
        <main className="flex min-w-0 flex-1 flex-col">
          {!phone && !tablet && toolbar('horizontal', false)}
          {pageBar}
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
                    virtualKeyboard={!keyboardFirst}
                  />
                  {areas.map((a, i) => (
                    <PageSurface
                      key={a.id}
                      pageId={a.id}
                      background={a.background}
                      zoom={zoom}
                      label={`${pageTitle} — working space ${i + 1}`}
                      virtualKeyboard={!keyboardFirst}
                    />
                  ))}
                </div>
              )}
            </PageViewport>
          )}
          {phone && <div className="border-t">{toolbar('horizontal', true)}</div>}
        </main>
      </div>
    </div>
  )
}
