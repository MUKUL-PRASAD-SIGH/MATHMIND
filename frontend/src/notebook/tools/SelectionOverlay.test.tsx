import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeStroke, resetDb } from '../../test/factories'
import type { Stroke } from '../model'
import { PageSurface } from '../pages/PageSurface'
import { getSelection, useNotebookStore } from '../store'

const RECT = { left: 0, top: 0, width: 1000, height: 1000, right: 1000, bottom: 1000, x: 0, y: 0 }

let pageId: string
let strokes: Stroke[]

beforeEach(async () => {
  await resetDb()
  const store = useNotebookStore.getState()
  const nb = await store.createNotebook('Select')
  await store.openNotebook(nb.id)
  pageId = useNotebookStore.getState().currentPageId!
  strokes = [
    makeStroke(pageId, [
      [0.1, 0.1],
      [0.2, 0.15],
    ]),
    makeStroke(pageId, [
      [0.25, 0.2],
      [0.35, 0.25],
    ]),
    makeStroke(pageId, [
      [0.7, 0.7],
      [0.8, 0.8],
    ]),
  ]
  act(() => strokes.forEach((s) => useNotebookStore.getState().addStroke(s)))
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    ...RECT,
    toJSON: () => RECT,
  })
})

const strokeById = (id: string) =>
  useNotebookStore.getState().strokes[pageId].find((s) => s.id === id)!

describe('lasso selection', () => {
  it('selects 2 of 3 strokes, moves them, and undo restores them', async () => {
    const user = userEvent.setup()
    render(<PageSurface pageId={pageId} />)
    act(() => useNotebookStore.getState().setTool('lasso'))
    const canvas = screen.getByTestId('ink-canvas')

    // Freeform loop around the two top-left strokes (screen px == page px * 1000).
    await user.pointer([
      { keys: '[MouseLeft>]', target: canvas, coords: { clientX: 50, clientY: 50 } },
      { target: canvas, coords: { clientX: 450, clientY: 50 } },
      { target: canvas, coords: { clientX: 450, clientY: 320 } },
      { target: canvas, coords: { clientX: 50, clientY: 320 } },
      { keys: '[/MouseLeft]', target: canvas },
    ])

    const sel = getSelection()!
    expect(sel.strokeIds.sort()).toEqual([strokes[0].id, strokes[1].id].sort())
    expect(sel.bbox).toMatchObject({ x: 0.1, y: 0.1 })
    expect(screen.getByRole('menu', { name: 'Selection (2 items)' })).toBeInTheDocument()

    // Drag the selection box 100 px right and 50 px down.
    const box = screen.getByTestId('selection-box')
    await user.pointer([
      { keys: '[MouseLeft>]', target: box, coords: { clientX: 200, clientY: 200 } },
      { target: box, coords: { clientX: 250, clientY: 220 } },
      { target: box, coords: { clientX: 300, clientY: 250 } },
      { keys: '[/MouseLeft]', target: box },
    ])
    expect(strokeById(strokes[0].id).points[0][0]).toBeCloseTo(0.2)
    expect(strokeById(strokes[0].id).points[0][1]).toBeCloseTo(0.15)
    expect(strokeById(strokes[1].id).bbox.x).toBeCloseTo(0.35)
    expect(strokeById(strokes[2].id).points).toEqual(strokes[2].points) // untouched

    act(() => useNotebookStore.getState().undo())
    const close = (v: number) => expect.closeTo(v, 10)
    expect(strokeById(strokes[0].id).points).toEqual(
      strokes[0].points.map(([x, y]) => [close(x), close(y)]),
    )
    expect(strokeById(strokes[1].id).bbox).toEqual({
      x: close(0.25),
      y: close(0.2),
      w: close(strokes[1].bbox.w),
      h: close(strokes[1].bbox.h),
    })
  })

  it('rectangle select, copy and delete from the context menu (undoable)', async () => {
    const user = userEvent.setup()
    render(<PageSurface pageId={pageId} />)
    act(() => useNotebookStore.getState().setTool('rect'))
    const canvas = screen.getByTestId('ink-canvas')
    await user.pointer([
      { keys: '[MouseLeft>]', target: canvas, coords: { clientX: 650, clientY: 650 } },
      { target: canvas, coords: { clientX: 900, clientY: 900 } },
      { keys: '[/MouseLeft]', target: canvas },
    ])
    expect(getSelection()?.strokeIds).toEqual([strokes[2].id])

    await user.click(screen.getByRole('menuitem', { name: 'Copy' }))
    expect(useNotebookStore.getState().strokes[pageId]).toHaveLength(4)
    const copyId = getSelection()!.strokeIds[0]
    expect(strokeById(copyId).points[0][0]).toBeCloseTo(0.73)

    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(useNotebookStore.getState().strokes[pageId]).toHaveLength(3)
    expect(getSelection()).toBeNull()
    act(() => useNotebookStore.getState().undo())
    expect(useNotebookStore.getState().strokes[pageId]).toHaveLength(4)
  })

  it('offers "Review this" only when a review handler is wired', async () => {
    const onReview = vi.fn()
    const user = userEvent.setup()
    render(<PageSurface pageId={pageId} onReview={onReview} />)
    act(() => {
      useNotebookStore.getState().selectArea(pageId, [
        [0, 0],
        [0.5, 0],
        [0.5, 0.5],
        [0, 0.5],
      ])
    })
    await user.click(await screen.findByRole('menuitem', { name: 'Review this' }))
    expect(onReview).toHaveBeenCalledWith('review')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })
})

describe('working space', () => {
  it('attaches an area to its parent page in the same notebook', async () => {
    const area = await act(() => useNotebookStore.getState().addWorkspace(pageId))
    const state = useNotebookStore.getState()
    expect(area).toMatchObject({ parent_page_id: pageId, notebook_id: state.notebook!.id })
    expect(state.pages.map((p) => p.id)).toContain(area.id)
    expect(state.strokes[area.id]).toEqual([])
  })
})
