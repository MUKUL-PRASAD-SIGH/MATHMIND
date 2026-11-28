import { expect, type Page } from '@playwright/test'

export async function createNotebook(page: Page, title: string) {
  await page.goto('/')
  await page.getByLabel('New notebook title').fill(title)
  await page.getByRole('button', { name: 'Create notebook' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

/** Draw a short zigzag on the first page and return where it is. */
export async function drawStroke(page: Page) {
  const canvas = page.getByTestId('ink-canvas').first()
  await canvas.scrollIntoViewIfNeeded()
  const box = (await canvas.boundingBox())!
  const x0 = box.x + box.width * 0.3
  const y0 = box.y + Math.min(box.height * 0.6, 420)
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(x0 + i * 10, y0 - (i % 3) * 8)
  await page.mouse.up()
  return { x0, y0 }
}

/** Lasso around the stroke drawn by drawStroke and send it for review. */
export async function lassoAndReview(page: Page, at: { x0: number; y0: number }) {
  await page.getByRole('button', { name: 'Lasso select' }).click()
  const { x0, y0 } = at
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
}

/** Type steps into a solution block (laptop mode), keyboard only, starting at step `first`. */
export async function typeSteps(page: Page, steps: string[], first = 1) {
  await page.locator(`math-field[aria-label="Step ${first}"]`).focus()
  for (const [i, s] of steps.entries()) {
    if (i > 0) {
      await page.keyboard.press('Enter')
      await expect(page.locator(`math-field[aria-label="Step ${first + i}"]`)).toBeFocused()
    }
    await page.keyboard.type(s)
  }
}

export async function reviewWithKeyboard(page: Page) {
  await page.getByRole('button', { name: 'Review my solution' }).last().focus()
  await page.keyboard.press('Enter')
}
