import { create } from 'zustand'
import { notebooksRepo } from '../services/db/repos/notebooks'
import { objectsRepo } from '../services/db/repos/objects'
import { pagesRepo } from '../services/db/repos/pages'
import { strokesRepo } from '../services/db/repos/strokes'
import { uuidv7 } from './ids'
import type { Background, Notebook, NotebookObject, Page, Stroke, ToolName } from './model'

export interface NotebookState {
  notebooks: Notebook[]
  notebook: Notebook | null
  /** Pages and working-space areas of the open notebook, by `order`. */
  pages: Page[]
  currentPageId: string | null
  /** Live (non-deleted) strokes per page id, in insertion order. */
  strokes: Record<string, Stroke[]>
  objects: Record<string, NotebookObject[]>
  tool: ToolName
  color: string
  width: number

  loadNotebooks(): Promise<void>
  createNotebook(title: string, domain?: string | null): Promise<Notebook>
  openNotebook(id: string, pageId?: string | null): Promise<void>
  closeNotebook(): void
  addPage(opts?: { chapter?: string | null; title?: string | null }): Promise<Page>
  goToPage(id: string): Promise<void>
  loadPage(id: string): Promise<void>
  setTool(tool: ToolName): void
  setColor(color: string): void
  setWidth(width: number): void
  addStroke(stroke: Stroke): void
}

const now = () => new Date().toISOString()

export function newPage(notebookId: string, order: number, extra: Partial<Page> = {}): Page {
  return {
    id: uuidv7(),
    notebook_id: notebookId,
    chapter: null,
    order,
    title: null,
    background: 'ruled' as Background,
    bookmarked: false,
    version: 0,
    parent_page_id: null,
    updated_at: now(),
    ...extra,
  }
}

export const useNotebookStore = create<NotebookState>()((set, get) => ({
  notebooks: [],
  notebook: null,
  pages: [],
  currentPageId: null,
  strokes: {},
  objects: {},
  tool: 'pen',
  color: '#1f2937',
  width: 2,

  async loadNotebooks() {
    set({ notebooks: await notebooksRepo.list() })
  },

  async createNotebook(title, domain = null) {
    const t = now()
    const notebook: Notebook = {
      id: uuidv7(),
      title,
      domain,
      created_at: t,
      updated_at: t,
      remote_id: null,
    }
    await notebooksRepo.put(notebook)
    await pagesRepo.put(newPage(notebook.id, 0, { title: 'Page 1' }))
    set((s) => ({ notebooks: [notebook, ...s.notebooks] }))
    return notebook
  },

  async openNotebook(id, pageId = null) {
    const notebook = await notebooksRepo.get(id)
    if (!notebook) throw new Error(`Notebook ${id} not found`)
    const pages = await pagesRepo.listByNotebook(id)
    const top = pages.filter((p) => !p.parent_page_id)
    const current = top.find((p) => p.id === pageId) ?? top[0] ?? null
    set({ notebook, pages, currentPageId: current?.id ?? null, strokes: {}, objects: {} })
    if (current) await get().loadPage(current.id)
  },

  closeNotebook() {
    set({ notebook: null, pages: [], currentPageId: null, strokes: {}, objects: {} })
  },

  async addPage(opts = {}) {
    const { notebook, pages, currentPageId } = get()
    if (!notebook) throw new Error('No notebook open')
    const current = pages.find((p) => p.id === currentPageId)
    const order = pages.reduce((max, p) => Math.max(max, p.order), -1) + 1
    const top = pages.filter((p) => !p.parent_page_id)
    const page = newPage(notebook.id, order, {
      chapter: opts.chapter !== undefined ? opts.chapter : (current?.chapter ?? null),
      title: opts.title ?? `Page ${top.length + 1}`,
    })
    await pagesRepo.put(page)
    set((s) => ({ pages: [...s.pages, page], strokes: { ...s.strokes, [page.id]: [] } }))
    await get().goToPage(page.id)
    return page
  },

  async goToPage(id) {
    set({ currentPageId: id })
    await get().loadPage(id)
  },

  /** Loads a page plus its working-space areas into memory (once). */
  async loadPage(id) {
    const ids = [id, ...get().pages.filter((p) => p.parent_page_id === id).map((p) => p.id)]
    const missing = ids.filter((pid) => !get().strokes[pid] || !get().objects[pid])
    if (missing.length === 0) return
    const loaded = await Promise.all(
      missing.map(async (pid) => ({
        pid,
        strokes: await strokesRepo.listByPage(pid),
        objects: await objectsRepo.listByPage(pid),
      })),
    )
    set((s) => {
      const strokes = { ...s.strokes }
      const objects = { ...s.objects }
      for (const l of loaded) {
        strokes[l.pid] = l.strokes
        objects[l.pid] = l.objects
      }
      return { strokes, objects }
    })
  },

  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  setWidth: (width) => set({ width }),

  addStroke(stroke) {
    set((s) => ({
      strokes: { ...s.strokes, [stroke.page_id]: [...(s.strokes[stroke.page_id] ?? []), stroke] },
    }))
    void strokesRepo.put(stroke)
  },
}))
