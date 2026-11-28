import { expect, test } from '@playwright/test'
import { reviewWithKeyboard, typeSteps } from './helpers'

test('laptop, keyboard only: type R2-B, review, see step 2 flagged and the explanation', async ({
  page,
}) => {
  const external: string[] = []
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost')) external.push(r.url())
  })

  await page.goto('/')
  await page.getByLabel('New notebook title').fill('Typed')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-mode]')).toHaveAttribute('data-mode', 'laptop')

  await typeSteps(page, ['2(x-3)=10', '2x-3=10', '2x=13', 'x=6.5'])
  await reviewWithKeyboard(page)

  const panel = page.getByRole('complementary', { name: 'Review' })
  await expect(panel.getByTestId('review-overall')).toContainText('step 2')
  await expect(page.getByText('Step 2: not supported by the previous step')).toBeAttached()
  await panel.getByRole('button', { name: 'Show hint' }).press('Enter')
  await expect(panel.getByText('Hint:')).toBeVisible()
  expect(external).toEqual([]) // no third-party requests (fonts, CDNs, paid APIs)
})
