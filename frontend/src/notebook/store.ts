import { create } from 'zustand'
import { notebooksRepo } from '../services/db/repos/notebooks'
import { objectsRepo } from '../services/db/repos/objects'
import { pagesRepo } from '../services/db/repos/pages'
import { strokesRepo } from '../services/db/repos/strokes'
import { strokeHit } from './canvas/geometry'
import { uuidv7 } from './ids'
import {
  PAGE_ASPECT,
  type Background,
  type InkTool,
  type Notebook,
  type NotebookObject,
  type Page,
  type Point,
  type Stroke,
  type ToolName,
} from './model'
import { History, type Command } from './tools/history'

export interface ToolSettings {
  color: string
  width: number
}

export interface NotebookState {
  notebooks: Notebook[]
  notebook: Notebook | null
  /** Pages and working-space areas of the open notebook, by `order`. */
  pages: Page[]
  currentPageId: string | null
  /** Surface (page or working-space area) last edited; undo/redo target it. */
  activePageId: string | null
  /** Live (non-deleted) strokes per page id, in insertion order. */
  strokes: Record<string, Stroke[]>
  objects: Record<string, NotebookObject[]>
  tool: ToolName
  toolSettings: Record<InkTool, ToolSettings>
  /** Bumped on every history change so undo/redo buttons re-render. */
  historyVersion: number

  loadNotebooks(): Promise<void>
  createNotebook(title: string, domain?: string | null): Promise<Notebook>
  openNotebook(id: string, pageId?: string | null): Promise<void>
  closeNotebook(): void
  addPage(opts?: { chapter?: string | null; title?: string | null }): Promise<Page>
  goToPage(id: string): Promise<void>
  loadPage(id: string): Promise<void>

  setTool(tool: ToolName): void
  setToolSettings(tool: InkTool, settings: Partial<ToolSettings>): void

  addStroke(stroke: Stroke): void
  /** Stroke eraser: soft-deletes strokes hit by the eraser path; one undo step per gesture. */
  erase(pageId: string, segment: Point[], phase: 'start' | 'move' | 'end'): void
  execute(cmd: Command): void
  undo(pageId?: string): void
  redo(pageId?: string): void
  canUndo(pageId?: string): boolean
  canRedo(pageId?: string): boolean
}

/** Eraser radius in page-width units (≈ 10 px on a 1000 px page). */
export const ERASER_RADIUS = 0.01

const now = () => new Date().toISOString()
const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

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

export const history = new History<Command>()

/** Persist a change to IndexedDB. */
function persist(task: () => Promise<unknown>): void {
  void task()
}

/** Strokes erased by the gesture in progress, per page. */
const erasing = new Map<string, Stroke[]>()

