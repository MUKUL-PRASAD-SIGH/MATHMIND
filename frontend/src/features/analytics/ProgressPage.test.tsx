import { render, screen, within } from '@testing-library/react'
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
