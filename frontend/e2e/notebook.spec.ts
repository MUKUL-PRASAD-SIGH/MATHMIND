import { expect, test, type Page } from '@playwright/test'

async function createNotebook(page: Page, title: string) {
  await page.goto('/')
  await page.getByLabel('New notebook title').fill(title)
  await page.getByRole('button', { name: 'Create notebook' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

async function drawZigzag(page: Page) {
  const canvas = page.getByTestId('ink-canvas').first()
  const box = (await canvas.boundingBox())!
  const x0 = box.x + box.width * 0.6
  const y0 = box.y + 120
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(x0 + i * 12, y0 + (i % 2 ? 30 : 0))
  await page.mouse.up()
}

/** Number of non-transparent pixels on the committed ink layer. */
function inkPixels(page: Page) {
  return page.evaluate(() => {
    const canvases = document.querySelectorAll<HTMLCanvasElement>('[data-page-id] canvas')
    const ink = canvases[1]
    const data = ink.getContext('2d')!.getImageData(0, 0, ink.width, ink.height).data
    let n = 0
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++
    return n
  })
}

test('draw → reload → the strokes are redrawn identically', async ({ page }) => {
  await createNotebook(page, 'Persistence')
  await drawZigzag(page)
  await expect.poll(() => inkPixels(page)).toBeGreaterThan(100)
  const before = await inkPixels(page)
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Persistence' })).toBeVisible()
  await expect.poll(() => inkPixels(page)).toBe(before)
})
