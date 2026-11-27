import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Page } from '../model'
import { useNotebookStore } from '../store'

const pageName = (p: Page, i: number) => p.title || `Page ${i + 1}`

function RenameForm({ page, onDone }: { page: Page; onDone(): void }) {
  const updatePage = useNotebookStore((s) => s.updatePage)
  const [title, setTitle] = useState(page.title ?? '')
  const [chapter, setChapter] = useState(page.chapter ?? '')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    updatePage(page.id, { title: title.trim() || null, chapter: chapter.trim() || null })
    onDone()
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-1 rounded bg-slate-50 p-2 text-sm">
      <label className="flex flex-col">
        Page title
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded border px-2 py-1"
        />
      </label>
      <label className="flex flex-col">
        Chapter
        <input
          value={chapter}
          onChange={(e) => setChapter(e.target.value)}
          className="rounded border px-2 py-1"
        />
      </label>
      <div className="flex gap-1">
        <button type="submit" className="rounded bg-blue-600 px-2 py-1 text-white">
          Save
        </button>
        <button type="button" onClick={onDone} className="rounded px-2 py-1 hover:bg-slate-200">
          Cancel
        </button>
      </div>
    </form>
  )
}

/** Pages grouped by chapter, with add, rename and up/down reordering. */
export function PageSidebar({ onNavigate }: { onNavigate?(): void }) {
  const pages = useNotebookStore((s) => s.pages)
  const currentPageId = useNotebookStore((s) => s.currentPageId)
  const goToPage = useNotebookStore((s) => s.goToPage)
  const addPage = useNotebookStore((s) => s.addPage)
  const movePage = useNotebookStore((s) => s.movePage)
  const [editing, setEditing] = useState<string | null>(null)

  const top = pages.filter((p) => !p.parent_page_id).sort((a, b) => a.order - b.order)
  const groups: { chapter: string | null; items: { page: Page; index: number }[] }[] = []
  top.forEach((page, index) => {
    const last = groups[groups.length - 1]
    if (last && last.chapter === page.chapter) last.items.push({ page, index })
    else groups.push({ chapter: page.chapter, items: [{ page, index }] })
  })

  const small =
    'min-h-8 min-w-8 rounded text-xs text-slate-600 hover:bg-slate-200 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-blue-600'

  return (
    <nav aria-label="Pages" className="flex h-full flex-col gap-2 overflow-y-auto p-2">
      {groups.map((g, gi) => (
        <section key={`${g.chapter ?? ''}-${gi}`} aria-label={g.chapter ?? 'Pages'}>
          <h3 className="px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {g.chapter ?? 'Pages'}
          </h3>
          <ol className="flex flex-col gap-1">
            {g.items.map(({ page, index }) => (
              <li key={page.id}>
                {editing === page.id ? (
                  <RenameForm page={page} onDone={() => setEditing(null)} />
                ) : (
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      aria-current={page.id === currentPageId ? 'page' : undefined}
                      onClick={() => {
                        void goToPage(page.id)
                        onNavigate?.()
                      }}
                      className="min-h-9 flex-1 truncate rounded px-2 text-left text-sm hover:bg-slate-200 aria-[current=page]:bg-blue-100 aria-[current=page]:font-semibold"
                    >
                      {page.bookmarked && (
                        <span aria-label="Bookmarked" className="mr-1 text-amber-500">
                          ★
                        </span>
                      )}
                      {pageName(page, index)}
                    </button>
                    <button
                      type="button"
                      className={small}
                      aria-label={`Move ${pageName(page, index)} up`}
                      disabled={index === 0}
                      onClick={() => movePage(page.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={small}
                      aria-label={`Move ${pageName(page, index)} down`}
                      disabled={index === top.length - 1}
                      onClick={() => movePage(page.id, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className={small}
                      aria-label={`Rename ${pageName(page, index)}`}
                      onClick={() => setEditing(page.id)}
                    >
                      ✎
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}
      <button
        type="button"
        onClick={() => void addPage().then(() => onNavigate?.())}
        className="min-h-9 rounded border border-dashed border-slate-400 text-sm text-slate-700 hover:bg-white"
      >
        + Add page
      </button>
    </nav>
  )
}
