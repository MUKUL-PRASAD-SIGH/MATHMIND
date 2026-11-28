import { expect, test } from '@playwright/test'
import { createNotebook, drawStroke, lassoAndReview } from './helpers'

// 2×2 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGP4z8DwH4QZYAwAR8oH+WdZbrcAAAAASUVORK5CYII=',
  'base64',
)

test('ink: lasso → confirm the low-confidence line → red outline on the right region', async ({
  page,
}) => {
  await createNotebook(page, 'Review')
  await lassoAndReview(page, await drawStroke(page))

  const panel = page.getByRole('dialog', { name: 'Check recognition' })
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: 'Continue checking' }).click()

  const marks = page.getByTestId('review-annotations')
  await expect(marks).toBeVisible()
  const red = marks.locator('rect[data-verdict="incorrect"]')
  await expect(red).toHaveCount(1)
  await expect(red).toHaveAttribute('data-region-id', 'rg_2')
  await expect(page.getByRole('button', { name: 'Step 2 needs another look' })).toBeVisible()

  // Annotations come back after a reload (cached in IndexedDB).
  await page.reload()
  await expect(page.getByTestId('review-annotations')).toBeVisible()
})

test('image: import a photo, it appears on the page and survives a reload', async ({ page }) => {
  await createNotebook(page, 'Photos')
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
