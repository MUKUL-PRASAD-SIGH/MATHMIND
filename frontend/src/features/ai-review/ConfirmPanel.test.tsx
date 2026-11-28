import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { example } from '../../mocks/handlers'
import type { Schemas } from '../../services/api/client'
import { server } from '../../test/setup'
import { ConfirmPanel } from './ConfirmPanel'
import { useReviewStore, type ActiveReview } from './reviewStore'

const pending = example<Schemas['ReviewResponse']>('ReviewResponse.awaiting_confirmation')

function openConfirm(extra: Partial<ActiveReview> = {}) {
  useReviewStore.setState({
    shownId: null,
    active: {
      pageId: 'pg_1',
      origin: 'selection',
      submissionId: pending.submission_id,
      status: 'awaiting_confirmation',
      phase: 'confirm',
      message: null,
      upload: null,
      regions: pending.regions,
      edits: Object.fromEntries(pending.regions.map((r) => [r.id, r.latex])),
      looksRight: {},
      confirmOpen: true,
      slow: false,
      result: null,
      ...extra,
    },
  })
}

beforeEach(() => useReviewStore.setState({ active: null, byPage: {}, shownId: null }))

describe('Check recognition panel', () => {
  it('lists the 3 recognized lines with one amber "uncertain" badge and never says wrong', async () => {
    openConfirm()
    render(<ConfirmPanel />)
    const lines = await screen.findAllByTestId('recognized-line')
    expect(lines).toHaveLength(3)
    expect(screen.getAllByText('uncertain')).toHaveLength(1)
    expect(within(lines[1]).getByText('uncertain')).toBeInTheDocument()
    expect(screen.getByText(/not sure we read this correctly/)).toBeInTheDocument()
    expect(document.body.textContent?.toLowerCase()).not.toMatch(/\bwrong\b/)
  })

  it('sends the edited line as corrected_latex and leaves the others unchanged', async () => {
    let sent: unknown
    server.use(
      http.post('*/api/v1/submissions/:id/confirm', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(
          { submission_id: pending.submission_id, status: 'verifying' },
          { status: 202 },
        )
      }),
      http.get('*/api/v1/submissions/:id/status', () =>
        HttpResponse.json({
          submission_id: pending.submission_id,
          input_mode: 'image',
          status: 'failed',
          message: 'stop here',
          updated_at: '2026-01-01T10:00:00Z',
        }),
      ),
    )
    openConfirm()
    const user = userEvent.setup()
    render(<ConfirmPanel />)
    const field = await screen.findByLabelText('Line 2')
    await user.click(screen.getAllByRole('button', { name: 'Fix it' })[1])
    expect(field).toHaveFocus()
    await user.keyboard('{Backspace}{Backspace}10')
    await user.click(screen.getAllByRole('button', { name: 'Looks right' })[0])
    await user.click(screen.getByRole('button', { name: 'Continue checking' }))
    await waitFor(() => expect(sent).toBeDefined())
    expect(sent).toEqual({
      regions: [
        { id: 'rg_1', confirmed: true, corrected_latex: null },
        { id: 'rg_2', confirmed: true, corrected_latex: '2x-3=10' },
        { id: 'rg_3', confirmed: true, corrected_latex: null },
      ],
    })
  })

  it('keeps focus inside while open; Escape closes it without losing edits', async () => {
    openConfirm()
    const user = userEvent.setup()
    const { rerender } = render(
      <>
        <button type="button">outside</button>
        <ConfirmPanel />
      </>,
    )
    await screen.findByLabelText('Line 3')
    const panel = screen.getByRole('dialog', { name: 'Check recognition' })
    for (let i = 0; i < 25; i++) {
      await user.tab()
      expect(panel.contains(document.activeElement)).toBe(true)
    }
    useReviewStore.getState().setEdit('rg_3', '2x=16')
    await user.keyboard('{Escape}')
    expect(useReviewStore.getState().active?.confirmOpen).toBe(false)
    expect(useReviewStore.getState().active?.edits.rg_3).toBe('2x=16')

    // Reopened: the edit is still there.
    useReviewStore.getState().setConfirmOpen(true)
    rerender(<ConfirmPanel />)
    expect(await screen.findByLabelText('Line 3')).toHaveProperty('value', '2x=16')
  })

  it('offers Re-crop and Type instead when the lines cannot be listed', async () => {
    openConfirm({ regions: null })
    render(<ConfirmPanel />)
    expect(screen.queryByRole('button', { name: 'Continue checking' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Re-crop' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Type instead' })).toBeInTheDocument()
  })
})
