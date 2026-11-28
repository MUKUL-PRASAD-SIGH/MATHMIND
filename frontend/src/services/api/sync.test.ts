import { waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { uuidv7 } from '../../notebook/ids'
import { newPage } from '../../notebook/store'
import { makeStroke, resetDb } from '../../test/factories'
import { server } from '../../test/setup'
import { notebooksRepo } from '../db/repos/notebooks'
import { pagesRepo } from '../db/repos/pages'
import { strokesRepo } from '../db/repos/strokes'
import type { Schemas } from './client'
import { PageSync, syncPage } from './sync'

let online = true
Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })

let puts: { notebookId: string; pageId: string; body: Schemas['PageUpsert'] }[]
let pageId: string
let notebookId: string
let stop: (() => void) | undefined

beforeEach(async () => {
  await resetDb()
  localStorage.clear()
  online = true
  puts = []
  server.events.on('request:start', async ({ request }) => {
    const m = /\/notebooks\/([^/]+)\/pages\/([^/]+)$/.exec(new URL(request.url).pathname)
    if (request.method === 'PUT' && m) {
      puts.push({ notebookId: m[1], pageId: m[2], body: await request.clone().json() })
    }
  })
  notebookId = uuidv7()
  await notebooksRepo.put({
    id: notebookId,
    title: 'Synced',
    domain: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    remote_id: null,
  })
  const page = newPage(notebookId, 0, { title: 'Page 1' })
  pageId = page.id
  await pagesRepo.put(page)
  await strokesRepo.put(
    makeStroke(pageId, [
      [0.1, 0.1],
      [0.2, 0.2],
    ]),
  )
  await strokesRepo.put(makeStroke(pageId, [[0.3, 0.3]], { deleted: true }))
})

afterEach(() => {
  server.events.removeAllListeners()
  stop?.()
})

describe('syncPage', () => {
  it('creates the notebook on the server once, then upserts the page with all strokes', async () => {
    expect(await syncPage(pageId)).toBe('synced')
    const nb = await notebooksRepo.get(notebookId)
    expect(nb?.remote_id).toMatch(/^nb_/)
    expect(puts).toHaveLength(1)
    expect(puts[0]).toMatchObject({ notebookId: nb!.remote_id, pageId })
    expect(puts[0].body).toMatchObject({
      title: 'Page 1',
      order: 0,
      version: 0,
      background: 'ruled',
    })
    expect(puts[0].body.strokes).toHaveLength(2) // soft-deleted strokes sync their flag too
    expect((await pagesRepo.get(pageId))?.version).toBe(1)

    await syncPage(pageId)
    expect(puts[1].body.version).toBe(1)
    expect((await notebooksRepo.get(notebookId))?.remote_id).toBe(nb!.remote_id)
  })

  it('on a version conflict adopts the server version and pushes again', async () => {
    let first = true
    server.use(
      http.put('*/api/v1/notebooks/:nb/pages/:pg', async ({ request, params }) => {
        const body = (await request.json()) as Schemas['PageUpsert']
        if (first) {
          first = false
          const error = { code: 'version_conflict', message: 'conflict', details: {} }
          return HttpResponse.json({ error }, { status: 409 })
        }
        return HttpResponse.json({
          id: String(params.pg),
          notebook_id: String(params.nb),
          chapter: null,
          order: 0,
          title: body.title ?? null,
          background: 'ruled',
          bookmarked: false,
          version: body.version + 1,
          stroke_count: 1,
        })
      }),
      http.get('*/api/v1/notebooks/:nb/pages', () =>
        HttpResponse.json([{ id: pageId, version: 7 }]),
      ),
    )
    expect(await syncPage(pageId)).toBe('synced')
    expect(puts.map((p) => p.body.version)).toEqual([0, 7])
    expect((await pagesRepo.get(pageId))?.version).toBe(8)
  })

  it('skips working-space areas (not in the contract yet)', async () => {
    const area = newPage(notebookId, 1, { parent_page_id: pageId })
    await pagesRepo.put(area)
    expect(await syncPage(area.id)).toBe('skipped')
    expect(puts).toHaveLength(0)
  })
})

describe('PageSync queue', () => {
  it('keeps pages queued while offline and flushes after the online event', async () => {
    const sync = new PageSync({ debounceMs: 0 })
    stop = sync.start()
    online = false
    sync.enqueue(pageId)
    await sync.flush()
    expect(puts).toHaveLength(0)
    expect(sync.queued).toEqual([pageId])
    expect(JSON.parse(localStorage.getItem('mathmind.syncQueue')!)).toEqual([pageId])

    online = true
    window.dispatchEvent(new Event('online'))
    await waitFor(() => expect(puts).toHaveLength(1))
    await waitFor(() => expect(sync.queued).toEqual([]))
    expect((await pagesRepo.get(pageId))?.version).toBe(1)
  })

  it('keeps the queue when the server is unreachable and retries later', async () => {
    server.use(http.post('*/api/v1/notebooks', () => HttpResponse.error()))
    const sync = new PageSync({ debounceMs: 0, retryMs: 50 })
    sync.enqueue(pageId)
    await sync.flush()
    expect(sync.queued).toEqual([pageId])

    server.resetHandlers()
    await waitFor(() => expect(puts).toHaveLength(1), { timeout: 2000 })
    await waitFor(() => expect(sync.queued).toEqual([]))
  })

  it('restores a queue persisted by a previous session', async () => {
    localStorage.setItem('mathmind.syncQueue', JSON.stringify([pageId]))
    const sync = new PageSync({ debounceMs: 0 })
    expect(sync.queued).toEqual([pageId])
    stop = sync.start()
    await waitFor(() => expect(puts).toHaveLength(1))
  })
})
