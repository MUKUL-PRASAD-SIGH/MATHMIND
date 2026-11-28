import { expect, test, type Page } from '@playwright/test'
import { createNotebook, reviewWithKeyboard, typeSteps } from './helpers'

// T7.8 steps 1, 3, 4 (automated part). The screen-reader check (step 2) is still done by a person.

interface Stop {
  label: string
  visibleFocus: boolean
}

/** Press Tab n times and record each focused element and whether it shows a focus indicator. */
async function tabThrough(page: Page, n: number): Promise<Stop[]> {
  const stops: Stop[] = []
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab')
    stops.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        if (!el || el === document.body) return { label: 'body', visibleFocus: true }
        const s = getComputedStyle(el)
        const ring =
          (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) ||
          (s.boxShadow !== 'none' && s.boxShadow !== '') ||
          el.tagName === 'MATH-FIELD' // MathLive draws its own focus state inside its shadow root
        const label =
          el.getAttribute('aria-label') ||
          el.textContent?.trim().slice(0, 30) ||
          el.getAttribute('title') ||
          el.tagName.toLowerCase()
        return { label: `${el.tagName.toLowerCase()} "${label}"`, visibleFocus: ring }
      }),
    )
  }
  return stops
}

test('keyboard only: focus is always visible and never trapped on the notebook page', async ({
  page,
}) => {
  await createNotebook(page, 'Keys')
  await page.locator('body').click({ position: { x: 1, y: 1 } })
  const stops = await tabThrough(page, 60)
  const hidden = stops.filter((s) => !s.visibleFocus).map((s) => s.label)
  expect(hidden, 'elements focused without a visible focus ring').toEqual([])
  // No trap: Tab keeps moving (the same element at most twice in a row, e.g. a mathfield's inner caret stop).
  for (let i = 2; i < stops.length; i++) {
    expect(
      stops[i].label === stops[i - 1].label && stops[i].label === stops[i - 2].label,
      `focus stuck on ${stops[i].label}`,
    ).toBe(false)
  }
  const labels = stops.map((s) => s.label).join(' | ')
  if (process.env.SHOW_TABS) console.log(labels)
  expect(labels).toContain('Review my solution')
})

test('review results are not colour-only: each step has a text verdict and the marks have names', async ({
  page,
}) => {
  await createNotebook(page, 'Colour')
  await typeSteps(page, ['2(x-3)=10', '2x-3=10'])
  await reviewWithKeyboard(page)
  const panel = page.getByRole('complementary', { name: 'Review' })
  await expect(panel.getByTestId('review-overall')).toBeVisible()
  await expect(panel.getByText('Supported', { exact: true }).first()).toBeVisible()
  await expect(panel.getByText(/Not supported/).first()).toBeVisible()
  // The ✓ / ✗ next to each solution line must be announced, not just coloured.
  await expect(page.getByText('Step 1: supported', { exact: true })).toBeAttached()
  await expect(
    page.getByText('Step 2: not supported by the previous step', { exact: true }),
  ).toBeAttached()
})

test('prefers-reduced-motion: nothing animates', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await createNotebook(page, 'Motion')
  await typeSteps(page, ['2x=4', 'x=2'])
  await reviewWithKeyboard(page)
  await expect(
    page.getByRole('complementary', { name: 'Review' }).getByTestId('review-overall'),
  ).toBeVisible()
  const moving = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((el) => {
        const s = getComputedStyle(el)
        const anim = s.animationName !== 'none' && parseFloat(s.animationDuration) > 0.01
        const trans = s.transitionDuration
          .split(',')
          .some((d) => parseFloat(d) > 0.01 && s.transitionProperty !== 'none')
        return anim || trans
      })
      .map((el) => `${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 40)}`),
  )
  expect(moving).toEqual([])
})
