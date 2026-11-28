import { expect, test } from '@playwright/test'

test('offline: drawing still saves locally and is there after reconnecting', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await page.getByLabel('New notebook title').fill('Offline')
  await page.getByRole('button', { name: 'Create notebook' }).click()
  await expect(page.getByRole('heading', { name: 'Offline' })).toBeVisible()

  await context.setOffline(true)
  const box = (await page.getByTestId('ink-canvas').first().boundingBox())!
  const x0 = box.x + box.width * 0.5
  const y0 = box.y + Math.min(box.height * 0.6, 500)
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(x0 + i * 10, y0 + (i % 2) * 20)
  await page.mouse.up()
  await expect(page.getByRole('status').first()).toHaveText('Saved')

  const count = () =>
    page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const req = indexedDB.open('mathmind')
          req.onerror = () => reject(req.error)
          req.onsuccess = () => {
            const all = req.result.transaction('strokes').objectStore('strokes').getAll()
            all.onsuccess = () => resolve(all.result.length)
          }
        }),
    )
  expect(await count()).toBe(1)

  await context.setOffline(false)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Offline' })).toBeVisible()
  expect(await count()).toBe(1)
})
