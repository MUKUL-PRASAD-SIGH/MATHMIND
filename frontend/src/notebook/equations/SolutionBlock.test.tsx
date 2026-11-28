import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/setup'
import { resetDb } from '../../test/factories'
import type { EquationObject } from '../model'
import { newSolutionBlock } from '../objects'
import { ObjectLayer } from '../pages/ObjectLayer'
import { useNotebookStore } from '../store'

let pageId: string
let blockId: string

beforeEach(async () => {
  await resetDb()
  const store = useNotebookStore.getState()
  const nb = await store.createNotebook('Typed')
  await store.openNotebook(nb.id)
  pageId = useNotebookStore.getState().currentPageId!
  const block = newSolutionBlock(pageId, [])
  blockId = block.id
  act(() => useNotebookStore.getState().addObject(block))
})

const block = () =>
  useNotebookStore.getState().objects[pageId].find((o) => o.id === blockId) as EquationObject

function renderBlock() {
  render(<ObjectLayer pageId={pageId} virtualKeyboard={false} />)
  return screen.findByLabelText('Step 1')
}

describe('SolutionBlock', () => {
  it('types 2x+3=7, Enter, 2x=4 → the store has 2 steps with the right LaTeX', async () => {
    const user = userEvent.setup()
    const step1 = await renderBlock()
    await user.click(step1)
    await user.keyboard('2x+3=7{Enter}')
    const step2 = await screen.findByLabelText('Step 2')
    await waitFor(() => expect(step2).toHaveFocus())
    await user.keyboard('2x=4')

    expect(block().payload.steps.map((s) => s.latex)).toEqual(['2x+3=7', '2x=4'])
  })

  it('moves between steps with arrows and deletes an empty step with Backspace', async () => {
    const user = userEvent.setup()
    await user.click(await renderBlock())
    await user.keyboard('a{Enter}b{Enter}')
    const step3 = await screen.findByLabelText('Step 3')
    await waitFor(() => expect(step3).toHaveFocus())

    await user.keyboard('{ArrowUp}')
    expect(screen.getByLabelText('Step 2')).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(step3).toHaveFocus()

    await user.keyboard('{Backspace}')
    await waitFor(() => expect(block().payload.steps).toHaveLength(2))
    expect(screen.getByLabelText('Step 2')).toHaveFocus()
    expect(block().payload.steps.map((s) => s.latex)).toEqual(['a', 'b'])
  })

  it('inserts palette symbols into the focused step; every symbol has a label', async () => {
    const user = userEvent.setup()
    await user.click(await renderBlock())
    await user.keyboard('x')
    const palette = screen.getByRole('toolbar', { name: 'Maths symbols' })
    const buttons = within(palette).getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(11)
    buttons.forEach((b) => expect(b).toHaveAccessibleName())

    await user.click(within(palette).getByRole('button', { name: 'Pi' }))
    expect(block().payload.steps[0].latex).toBe('x\\pi')
  })

  it('"Check these steps" posts the typed steps', async () => {
    let sent: unknown
    server.use(
      http.post('*/api/v1/submissions/typed', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ submission_id: 'sub_1', status: 'received' }, { status: 202 })
      }),
    )
    const user = userEvent.setup()
    await user.click(await renderBlock())
    await user.keyboard('2x+3=7{Enter}2x=4')
    await user.click(screen.getByRole('button', { name: 'Review my solution' }))
    expect(await screen.findByRole('list', { name: 'Review progress' })).toBeInTheDocument()
    expect(sent).toEqual({
      page_id: pageId,
      problem_id: null,
      steps: [
        { latex: '2x+3=7', region_id: null },
        { latex: '2x=4', region_id: null },
      ],
    })
  })

  it('explains when the checker is offline', async () => {
    server.use(http.post('*/api/v1/submissions/typed', () => HttpResponse.error()))
    const user = userEvent.setup()
    await user.click(await renderBlock())
    await user.keyboard('1=1')
    await user.click(screen.getByRole('button', { name: 'Review my solution' }))
    expect(await screen.findByText(/checker is offline/)).toBeInTheDocument()
  })
})
