/**
 * T7.5 evidence capture against a running stack (docker compose). Writes docs/evidence/<case>/
 * screenshot-*.png + notes.md with the input, the expected and the observed result (from the API),
 * pass/fail, timestamp and commit. Screen recordings (clip.mp4) are still recorded by a person.
 *
 *   E2E_BASE_URL=http://localhost:8080 EVIDENCE_COMMIT=$(git rev-parse --short HEAD) \
 *     npx playwright test r2r3 -g "R2"          # with Ollama up (--profile ai)
 *   docker compose stop ollama
 *   E2E_BASE_URL=... npx playwright test r2r3 -g "R3-2"
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/evidence')
const COMMIT = process.env.EVIDENCE_COMMIT ?? 'unknown'

test.describe.configure({ mode: 'serial', timeout: 15 * 60_000 })
test.use({ viewport: { width: 1440, height: 900 } })

/** One step is a list of chunks; "{ArrowRight}" leaves a superscript in MathLive. */
type Step = string[]

async function newNotebook(page: Page, title: string) {
  await page.goto('/#/') // a bare '/' reopens the last notebook
  await page.getByLabel('New notebook title').fill(title)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

async function typeAndReview(page: Page, steps: Step[]) {
  await page.locator('math-field[aria-label="Step 1"]').focus()
  for (const [i, chunks] of steps.entries()) {
    if (i > 0) {
      await page.keyboard.press('Enter')
      await expect(page.locator(`math-field[aria-label="Step ${i + 1}"]`)).toBeFocused()
    }
    for (const c of chunks) {
      if (c === '{ArrowRight}') await page.keyboard.press('ArrowRight')
      else await page.keyboard.type(c)
    }
  }
  const accepted = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/submissions/typed') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Review my solution' }).last().focus()
  await page.keyboard.press('Enter')
  const sid = ((await (await accepted).json()) as { submission_id: string }).submission_id
  const panel = page.getByRole('complementary', { name: 'Review' })
  await expect(panel.getByTestId('review-overall')).toBeVisible({ timeout: 5 * 60_000 })
  const review = (await (
    await page.request.get(`/api/v1/submissions/${sid}/review`)
  ).json()) as ReviewJson
  return { sid, review, panel }
}

interface Observed {
  status: string
  ai_status: string
  verdicts: string[]
  first_error_step: number | null
  error_type: string | null
  recommended_action: string | null
  explanation: string | null
  hint: string | null
}

interface ReviewJson {
  status: string
  ai_status: string
  verification: { steps: { verdict: string }[]; first_error_step?: number | null } | null
  review: {
    error_type?: string | null
    recommended_action: string
    explanation: string
    hint: string
  } | null
}

function observe(review: ReviewJson): Observed {
  return {
    status: review.status,
    ai_status: review.ai_status,
    verdicts: (review.verification?.steps ?? []).map((s) => s.verdict),
    first_error_step: review.verification?.first_error_step ?? null,
    error_type: review.review?.error_type ?? null,
    recommended_action: review.review?.recommended_action ?? null,
    explanation: review.review?.explanation ?? null,
    hint: review.review?.hint ?? null,
  }
}

