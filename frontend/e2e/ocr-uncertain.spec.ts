import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { createNotebook, drawStroke, lassoAndReview } from './helpers'

// EVIDENCE=1 also saves screenshots to docs/evidence/R3-1/ (mock OCR; see notes.md there).
const shot = (name: string) =>
  process.env.EVIDENCE === '1'
    ? resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/evidence/R3-1', name)
    : undefined

test('uncertain OCR asks the learner to check, never says wrong, and keeps edits', async ({
  page,
}) => {
  await createNotebook(page, 'OCR')
  await lassoAndReview(page, await drawStroke(page))

  const panel = page.getByRole('dialog', { name: 'Check recognition' })
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('not sure we read this correctly')
  await expect(panel.getByTestId('recognized-line')).toHaveCount(4)
  await expect(panel.getByText('uncertain', { exact: true })).toHaveCount(1)
  await expect(panel).not.toContainText(/\bwrong\b/i)
  // No verdict is shown before confirmation.
  await expect(page.getByTestId('review-annotations')).toHaveCount(0)
  if (shot('x')) await page.screenshot({ path: shot('screenshot-check-recognition.png') })

  await panel.getByRole('button', { name: 'Looks right' }).first().click()
  await expect(panel.getByText('✓ looks right')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()

  await page.getByRole('button', { name: 'Check recognition' }).click()
  await expect(panel.getByText('✓ looks right')).toHaveCount(1)
  if (shot('x')) await page.screenshot({ path: shot('screenshot-after-reopen.png') })
})
