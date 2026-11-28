import { expect, test } from '@playwright/test'

test('laptop: type a multi-step solution with the keyboard and check it', async ({ page }) => {
  const external: string[] = []
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost')) external.push(r.url())
  })

  await page.goto('/')
  await page.getByLabel('New notebook title').fill('Typed')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-mode]')).toHaveAttribute('data-mode', 'laptop')

  // Laptop mode starts an empty page with a solution block.
  await page.locator('math-field[aria-label="Step 1"]').focus()
  await page.keyboard.type('2x+3=7')
  await page.keyboard.press('Enter')
  await expect(page.locator('math-field[aria-label="Step 2"]')).toBeFocused()
  await page.keyboard.type('2x=4')

  const values = await page.evaluate(() =>
    [...document.querySelectorAll('math-field')].map(
      (m) => (m as HTMLElement & { value: string }).value,
    ),
  )
  expect(values).toEqual(['2x+3=7', '2x=4'])

  await page.getByRole('button', { name: 'Check these steps' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText(/Sent for checking/)).toBeVisible()
  expect(external).toEqual([])
})
