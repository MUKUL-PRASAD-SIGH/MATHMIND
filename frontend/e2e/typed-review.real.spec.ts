import { expect, test } from '@playwright/test'
import { reviewWithKeyboard, typeSteps } from './helpers'

// Real backend, Ollama on a dead port (playwright.config.ts, E2E_REAL=1). SymPy still decides.

test.beforeEach(async ({ page }) => {
  const health = await (await page.request.get('/api/v1/health')).json()
  expect(health.ollama).toBe('down')
})

async function newTypedNotebook(page: import('@playwright/test').Page, title: string) {
  await page.goto('/')
  await page.getByLabel('New notebook title').fill(title)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

test('R2-A correct solution: every step supported, AI unavailable banner (R3)', async ({
  page,
}) => {
  await newTypedNotebook(page, 'R2-A')
  await typeSteps(page, ['3x+5=20', '3x=15', 'x=5'])
  await reviewWithKeyboard(page)

  const panel = page.getByRole('complementary', { name: 'Review' })
  await expect(panel.getByTestId('review-overall')).toHaveText('Every step checks out.', {
    timeout: 30_000,
  })
  await expect(
    panel.getByText('AI explanation unavailable — showing verified checks only.'),
  ).toBeVisible()
  await expect(panel.locator('[data-verdict="supported"]')).toHaveCount(3)
  await expect(panel.getByRole('button', { name: 'Show hint' })).toHaveCount(0)
})

test('R2-B: SymPy flags step 2 even with the AI down (R3)', async ({ page }) => {
  await newTypedNotebook(page, 'R2-B')
  await typeSteps(page, ['2(x-3)=10', '2x-3=10', '2x=13', 'x=6.5'])
  await reviewWithKeyboard(page)

  const panel = page.getByRole('complementary', { name: 'Review' })
  await expect(panel.getByTestId('review-overall')).toContainText('step 2', { timeout: 30_000 })
  await expect(
    panel.getByText('AI explanation unavailable — showing verified checks only.'),
  ).toBeVisible()
  await expect(panel.locator('[data-verdict]').nth(1)).toHaveAttribute('data-verdict', 'incorrect')
  await expect(page.getByText('Step 2: not supported by the previous step')).toBeAttached()
})
