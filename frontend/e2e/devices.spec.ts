import { expect, test } from '@playwright/test'

const viewports = [
  { name: 'phone', viewport: { width: 390, height: 844 }, hasTouch: true, mode: 'phone' },
  { name: 'tablet', viewport: { width: 1024, height: 1366 }, hasTouch: true, mode: 'tablet' },
  { name: 'laptop', viewport: { width: 1440, height: 900 }, hasTouch: false, mode: 'laptop' },
] as const

for (const v of viewports) {
  test.describe(v.name, () => {
    test.use({ viewport: v.viewport, hasTouch: v.hasTouch })

    test(`renders the ${v.mode} layout`, async ({ page }, info) => {
      await page.goto('/')
      await page.getByLabel('New notebook title').fill(`On ${v.name}`)
      await page.getByRole('button', { name: 'Create notebook' }).click()
      await expect(page.locator('[data-mode]')).toHaveAttribute('data-mode', v.mode)
      await expect(page.getByTestId('ink-canvas').first()).toBeVisible()
      await info.attach(`${v.name}.png`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      })
    })
  })
}
