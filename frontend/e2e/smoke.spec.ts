import { expect, test } from '@playwright/test'

test('app boots and shows MathMind', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'MathMind' })).toBeVisible()
})
