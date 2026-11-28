import { expect, test } from '@playwright/test'

test('progress page → Practise this problem → a linked solution block with the question', async ({
  page,
}) => {
  await page.goto('/#/progress')
  await expect(page.getByRole('heading', { name: 'Your progress' })).toBeVisible()
  await expect(page.getByText('(estimate)').first()).toBeVisible()
  await page.getByRole('button', { name: 'Practise this problem' }).click()
  await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible()
  await expect(page.getByTestId('problem-prompt')).toBeVisible()
  await expect(page.locator('math-field[aria-label="Step 2"]')).toBeAttached()
})
