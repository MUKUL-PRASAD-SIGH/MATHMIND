/**
 * T8.4 dry run: walks the demo run sheet (docs/11-demo-script.md) on the laptop against a running stack and times
 * each segment. Handwriting OCR is replaced by typed steps (the documented fallback) because pix2tex is optional.
 * Writes docs/evidence/demo-dryrun/notes.md + screenshots. Ollama up (--profile ai), model warm:
 *
 *   E2E_BASE_URL=http://localhost:8080 EVIDENCE_COMMIT=$(git rev-parse --short HEAD) npx playwright test demo
 *
 * Segment 6 (model down) is R3-2 in r2r3.evidence.spec.ts; it is not repeated here so Ollama stays up.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { drawStroke } from './helpers'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/evidence/demo-dryrun')
const COMMIT = process.env.EVIDENCE_COMMIT ?? 'unknown'

test.describe.configure({ timeout: 15 * 60_000 })
test.use({ viewport: { width: 1440, height: 900 } })

const WITH_ERROR = ['2(x-3)=10', '2x-3=10', '2x=13', 'x=6.5']
const CORRECTED = ['2(x-3)=10', '2x-6=10', '2x=16', 'x=8']

interface Segment {
  name: string
  budget_s: number
  took_s: number
  note: string
}

async function setStep(page: Page, n: number, latex: string) {
  const field = page.locator(`math-field[aria-label="Step ${n}"]`)
  await field.focus()
  await page.keyboard.press('Control+A')
  await page.keyboard.type(latex)
}

async function review(page: Page) {
  const accepted = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/submissions/typed') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Review my solution' }).last().focus()
  await page.keyboard.press('Enter')
  const sid = ((await (await accepted).json()) as { submission_id: string }).submission_id
  const panel = page.getByRole('complementary', { name: 'Review' })
  await expect(panel.getByTestId('review-overall')).toBeVisible({ timeout: 5 * 60_000 })
  const r = (await (await page.request.get(`/api/v1/submissions/${sid}/review`)).json()) as {
    status: string
    verification: { first_error_step?: number | null; steps: { verdict: string }[] } | null
  }
  return { panel, r }
}

test('demo dry run (laptop, typed fallback)', async ({ page }) => {
  const health = await (await page.request.get('/api/v1/health')).json()
  test.skip(health.ollama !== 'up', 'start Ollama and warm the model first')
  mkdirSync(OUT, { recursive: true })
  const segments: Segment[] = []
  const timed = async (name: string, budget_s: number, fn: () => Promise<string>) => {
    const t0 = Date.now()
    const note = await fn()
    segments.push({ name, budget_s, took_s: Math.round((Date.now() - t0) / 100) / 10, note })
  }

  await timed('2 Notebook: ink, undo, reopen', 30, async () => {
    await page.goto('/#/')
    await page.getByLabel('New notebook title').fill('Algebra practice')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Algebra practice' })).toBeVisible()
    await drawStroke(page)
    await drawStroke(page)
    await page.keyboard.press('Control+Z')
    await page.waitForTimeout(1200) // autosave debounce
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Algebra practice' })).toBeVisible()
    await page.screenshot({ path: join(OUT, 'screenshot-2-notebook.png') })
    return 'created in the browser (the seeded server notebook is not pulled into IndexedDB)'
  })

  await timed('3 Laptop: keyboard equation block', 25, async () => {
    // a new notebook already has a solution block
    await expect(page.locator('math-field[aria-label="Step 1"]')).toBeVisible()
    await setStep(page, 1, WITH_ERROR[0])
    for (const [i, s] of WITH_ERROR.slice(1).entries()) {
      await page.keyboard.press('Enter')
      await expect(page.locator(`math-field[aria-label="Step ${i + 2}"]`)).toBeFocused()
      await page.keyboard.type(s)
    }
    return 'typed the 4 error-version steps (stands in for handwriting + OCR confirm)'
  })

  let errorReview = ''
  await timed('4 Review: verdicts + step-2 mark + hint', 45, async () => {
    const { panel, r } = await review(page)
    errorReview = `${r.status}; first error = step ${r.verification?.first_error_step ?? '—'}`
    const hint = panel.getByRole('button', { name: 'Show hint' })
    if (await hint.count()) await hint.click()
    await page.screenshot({ path: join(OUT, 'screenshot-4-review.png') })
    return errorReview
  })

  let fixedReview = ''
  await timed('5a Fix step 2 → re-review', 15, async () => {
    for (const [i, s] of CORRECTED.entries()) if (s !== WITH_ERROR[i]) await setStep(page, i + 1, s)
    const { r } = await review(page)
    fixedReview = `${r.status}; verdicts ${(r.verification?.steps ?? []).map((s) => s.verdict).join(', ')}`
    await page.screenshot({ path: join(OUT, 'screenshot-5-fixed.png') })
    return `${fixedReview} (a free block: no problem attached, so mastery does not move)`
  })

  let mastery = ''
  await timed('5b Progress → practise → mastery moves', 15, async () => {
    type Entry = { concept_id: string; mastery: number; attempts: number }
    const entries = async () =>
      ((await (await page.request.get('/api/v1/learners/me/mastery')).json()).items ??
        []) as Entry[]
    const next = await (await page.request.get('/api/v1/learners/me/next')).json()
    const problems = await (
      await page.request.get(`/api/v1/problems?concept=${next.concept_id}`)
    ).json()
    const problem = problems.find((p: { id: string }) => p.id === next.problem_id)
    const before = (await entries()).find((e) => e.concept_id === next.concept_id)
    await page.goto('/#/progress')
    await page.screenshot({ path: join(OUT, 'screenshot-5-progress-before.png') })
    await page.getByRole('button', { name: 'Practise this problem' }).click()
    await expect(page.getByTestId('problem-prompt')).toBeVisible()
    await page.locator('math-field[aria-label="Step 1"]').focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('math-field[aria-label="Step 2"]')).toBeFocused()
    await page.keyboard.type(problem.expected_answer_latex)
    await review(page)
    await expect
      .poll(async () => (await entries()).find((e) => e.concept_id === next.concept_id)?.attempts)
      .toBe((before?.attempts ?? 0) + 1)
    const after = (await entries()).find((e) => e.concept_id === next.concept_id)
    await page.goto('/#/progress')
    await expect(page.getByRole('heading', { name: 'Your progress' })).toBeVisible()
    await page.screenshot({ path: join(OUT, 'screenshot-5-progress-after.png') })
    mastery = `${next.concept_id} ${before?.mastery ?? 0} → ${after?.mastery}`
    return `practised ${problem.id} (\`${problem.prompt_latex ?? problem.id}\`): mastery ${mastery}`
  })

  const rows = segments
    .map(
      (s) =>
        `| ${s.name} | ${s.budget_s} s | ${s.took_s} s | ${s.took_s > s.budget_s ? '**over**' : 'ok'} | ${s.note} |`,
    )
    .join('\n')
  writeFileSync(
    join(OUT, 'notes.md'),
    `# Demo dry run (automated, laptop)\n\n` +
      `- **Run:** ${new Date().toISOString()} · commit \`${COMMIT}\` · Playwright, Chromium 1440×900, against \`docker compose --profile ai\`\n` +
      `- Machine time only (no talking, no pen); a human run is slower. Segments 1 and 7 are slides; 6 is R3-2.\n\n` +
      `| Segment | Budget | Took | | Observed |\n|---|---|---|---|---|\n${rows}\n`,
  )
  expect(errorReview).toContain('first error = step 2')
  expect(fixedReview).toContain('supported, supported, supported, supported')
  expect(mastery).not.toBe('')
})
