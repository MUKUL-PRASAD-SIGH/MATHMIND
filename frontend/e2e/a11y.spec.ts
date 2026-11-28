import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { createNotebook, reviewWithKeyboard, typeSteps } from './helpers'

async function serious(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze()
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
}

test('notebook list, notebook, review panel and progress page: no serious axe violations', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'MathMind' })).toBeVisible()
  expect(await serious(page)).toEqual([])

  await createNotebook(page, 'A11y')
  expect(await serious(page)).toEqual([])

  await typeSteps(page, ['2(x-3)=10', '2x-3=10'])
  await reviewWithKeyboard(page)
  await expect(page.getByRole('complementary', { name: 'Review' })).toBeVisible()
  expect(await serious(page)).toEqual([])

  await page.goto('/#/progress')
  await expect(page.getByRole('heading', { name: 'Your progress' })).toBeVisible()
  expect(await serious(page)).toEqual([])
})
