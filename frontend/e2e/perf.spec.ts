import { expect, test, type Page } from '@playwright/test'
import { createNotebook } from './helpers'

// T7.6 frontend numbers. Opt-in: PERF=1 npx playwright test perf --project=laptop --project=tablet
test.skip(process.env.PERF !== '1', 'set PERF=1 to run the performance benchmarks')

const inkPixels = (page: Page) =>
  page.evaluate(() => {
    const ink = document.querySelectorAll<HTMLCanvasElement>('[data-page-id] canvas')[1]
    if (!ink || ink.width === 0) return 0
    const data = ink.getContext('2d')!.getImageData(0, 0, ink.width, ink.height).data
    let n = 0
    for (let i = 3; i < data.length; i += 16) if (data[i] > 0) n++
    return n
  })

test('fast stroke: frame times while drawing', async ({ page }, info) => {
  await createNotebook(page, 'Perf ink')
  const canvas = page.getByTestId('ink-canvas').first()
  const box = (await canvas.boundingBox())!
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __last: number; __run: boolean }
    w.__frames = []
    w.__run = true
    w.__last = performance.now()
    const tick = (t: number) => {
      w.__frames.push(t - w.__last)
      w.__last = t
      if (w.__run) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const x0 = box.x + box.width * 0.1
  const y0 = box.y + Math.min(box.height * 0.5, 400)
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  for (let i = 1; i <= 240; i++) {
    await page.mouse.move(x0 + (i % 120) * 5, y0 + Math.sin(i / 6) * 60)
  }
  await page.mouse.up()
  const frames = await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __run: boolean }
    w.__run = false
    return w.__frames.slice(2)
  })
  frames.sort((a, b) => a - b)
  const pct = (p: number) =>
    frames[Math.min(frames.length - 1, Math.ceil((p / 100) * frames.length) - 1)]
  const result = {
    frames: frames.length,
    p50_ms: +pct(50).toFixed(1),
    p95_ms: +pct(95).toFixed(1),
    max_ms: +frames[frames.length - 1].toFixed(1),
  }
  console.log(`[perf] ${info.project.name} ink`, JSON.stringify(result))
  await info.attach('ink-frames.json', {
    body: JSON.stringify(result),
    contentType: 'application/json',
  })
  expect(result.p95_ms).toBeLessThan(50)
})

test('page with 500 strokes: time to redraw after a reload', async ({ page }, info) => {
  await createNotebook(page, 'Perf 500')
  const pageId = await page.locator('[data-page-id]').first().getAttribute('data-page-id')
  await page.evaluate(
    (pid) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('mathmind')
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const tx = req.result.transaction('strokes', 'readwrite')
          const store = tx.objectStore('strokes')
          for (let s = 0; s < 500; s++) {
            const x = 0.05 + (s % 25) * 0.035
            const y = 0.05 + Math.floor(s / 25) * 0.045
            const points = Array.from({ length: 30 }, (_, i) => [
              x + i * 0.001,
              y + Math.sin(i / 3) * 0.01,
            ])
            store.put({
              id: `0190000000007${String(s).padStart(3, '0')}`,
              page_id: pid,
              points,
              pressure: null,
              timestamps: null,
              tool: 'pen',
              color: '#1f2937',
              width: 2,
              bbox: { x, y: y - 0.01, w: 0.03, h: 0.02 },
              deleted: false,
            })
          }
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        }
      }),
    pageId,
  )
  const t0 = Date.now()
  await page.reload()
  await expect.poll(() => inkPixels(page), { timeout: 20_000 }).toBeGreaterThan(2000)
  const redrawMs = Date.now() - t0
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
    return {
      dom_content_loaded_ms: Math.round(n.domContentLoadedEventEnd),
      load_ms: Math.round(n.loadEventEnd),
    }
  })
  const result = { strokes: 500, reload_to_ink_ms: redrawMs, ...nav }
  console.log(`[perf] ${info.project.name} load`, JSON.stringify(result))
  await info.attach('load-500.json', {
    body: JSON.stringify(result),
    contentType: 'application/json',
  })
  expect(redrawMs).toBeLessThan(5000)
})
