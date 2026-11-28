import { newSolutionBlock } from '../../notebook/objects'
import { useNotebookStore } from '../../notebook/store'
import { api, type Schemas } from '../../services/api/client'

export const PRACTICE_NOTEBOOK = 'Practice'

/** Find a problem by id (the bank is small; filtered by concept when known). */
export async function findProblem(
  problemId: string,
  conceptId?: string,
): Promise<Schemas['Problem'] | null> {
  const list = await api.problems(conceptId)
  return list.find((p) => p.id === problemId) ?? null
}

/**
 * Open (or create) the "Practice" notebook, add a page with a solution block linked to the
 * problem, and navigate there. Linking the block is what lets the review update mastery.
 */
export async function startPractice(problem: Schemas['Problem']): Promise<void> {
  const store = useNotebookStore.getState()
  await store.loadNotebooks()
  const existing = useNotebookStore.getState().notebooks.find((n) => n.title === PRACTICE_NOTEBOOK)
  const notebook = existing ?? (await store.createNotebook(PRACTICE_NOTEBOOK, 'algebra'))
  await useNotebookStore.getState().openNotebook(notebook.id)
  const page = await useNotebookStore
    .getState()
    .addPage({ title: problem.prompt_latex.slice(0, 40) })
  await useNotebookStore.getState().goToPage(page.id)
  const s = useNotebookStore.getState()
  s.addObject(newSolutionBlock(page.id, s.objects[page.id] ?? [], problem), { record: false })
  window.location.hash = `#/nb/${notebook.id}`
}
