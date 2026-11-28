import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { example } from '../../mocks/handlers'
import type { CachedReview } from '../../notebook/model'
import type { Schemas } from '../../services/api/client'
import { reviewsRepo } from '../../services/db/repos/reviews'
import { resetDb } from '../../test/factories'
import { AnnotationLayer } from './AnnotationLayer'
import { annotationsFor, bboxToPixels, AI_UNAVAILABLE } from './annotations'
import { ReviewPanel } from './ReviewPanel'
import { useReviewStore } from './reviewStore'

const incorrect = example<Schemas['ReviewResponse']>('ReviewResponse.completed_incorrect')
const withoutAi = example<Schemas['ReviewResponse']>('ReviewResponse.completed_without_ai')

function cache(response: Schemas['ReviewResponse'], pageId = 'pg_1'): CachedReview {
  return {
    submission_id: response.submission_id,
    page_id: pageId,
    response,
    saved_at: '2026-01-01',
  }
}

function showOnly(review: CachedReview) {
  useReviewStore.setState({
    active: null,
    byPage: { [review.page_id]: [review] },
    shownId: review.submission_id,
  })
}

beforeEach(async () => {
  await resetDb()
  useReviewStore.setState({ active: null, byPage: {}, shownId: null })
})

describe('review panel', () => {
  it('incorrect at step 2: first error, explanation, hint behind a button, next action', async () => {
    showOnly(cache(incorrect))
    const user = userEvent.setup()
    render(<ReviewPanel />)
    expect(screen.getByTestId('review-overall')).toHaveTextContent('step 2')
    expect(screen.queryByText(AI_UNAVAILABLE)).toBeNull()
    expect(screen.getByText(incorrect.review!.explanation)).toBeInTheDocument()
    expect(screen.queryByText(incorrect.review!.hint)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Show hint' }))
    expect(screen.getByText(incorrect.review!.hint)).toBeInTheDocument()
    const verdicts = [...document.querySelectorAll('[data-verdict]')].map((e) =>
      e.getAttribute('data-verdict'),
    )
    expect(verdicts).toEqual(incorrect.verification!.steps.map((s) => s.verdict))
    expect(verdicts[1]).toBe('incorrect')
  })

  it('completed_without_ai shows the banner and only the verified checks', () => {
    showOnly(cache(withoutAi))
    render(<ReviewPanel />)
    expect(screen.getByText(AI_UNAVAILABLE)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show hint' })).toBeNull()
    expect(screen.getByTestId('review-overall')).toHaveTextContent('Every step checks out')
    expect(screen.queryByRole('button', { name: /marks on page/ })).toBeNull() // typed: no regions
  })
})

describe('annotations', () => {
  it('draws green / red / grey-dashed outlines at the region boxes and a marker at step 2', async () => {
    const mixed: Schemas['ReviewResponse'] = {
      ...incorrect,
      verification: {
        ...incorrect.verification!,
        steps: incorrect.verification!.steps.map((s, i) =>
          i === 3 ? { ...s, verdict: 'inconclusive' } : s,
        ),
      },
    }
    showOnly(cache(mixed))
    const user = userEvent.setup()
    render(
      <div style={{ position: 'relative' }}>
        <AnnotationLayer pageId="pg_1" />
      </div>,
    )
    const rects = [...screen.getByTestId('review-annotations').querySelectorAll('rect')]
    expect(rects.map((r) => r.getAttribute('stroke'))).toEqual([
      '#15803d',
      '#b91c1c',
      mixed.verification!.steps[2].verdict === 'supported' ? '#15803d' : '#b91c1c',
      '#64748b',
    ])
    expect(rects[3].getAttribute('stroke-dasharray')).toBeTruthy()
    const rg2 = incorrect.regions[1].bbox
    expect(Number(rects[1].getAttribute('x'))).toBeCloseTo(rg2.x - 0.004)
    expect(Number(rects[1].getAttribute('width'))).toBeCloseTo(rg2.w + 0.008)

    await user.click(screen.getByRole('button', { name: 'Step 2 needs another look' }))
    expect(screen.getByRole('note')).toHaveTextContent(incorrect.review!.hint)
    expect(useReviewStore.getState().shownId).toBe(incorrect.submission_id)
  })

  it('dismissing hides the marks but keeps the review (and never touches ink)', async () => {
    const review = cache(incorrect)
    await reviewsRepo.put(review)
    showOnly(review)
    render(
      <>
        <AnnotationLayer pageId="pg_1" />
        <ReviewPanel />
      </>,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Hide marks on page' }))
    await waitFor(() => expect(screen.queryByTestId('review-annotations')).toBeNull())
    expect((await reviewsRepo.listByPage('pg_1'))[0].dismissed).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Show marks on page' }))
    expect(await screen.findByTestId('review-annotations')).toBeInTheDocument()
  })

  it('cached reviews load back from IndexedDB for offline display', async () => {
    await reviewsRepo.put(cache(incorrect))
    await useReviewStore.getState().loadPage('pg_1')
    render(<AnnotationLayer pageId="pg_1" />)
    await waitFor(() => expect(screen.getByTestId('review-annotations')).toBeInTheDocument())
  })

  it('maps only steps that have a region', () => {
    expect(annotationsFor(withoutAi)).toEqual([])
    const marks = annotationsFor(incorrect)
    expect(marks.map((m) => m.step)).toEqual([1, 2, 3, 4])
    expect(marks.filter((m) => m.firstError).map((m) => m.step)).toEqual([2])
  })

  it.each([0.5, 1, 2])('bbox → pixels scales with zoom %s', (zoom) => {
    const px = bboxToPixels({ x: 0.1, y: 0.2, w: 0.5, h: 0.05 }, 800, 1131, zoom)
    expect(px.x).toBeCloseTo(80 * zoom)
    expect(px.y).toBeCloseTo(226.2 * zoom)
    expect(px.w).toBeCloseTo(400 * zoom)
    expect(px.h).toBeCloseTo(56.55 * zoom)
  })
})
