import { render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { example } from '../../mocks/handlers'
import type { Schemas } from '../../services/api/client'
import { server } from '../../test/setup'
import { ProgressPage } from './ProgressPage'

const some = example<Schemas['Mastery']>('Mastery.some_progress')

describe('progress page', () => {
  it('renders one mastery bar per concept from the mock data, labelled as an estimate', async () => {
    render(<ProgressPage />)
    const list = await screen.findByRole('list', { name: 'Mastery estimates' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(some.items.length)
    const first = some.items[0]
    expect(
      within(list).getByText(
        `${first.concept_name}: ${Math.round(first.mastery * 100)}% (estimate)`,
      ),
    ).toBeInTheDocument()
    expect(screen.getByTestId('mastery-chart')).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(some.items.length + 1)
    expect(await screen.findByTestId('next-up')).toHaveTextContent(
      'Practise a few more like this one.',
    )
  })

  it('shows the empty state when there is no practice yet', async () => {
    server.use(
      http.get('*/api/v1/learners/me/mastery', () => HttpResponse.json(example('Mastery.empty'))),
    )
    render(<ProgressPage />)
    expect(
      await screen.findByText('No practice yet — try a problem to see your progress.'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('mastery-chart')).toBeNull()
  })

  it('says so when the backend cannot be reached', async () => {
    server.use(http.get('*/api/v1/learners/me/mastery', () => HttpResponse.error()))
    render(<ProgressPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/offline/)
  })
})

describe('practise the recommended problem', () => {
  it('opens a Practice page whose solution block is linked to the problem', async () => {
    const { resetDb } = await import('../../test/factories')
    const { useNotebookStore } = await import('../../notebook/store')
    const userEvent = (await import('@testing-library/user-event')).default
    await resetDb()
    useNotebookStore.getState().closeNotebook()
    const user = userEvent.setup()
    render(<ProgressPage />)
    await user.click(await screen.findByRole('button', { name: 'Practise this problem' }))
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/nb\//))
    const s = useNotebookStore.getState()
    expect(s.notebook?.title).toBe('Practice')
    const block = s.objects[s.currentPageId!].find((o) => o.kind === 'equation')
    expect(block?.payload).toMatchObject({ problemId: 'lin-004', problemPrompt: '3(x+2)=21' })
  })
})