export const useNotebookStore = create<NotebookState>()((set, get) => {
  const translate = (pageId: string, strokeIds: string[], objectIds: string[], dx: number, dy: number) => {
    const sIds = new Set(strokeIds)
    const oIds = new Set(objectIds)
    const moved: Stroke[] = []
    const movedObjects: NotebookObject[] = []
    set((s) => ({
      strokes: {
        ...s.strokes,
        [pageId]: (s.strokes[pageId] ?? []).map((st) => {
          if (!sIds.has(st.id)) return st
          const next = {
            ...st,
            points: st.points.map(([x, y]) => [x + dx, y + dy]),
            bbox: { ...st.bbox, x: st.bbox.x + dx, y: st.bbox.y + dy },
          }
          moved.push(next)
          return next
        }),
      },
      objects: {
        ...s.objects,
        [pageId]: (s.objects[pageId] ?? []).map((o) => {
          if (!oIds.has(o.id)) return o
          const next = { ...o, bbox: { ...o.bbox, x: o.bbox.x + dx, y: o.bbox.y + dy } }
          movedObjects.push(next)
          return next
        }),
      },
    }))
    persist(() => strokesRepo.bulkPut(moved))
    persist(() => Promise.all(movedObjects.map((o) => objectsRepo.update(o.id, { bbox: o.bbox }))))
  }

  const insertStrokes = (pageId: string, strokes: Stroke[]) => {
    const live = strokes.map((st) => ({ ...st, deleted: false }))
    const ids = new Set(live.map((st) => st.id))
    set((s) => ({
      strokes: {
        ...s.strokes,
        [pageId]: [...(s.strokes[pageId] ?? []).filter((st) => !ids.has(st.id)), ...live].sort(byId),
      },
    }))
    persist(() => strokesRepo.bulkPut(live))
  }

  const removeStrokes = (pageId: string, ids: string[]) => {
    const gone = new Set(ids)
    set((s) => ({
      strokes: { ...s.strokes, [pageId]: (s.strokes[pageId] ?? []).filter((st) => !gone.has(st.id)) },
    }))
    persist(() => strokesRepo.softDelete(ids))
  }

  const insertObjects = (pageId: string, objects: NotebookObject[]) => {
    const live = objects.map((o) => ({ ...o, deleted: false }) as NotebookObject)
    const ids = new Set(live.map((o) => o.id))
    set((s) => ({
      objects: {
        ...s.objects,
        [pageId]: [...(s.objects[pageId] ?? []).filter((o) => !ids.has(o.id)), ...live].sort(byId),
      },
    }))
    persist(() => Promise.all(live.map((o) => objectsRepo.put(o))))
  }

  const removeObjects = (pageId: string, ids: string[]) => {
    const gone = new Set(ids)
    set((s) => ({
      objects: { ...s.objects, [pageId]: (s.objects[pageId] ?? []).filter((o) => !gone.has(o.id)) },
    }))
    persist(() => objectsRepo.softDelete(ids))
  }

  const setObjectBBox = (pageId: string, id: string, bbox: NotebookObject['bbox']) => {
    set((s) => ({
      objects: {
        ...s.objects,
        [pageId]: (s.objects[pageId] ?? []).map((o) => (o.id === id ? { ...o, bbox } : o)),
      },
    }))
    persist(() => objectsRepo.update(id, { bbox }))
  }

  const apply = (cmd: Command, dir: 1 | -1) => {
    switch (cmd.type) {
      case 'addStrokes':
        if (dir === 1) insertStrokes(cmd.pageId, cmd.strokes)
        else removeStrokes(cmd.pageId, cmd.strokes.map((s) => s.id))
        break
      case 'deleteStrokes':
        if (dir === 1) removeStrokes(cmd.pageId, cmd.strokes.map((s) => s.id))
        else insertStrokes(cmd.pageId, cmd.strokes)
        break
      case 'addObject':
        if (dir === 1) insertObjects(cmd.pageId, [cmd.object])
        else removeObjects(cmd.pageId, [cmd.object.id])
        break
      case 'deleteObjects':
        if (dir === 1) removeObjects(cmd.pageId, cmd.objects.map((o) => o.id))
        else insertObjects(cmd.pageId, cmd.objects)
        break
      case 'moveObjects':
        translate(cmd.pageId, cmd.strokeIds, cmd.objectIds, cmd.dx * dir, cmd.dy * dir)
        break
      case 'resizeObject':
        setObjectBBox(cmd.pageId, cmd.id, dir === 1 ? cmd.to : cmd.from)
        break
    }
  }

  const bump = () => set((s) => ({ historyVersion: s.historyVersion + 1 }))
  const target = () => get().activePageId ?? get().currentPageId ?? ''

  return {
    notebooks: [],
    notebook: null,
    pages: [],
    currentPageId: null,
    activePageId: null,
    strokes: {},
    objects: {},
    tool: 'pen',
    toolSettings: {
      pen: { color: '#1f2937', width: 2 },
      pencil: { color: '#374151', width: 1.5 },
      highlighter: { color: '#facc15', width: 16 },
    },
    historyVersion: 0,

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
      history.clear()
      set({
        notebook,
        pages,
        currentPageId: current?.id ?? null,
        activePageId: current?.id ?? null,
        strokes: {},
        objects: {},
      })
      if (current) await get().loadPage(current.id)
    },

    closeNotebook() {
      history.clear()
      set({
        notebook: null,
        pages: [],
        currentPageId: null,
        activePageId: null,
        strokes: {},
        objects: {},
      })
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
      set({ currentPageId: id, activePageId: id })
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
    setToolSettings: (tool, settings) =>
      set((s) => ({
        toolSettings: { ...s.toolSettings, [tool]: { ...s.toolSettings[tool], ...settings } },
      })),

    addStroke(stroke) {
      get().execute({ type: 'addStrokes', pageId: stroke.page_id, strokes: [stroke] })
    },

    erase(pageId, segment, phase) {
      if (phase === 'start') erasing.set(pageId, [])
      const acc = erasing.get(pageId) ?? []
      if (segment.length > 0) {
        const hits = (get().strokes[pageId] ?? []).filter((s) =>
          strokeHit(s, segment, ERASER_RADIUS, PAGE_ASPECT),
        )
        if (hits.length > 0) {
          acc.push(...hits)
          removeStrokes(pageId, hits.map((s) => s.id))
        }
      }
      erasing.set(pageId, acc)
      if (phase === 'end') {
        erasing.delete(pageId)
        if (acc.length > 0) {
          history.push(pageId, { type: 'deleteStrokes', pageId, strokes: acc })
          set({ activePageId: pageId })
          bump()
        }
      }
    },

    execute(cmd) {
      apply(cmd, 1)
      history.push(cmd.pageId, cmd)
      set({ activePageId: cmd.pageId })
      bump()
    },

    undo(pageId = target()) {
      const cmd = history.undo(pageId)
      if (cmd) {
        apply(cmd, -1)
        bump()
      }
    },

    redo(pageId = target()) {
      const cmd = history.redo(pageId)
      if (cmd) {
        apply(cmd, 1)
        bump()
      }
    },

    canUndo: (pageId = target()) => history.canUndo(pageId),
    canRedo: (pageId = target()) => history.canRedo(pageId),
  }
})
