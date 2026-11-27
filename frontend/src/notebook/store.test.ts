import { beforeEach, describe, expect, it } from 'vitest'
import { strokesRepo } from '../services/db/repos/strokes'
import { makeStroke, resetDb } from '../test/factories'
import { useNotebookStore } from './store'

beforeEach(async () => {
  await resetDb()
  useNotebookStore.getState().closeNotebook()
})

describe('useNotebookStore', () => {
  it('loads a notebook, its pages and the current page strokes from IndexedDB', async () => {
    const store = useNotebookStore.getState()
    const nb = await store.createNotebook('Algebra')
    await store.openNotebook(nb.id)
    const pageId = useNotebookStore.getState().currentPageId!
    await strokesRepo.put(makeStroke(pageId, [[0.1, 0.2]]))

    useNotebookStore.getState().closeNotebook()
    await useNotebookStore.getState().openNotebook(nb.id)

    const state = useNotebookStore.getState()
    expect(state.notebook?.title).toBe('Algebra')
    expect(state.pages).toHaveLength(1)
    expect(state.currentPageId).toBe(pageId)
    expect(state.strokes[pageId]).toHaveLength(1)
  })
})
