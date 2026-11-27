import { expect, test } from '@playwright/test'

// 2×2 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGP4z8DwH4QZYAwAR8oH+WdZbrcAAAAASUVORK5CYII=',
  'base64',
)

test('ink: lasso a region → Review this uploads a PNG crop', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('New notebook title').fill('Review')
  await page.getByRole('button', { name: 'Create notebook' }).click()

  const canvas = page.getByTestId('ink-canvas').first()
  const box = (await canvas.boundingBox())!
  const x0 = box.x + box.width * 0.3
  const y0 = box.y + Math.min(box.height * 0.6, 500)
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(x0 + i * 10, y0 - (i % 3) * 8)
  await page.mouse.up()

  await page.getByRole('button', { name: 'Lasso select' }).click()
  const corners = [
    [x0 - 30, y0 - 50],
    [x0 + 140, y0 - 50],
    [x0 + 140, y0 + 30],
    [x0 - 30, y0 + 30],
  ]
  await page.mouse.move(corners[0][0], corners[0][1])
  await page.mouse.down()
  for (const [x, y] of corners.slice(1)) await page.mouse.move(x, y, { steps: 4 })
  await page.mouse.up()

  await expect(page.getByRole('menu', { name: 'Selection (1 item)' })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Review this' }).click()
  await expect(page.getByText('Sent for checking (received).')).toBeVisible()
})

test('image: import a photo, it appears on the page and survives a reload', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('New notebook title').fill('Photos')
  await page.getByRole('button', { name: 'Create notebook' }).click()
  await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible()

  await page.getByLabel('Import image').setInputFiles({
    name: 'work.png',
    mimeType: 'image/png',
    buffer: PNG,
  })
  await expect(page.getByRole('group', { name: 'Image' })).toBeVisible()
  await expect(page.getByRole('status').first()).toHaveText('Saved')

  await page.reload()
  await expect(page.getByRole('img', { name: 'Imported work' })).toBeVisible()
})
