import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeStroke, resetDb } from '../../test/factories'
import { PageSurface } from '../pages/PageSurface'
import { useNotebookStore } from '../store'
import { Toolbar } from './Toolbar'

const RECT = { left: 0, top: 0, width: 1000, height: 1414, right: 1000, bottom: 1414, x: 0, y: 0 }

async function openPage(): Promise<string> {
  const store = useNotebookStore.getState()
  const nb = await store.createNotebook('Tools')
  await store.openNotebook(nb.id)
  return useNotebookStore.getState().currentPageId!
}

function renderEditor(pageId: string) {
  render(
    <>
      <Toolbar />
      <PageSurface pageId={pageId} />
    </>,
  )
  const canvas = screen.getByTestId('ink-canvas')
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ ...RECT, toJSON: () => RECT })
  return canvas
}

beforeEach(async () => {
  await resetDb()
  useNotebookStore.getState().closeNotebook()
  useNotebookStore.getState().setTool('pen')
})

describe('Toolbar', () => {
  it('marks the active tool with aria-pressed', async () => {
    const pageId = await openPage()
    renderEditor(pageId)
    const user = userEvent.setup()
    expect(screen.getByRole('button', { name: 'Pen' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Pencil' }))
    expect(screen.getByRole('button', { name: 'Pencil' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Pen' })).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByRole('button', { name: 'Colour #dc2626' }))
    expect(useNotebookStore.getState().toolSettings.pencil.color).toBe('#dc2626')
  })

  it('erases a stroke with the eraser, then undo brings it back', async () => {
    const pageId = await openPage()
    const stroke = makeStroke(pageId, [
      [0.1, 0.5],
      [0.5, 0.5],
    ])
    act(() => useNotebookStore.getState().addStroke(stroke))
    const canvas = renderEditor(pageId)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Eraser' }))
    await user.pointer([
      { keys: '[MouseLeft>]', target: canvas, coords: { clientX: 300, clientY: 600 } },
      { target: canvas, coords: { clientX: 300, clientY: 707 } },
      { target: canvas, coords: { clientX: 300, clientY: 800 } },
      { keys: '[/MouseLeft]', target: canvas },
    ])
    expect(useNotebookStore.getState().strokes[pageId]).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(useNotebookStore.getState().strokes[pageId].map((s) => s.id)).toEqual([stroke.id])

    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
    expect(useNotebookStore.getState().strokes[pageId]).toEqual([])
    await user.keyboard('{Control>}z{/Control}')
    expect(useNotebookStore.getState().strokes[pageId]).toHaveLength(1)
  })

  it('draws with the pen and undoes the stroke', async () => {
    const pageId = await openPage()
    const canvas = renderEditor(pageId)
    const user = userEvent.setup()
    await user.pointer([
      { keys: '[MouseLeft>]', target: canvas, coords: { clientX: 100, clientY: 100 } },
      { target: canvas, coords: { clientX: 200, clientY: 150 } },
      { keys: '[/MouseLeft]', target: canvas },
    ])
    expect(useNotebookStore.getState().strokes[pageId]).toHaveLength(1)
    await user.keyboard('{Control>}y{/Control}') // nothing to redo
    await user.keyboard('{Control>}z{/Control}')
    expect(useNotebookStore.getState().strokes[pageId]).toHaveLength(0)
    await user.keyboard('{Control>}y{/Control}')
    expect(useNotebookStore.getState().strokes[pageId]).toHaveLength(1)
  })
})
