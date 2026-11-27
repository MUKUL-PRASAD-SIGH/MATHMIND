/**
 * MSW handlers serving the contract examples in shared/contracts/examples/*.json.
 * Enabled in the browser with VITE_USE_MOCKS=true and used by Vitest via msw/node.
 */
import { http, HttpResponse } from 'msw'
import type { Schemas } from '../services/api/client'

const files = import.meta.glob<unknown>('../../../shared/contracts/examples/*.json', {
  eager: true,
  import: 'default',
})

/** `example('Page.ruled')` → parsed JSON of shared/contracts/examples/Page.ruled.json */
export function example<T>(name: string): T {
  const key = Object.keys(files).find((k) => k.endsWith(`/${name}.json`))
  if (!key) throw new Error(`No contract example named ${name}`)
  return structuredClone(files[key]) as T
}

const API = '*/api/v1'
const statusPolls = new Map<string, number>()

export const handlers = [
  http.get(`${API}/health`, () => HttpResponse.json(example<Schemas['Health']>('Health.ok'))),

  http.get(`${API}/notebooks`, () =>
    HttpResponse.json([example<Schemas['Notebook']>('Notebook.algebra')]),
  ),

  http.post(`${API}/notebooks`, async ({ request }) => {
    const body = (await request.json()) as Schemas['NotebookCreate']
    const now = new Date().toISOString()
    const notebook: Schemas['Notebook'] = {
      id: `nb_${crypto.randomUUID().slice(0, 8)}`,
      title: body.title,
      domain: body.domain ?? null,
      created_at: now,
      updated_at: now,
    }
    return HttpResponse.json(notebook, { status: 201 })
  }),

  http.get(`${API}/notebooks/:notebookId/pages`, () =>
    HttpResponse.json([example<Schemas['Page']>('Page.ruled')]),
  ),

  http.put(`${API}/notebooks/:notebookId/pages/:pageId`, async ({ request, params }) => {
    const body = (await request.json()) as Schemas['PageUpsert']
    const page: Schemas['Page'] = {
      id: String(params.pageId),
      notebook_id: String(params.notebookId),
      chapter: body.chapter ?? null,
      order: body.order,
      title: body.title ?? null,
      background: body.background ?? 'ruled',
      bookmarked: body.bookmarked ?? false,
      version: body.version + 1,
      stroke_count: (body.strokes ?? []).filter((s) => !s.deleted).length,
    }
    return HttpResponse.json(page)
  }),

  http.post(`${API}/submissions/typed`, () =>
    HttpResponse.json(example('SubmissionAccepted.received'), { status: 202 }),
  ),

  http.post(`${API}/submissions/image`, () =>
    HttpResponse.json(example('SubmissionAccepted.received'), { status: 202 }),
  ),

  // First poll reports `verifying`, later polls `completed`.
  http.get(`${API}/submissions/:id/status`, ({ params }) => {
    const id = String(params.id)
    const n = (statusPolls.get(id) ?? 0) + 1
    statusPolls.set(id, n)
    const body = example<Schemas['SubmissionStatusResponse']>('SubmissionStatusResponse.verifying')
    return HttpResponse.json({ ...body, submission_id: id, status: n > 1 ? 'completed' : 'verifying' })
  }),

  http.post(`${API}/submissions/:id/confirm`, () =>
    HttpResponse.json(example('SubmissionAccepted.received'), { status: 202 }),
  ),

  http.post(`${API}/submissions/:id/review`, () =>
    HttpResponse.json(example('SubmissionAccepted.received'), { status: 202 }),
  ),

  http.get(`${API}/submissions/:id/review`, () =>
    HttpResponse.json(example('ReviewResponse.completed_incorrect')),
  ),

  http.get(`${API}/concepts`, () => HttpResponse.json([example('Concept.linear_equations')])),
  http.get(`${API}/problems`, () => HttpResponse.json([example('Problem.lin-003')])),
  http.get(`${API}/learners/me/mastery`, () => HttpResponse.json(example('Mastery.some_progress'))),
  http.get(`${API}/learners/me/revision`, () => HttpResponse.json(example('Revision.one_due'))),
  http.get(`${API}/learners/me/next`, () =>
    HttpResponse.json(example('NextAction.targeted_practice')),
  ),
]
