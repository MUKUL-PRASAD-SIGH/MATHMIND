import { beforeEach, describe, expect, it } from 'vitest'
import { uuidv7 } from '../../notebook/ids'
import type { CachedReview, Notebook, NotebookObject } from '../../notebook/model'
import { newPage } from '../../notebook/store'
import { example } from '../../mocks/handlers'
import { makeStroke, resetDb } from '../../test/factories'
import { MathMindDB } from './db'
import { notebooksRepo } from './repos/notebooks'
import { objectsRepo } from './repos/objects'
import { pagesRepo } from './repos/pages'
import { reviewsRepo } from './repos/reviews'
import { strokesRepo } from './repos/strokes'

const notebook = (): Notebook => ({
  id: uuidv7(),
  title: 'Algebra',
  domain: 'algebra',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  remote_id: null,
})

beforeEach(resetDb)

describe('schema', () => {
  it('opens version 1 on an empty database', async () => {
    const fresh = new MathMindDB(`empty-${uuidv7()}`)
    await fresh.open()
    expect(fresh.verno).toBe(1)
    expect(fresh.tables.map((t) => t.name).sort()).toEqual(
      ['notebooks', 'objects', 'pages', 'reviews', 'strokes'].sort(),
    )
    expect(await fresh.notebooks.count()).toBe(0)
    fresh.close()
  })
})

describe('notebooksRepo', () => {
  it('create → read → update → delete', async () => {
    const nb = notebook()
    await notebooksRepo.put(nb)
    expect(await notebooksRepo.get(nb.id)).toEqual(nb)
    await notebooksRepo.update(nb.id, { title: 'Renamed' })
    expect((await notebooksRepo.get(nb.id))?.title).toBe('Renamed')
    expect(await notebooksRepo.list()).toHaveLength(1)
    await notebooksRepo.remove(nb.id)
    expect(await notebooksRepo.get(nb.id)).toBeUndefined()
  })

  it('lists most recently updated first and cascades deletes', async () => {
    const a = { ...notebook(), updated_at: '2026-01-01T00:00:00Z' }
    const b = { ...notebook(), updated_at: '2026-02-01T00:00:00Z' }
    await notebooksRepo.put(a)
    await notebooksRepo.put(b)
    expect((await notebooksRepo.list()).map((n) => n.id)).toEqual([b.id, a.id])

    const page = newPage(a.id, 0)
    await pagesRepo.put(page)
    await strokesRepo.put(makeStroke(page.id, [[0.1, 0.1]]))
    await notebooksRepo.remove(a.id)
    expect(await pagesRepo.get(page.id)).toBeUndefined()
    expect(await strokesRepo.listByPage(page.id, { includeDeleted: true })).toEqual([])
  })
})

describe('pagesRepo', () => {
  it('create → read → update → delete, listed by order', async () => {
    const nbId = uuidv7()
    const p1 = newPage(nbId, 1)
    const p0 = newPage(nbId, 0)
    await pagesRepo.put(p1)
    await pagesRepo.put(p0)
    expect(await pagesRepo.get(p0.id)).toEqual(p0)
    expect((await pagesRepo.listByNotebook(nbId)).map((p) => p.id)).toEqual([p0.id, p1.id])
    await pagesRepo.update(p0.id, { background: 'squared', title: 'Intro' })
    expect(await pagesRepo.get(p0.id)).toMatchObject({ background: 'squared', title: 'Intro' })
    await pagesRepo.remove(p0.id)
    expect(await pagesRepo.get(p0.id)).toBeUndefined()
  })
})

describe('strokesRepo', () => {
  it('create → read → update → soft-delete → restore', async () => {
    const s = makeStroke('pg', [
      [0.1, 0.1],
      [0.2, 0.2],
    ])
    await strokesRepo.put(s)
    expect(await strokesRepo.get(s.id)).toEqual(s)
    await strokesRepo.update(s.id, { color: '#ff0000' })
    expect((await strokesRepo.get(s.id))?.color).toBe('#ff0000')

    await strokesRepo.softDelete([s.id])
    expect(await strokesRepo.listByPage('pg')).toEqual([])
    const kept = await strokesRepo.listByPage('pg', { includeDeleted: true })
    expect(kept).toHaveLength(1)
    expect(kept[0].points).toEqual(s.points) // original data untouched

    await strokesRepo.restore([s.id])
    expect(await strokesRepo.listByPage('pg')).toHaveLength(1)
  })

  it('listByPage returns strokes in insertion order', async () => {
    const created = Array.from({ length: 25 }, (_, i) => makeStroke('pg', [[i / 25, 0.5]]))
    for (const s of created) await strokesRepo.put(s)
    await strokesRepo.bulkPut([makeStroke('other', [[0, 0]]), makeStroke('other', [[1, 1]])])
    const listed = await strokesRepo.listByPage('pg')
    expect(listed.map((s) => s.id)).toEqual(created.map((s) => s.id))
  })
})

describe('objectsRepo', () => {
  it('create → read → update → soft-delete → restore', async () => {
    const obj: NotebookObject = {
      id: uuidv7(),
      page_id: 'pg',
      kind: 'text',
      bbox: { x: 0.1, y: 0.1, w: 0.3, h: 0.1 },
      payload: { text: 'note' },
      deleted: false,
    }
    await objectsRepo.put(obj)
    expect(await objectsRepo.get(obj.id)).toEqual(obj)
    await objectsRepo.update(obj.id, { payload: { text: 'edited' } })
    expect((await objectsRepo.get(obj.id))?.payload).toEqual({ text: 'edited' })
    await objectsRepo.softDelete([obj.id])
    expect(await objectsRepo.listByPage('pg')).toEqual([])
    expect(await objectsRepo.listByPage('pg', { includeDeleted: true })).toHaveLength(1)
    await objectsRepo.restore([obj.id])
    expect(await objectsRepo.listByPage('pg')).toHaveLength(1)
  })
})

describe('reviewsRepo', () => {
  it('create → read → update → delete', async () => {
    const review: CachedReview = {
      submission_id: 'sub_1',
      page_id: 'pg',
      response: example('ReviewResponse.completed_incorrect'),
      saved_at: '2026-01-01T00:00:00Z',
    }
    await reviewsRepo.put(review)
    expect(await reviewsRepo.get('sub_1')).toEqual(review)
    expect(await reviewsRepo.listByPage('pg')).toHaveLength(1)
    await reviewsRepo.update('sub_1', { saved_at: '2026-01-02T00:00:00Z' })
    expect((await reviewsRepo.get('sub_1'))?.saved_at).toBe('2026-01-02T00:00:00Z')
    await reviewsRepo.remove('sub_1')
    expect(await reviewsRepo.get('sub_1')).toBeUndefined()
  })
})