function writeNotes(
  id: string,
  input: string[],
  expected: string,
  runs: Observed[],
  pass: boolean,
  extra = '',
) {
  const dir = join(OUT, id)
  mkdirSync(dir, { recursive: true })
  const rows = runs
    .map(
      (o, i) =>
        `| ${i + 1} | \`${o.status}\` | \`${o.ai_status}\` | ${o.verdicts.join(', ')} | ${o.first_error_step ?? '—'} | ${o.error_type ?? '—'} | ${o.recommended_action ?? '—'} |`,
    )
    .join('\n')
  const texts = runs
    .filter((o) => o.explanation)
    .map((o, i) => `- Run ${i + 1} explanation: ${o.explanation}\n  Hint: ${o.hint}`)
    .join('\n')
  writeFileSync(
    join(dir, 'notes.md'),
    `# ${id}\n\n` +
      `- **Captured:** ${new Date().toISOString()} · commit \`${COMMIT}\` · automated (Playwright, laptop 1440×900, keyboard only) against \`docker compose\`\n` +
      `- **Input steps:** ${input.map((s) => `\`${s}\``).join(' → ')}\n` +
      `- **Expected:** ${expected}\n` +
      `- **Result:** ${pass ? '**PASS**' : '**FAIL**'}\n\n` +
      `| Run | Status | AI | Step verdicts (SymPy) | First error | LLM error type | Next action |\n|---|---|---|---|---|---|---|\n${rows}\n\n` +
      (texts ? `AI text (explains only; SymPy decides):\n\n${texts}\n\n` : '') +
      extra +
      `Screen recording (clip.mp4): _not recorded yet — record by hand for the video (T8.4)._\n`,
  )
  return dir
}

const latex = (steps: Step[]) => steps.map((s) => s.filter((c) => c !== '{ArrowRight}').join(''))

const R2A: Step[] = [['3x+5=20'], ['3x=15'], ['x=5']]
const R2B: Step[] = [['2(x-3)=10'], ['2x-3=10'], ['2x=13'], ['x=6.5']]
const R2D: Step[] = [['x^2', '{ArrowRight}', '-5x+6=0'], ['(x-2)(x+3)=0'], ['x=2,x=-3']]

test('R2-A correct linear equation', async ({ page }) => {
  await newNotebook(page, 'R2-A')
  const { review, panel } = await typeAndReview(page, R2A)
  const o = observe(review)
  const pass = o.verdicts.every((v) => v === 'supported') && o.first_error_step === null
  const dir = writeNotes('R2-A', latex(R2A), 'All steps supported; accepted result', [o], pass)
  await page.screenshot({ path: join(dir, 'screenshot-page.png') })
  await panel.screenshot({ path: join(dir, 'screenshot-review.png') })
  expect(pass).toBe(true)
})

test('R2-B algebraic error at step 2', async ({ page }) => {
  await newNotebook(page, 'R2-B')
  const { review, panel } = await typeAndReview(page, R2B)
  const o = observe(review)
  const pass = o.first_error_step === 2 && o.verdicts[1] === 'incorrect'
  const dir = writeNotes(
    'R2-B',
    latex(R2B),
    'First incorrect = step 2; mark on that step; hint',
    [o],
    pass,
    'Typed input, so the step-2 mark is the ✗ on the solution block; the red outline on an ink region is covered by the image path (`e2e/image-review.spec.ts`, mock OCR).\n\n',
  )
  const hint = panel.getByRole('button', { name: 'Show hint' })
  if (await hint.count()) await hint.click()
  await page.screenshot({ path: join(dir, 'screenshot-page.png') })
  await panel.screenshot({ path: join(dir, 'screenshot-review.png') })
  expect(pass).toBe(true)
})

test('R2-C repeat R2-A three times', async ({ page }) => {
  const runs: Observed[] = []
  for (let i = 1; i <= 3; i++) {
    await newNotebook(page, `R2-C run ${i}`)
    const { review, panel } = await typeAndReview(page, R2A)
    runs.push(observe(review))
    mkdirSync(join(OUT, 'R2-C'), { recursive: true })
    await panel.screenshot({ path: join(OUT, 'R2-C', `screenshot-run${i}.png`) })
  }
  const same = runs.every(
    (o) => o.verdicts.join() === runs[0].verdicts.join() && o.first_error_step === null,
  )
  writeNotes('R2-C', latex(R2A), 'Same correct result each time', runs, same)
  expect(same).toBe(true)
})

test('R2-D quadratic with an inserted mistake', async ({ page }) => {
  await newNotebook(page, 'R2-D')
  const { review, panel } = await typeAndReview(page, R2D)
  const o = observe(review)
  const pass = o.first_error_step === 2 && o.verdicts[1] === 'incorrect'
  const dir = writeNotes(
    'R2-D',
    latex(R2D),
    'First supported error located (step 2); relevant intervention',
    [o],
    pass,
  )
  await page.screenshot({ path: join(dir, 'screenshot-page.png') })
  await panel.screenshot({ path: join(dir, 'screenshot-review.png') })
  expect(pass).toBe(true)
})

test('R3-2 model unavailable', async ({ page }) => {
  const health = await (await page.request.get('/api/v1/health')).json()
  test.skip(health.ollama !== 'down', 'stop Ollama first: docker compose stop ollama')
  await newNotebook(page, 'R3-2')
  const { review, panel } = await typeAndReview(page, R2B)
  const o = observe(review)
  const banner = await panel
    .getByText('AI explanation unavailable — showing verified checks only.')
    .isVisible()
  mkdirSync(join(OUT, 'R3-2'), { recursive: true })
  await panel.screenshot({ path: join(OUT, 'R3-2', 'screenshot-review.png') })
  await page.reload()
  // count() would not wait for the notebook to reload from IndexedDB
  const kept = await page
    .locator('math-field[aria-label="Step 4"]')
    .waitFor({ timeout: 15_000 })
    .then(
      () => 1,
      () => 0,
    )
  const pass =
    o.status === 'completed_without_ai' && o.first_error_step === 2 && banner && kept === 1
  const dir = writeNotes(
    'R3-2',
    latex(R2B),
    'Work preserved; "AI explanation unavailable"; SymPy checks still shown',
    [o],
    pass,
    `Health before submitting: \`ollama: ${health.ollama}\`. Banner visible: ${banner}. Steps still in the notebook after a reload: ${kept === 1 ? 'yes' : 'no'}.\n\n`,
  )
  await page.screenshot({ path: join(dir, 'screenshot-after-reload.png') })
  expect(pass).toBe(true)
})
