import { expect, test } from '@playwright/test'
import { reviewWithKeyboard, typeSteps } from './helpers'

type Entry = { concept_id: string; attempts: number; mastery: number }

test('practise the recommended problem → solve it → the progress page changes', async ({
  page,
}) => {
  const next = await (await page.request.get('/api/v1/learners/me/next')).json()
  expect(next.problem_id, 'the backend recommends a problem from the bank').toBeTruthy()
  const problems = await (
    await page.request.get(`/api/v1/problems?concept=${next.concept_id}`)
  ).json()
  const problem = problems.find((p: { id: string }) => p.id === next.problem_id)
  expect(problem?.expected_answer_latex, 'the problem has an answer to type').toBeTruthy()
  const attemptsBefore =
    ((await (await page.request.get('/api/v1/learners/me/mastery')).json()).items as Entry[]).find(
      (e) => e.concept_id === next.concept_id,
    )?.attempts ?? 0

  await page.goto('/#/progress')
  await page.getByRole('button', { name: 'Practise this problem' }).click()
  await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible()
  await expect(page.getByTestId('problem-prompt')).toBeVisible()

  // Step 1 restates the problem; type the answer as step 2.
  await typeSteps(page, [problem.expected_answer_latex], 2)
  await reviewWithKeyboard(page)
  await expect(
    page.getByRole('complementary', { name: 'Review' }).getByTestId('review-overall'),
  ).toBeVisible({ timeout: 30_000 })

  await expect
    .poll(
      async () =>
        (
          (await (await page.request.get('/api/v1/learners/me/mastery')).json()).items as Entry[]
        ).find((e) => e.concept_id === next.concept_id)?.attempts ?? 0,
    )
    .toBe(attemptsBefore + 1)

  await page.goto('/#/progress')
  await expect(page.getByRole('list', { name: 'Mastery estimates' })).toBeAttached()
  const row = page.getByRole('row').filter({ hasText: String(attemptsBefore + 1) })
  await expect(row.first()).toBeVisible()
})
