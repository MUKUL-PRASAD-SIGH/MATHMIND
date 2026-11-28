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

// --- Submission scenario --------------------------------------------------------------------
// typed: verifying → completed. image: recognizing → awaiting_confirmation (one uncertain
// line) → POST /confirm → verifying → completed. The R2-B lines are laid out inside the
// submitted bbox, so annotations land on the learner's own ink.

const FULL_PAGE = { x: 0, y: 0, w: 1, h: 1 }
const CONFIRM_MESSAGE = "We're not sure we read this correctly. Please check."
const R2B: [string, number][] = [
  ['2(x-3)=10', 0.92],
  ['2x-3=1O', 0.41],
  ['2x=13', 0.88],
  ['x=6.5', 0.9],
]

interface MockSub {
  mode: 'typed' | 'image'
  bbox: Schemas['BBox']
  polls: number
  confirmed: boolean
  corrections?: Schemas['ConfirmRequest']
}
const subs = new Map<string, MockSub>()
let seq = 0

function mockSub(id: string): MockSub {
  let sub = subs.get(id)
  if (!sub) {
    sub = { mode: 'typed', bbox: FULL_PAGE, polls: 0, confirmed: true }
    subs.set(id, sub)
  }
  return sub
}

function mockStatus(sub: MockSub): Schemas['SubmissionStatus'] {
  if (sub.mode === 'image' && !sub.confirmed) {
    return sub.polls <= 1 ? 'recognizing' : 'awaiting_confirmation'
  }
  return sub.polls <= 1 ? 'verifying' : 'completed'
}

function mockRegions(id: string, sub: MockSub, confirmed: boolean): Schemas['RecognizedRegion'][] {
  const b = sub.bbox
  const h = b.h / R2B.length
  return R2B.map(([latex, confidence], i) => {
    const rid = `rg_${i + 1}`
    const fix = sub.corrections?.regions.find((c) => c.id === rid)
    return {
      id: rid,
      submission_id: id,
      line_index: i,
      bbox: { x: b.x, y: b.y + i * h, w: b.w, h: h * 0.9 },
      latex,
      confidence,
      confirmed: confirmed && (fix?.confirmed ?? true),
      corrected_latex: fix?.corrected_latex ?? null,
      recognizer_version: 'mock',
    }
  })
}

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

  http.post(`${API}/submissions/typed`, () => {
    const id = `sub_typed_${++seq}`
    subs.set(id, { mode: 'typed', bbox: FULL_PAGE, polls: 0, confirmed: true })
    return HttpResponse.json({ submission_id: id, status: 'received' }, { status: 202 })
  }),

  // Mirrors the backend's upload checks (type) so a broken crop fails visibly against mocks too.
  http.post(`${API}/submissions/image`, async ({ request }) => {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof Blob) || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      const error = {
        code: 'unsupported_media_type',
        message: 'PNG, JPEG or WebP only',
        details: {},
      }
      return HttpResponse.json({ error }, { status: 415 })
    }
    const bbox = form.get('bbox')
    const id = `sub_img_${++seq}`
    subs.set(id, {
      mode: 'image',
      bbox: typeof bbox === 'string' ? (JSON.parse(bbox) as Schemas['BBox']) : FULL_PAGE,
      polls: 0,
      confirmed: false,
    })
    return HttpResponse.json({ submission_id: id, status: 'received' }, { status: 202 })
  }),

  http.get(`${API}/submissions/:id/status`, ({ params }) => {
    const id = String(params.id)
    const sub = mockSub(id)
    sub.polls += 1
    const body = example<Schemas['SubmissionStatusResponse']>('SubmissionStatusResponse.verifying')
    return HttpResponse.json({
      ...body,
      submission_id: id,
      input_mode: sub.mode,
      status: mockStatus(sub),
      message: mockStatus(sub) === 'awaiting_confirmation' ? CONFIRM_MESSAGE : null,
    })
  }),

  http.post(`${API}/submissions/:id/confirm`, async ({ params, request }) => {
    const id = String(params.id)
    const sub = mockSub(id)
    if (mockStatus(sub) !== 'awaiting_confirmation') {
      const error = { code: 'not_awaiting_confirmation', message: 'Not waiting', details: {} }
      return HttpResponse.json({ error }, { status: 409 })
    }
    sub.corrections = (await request.json()) as Schemas['ConfirmRequest']
    sub.confirmed = true
    sub.polls = 0
    return HttpResponse.json({ submission_id: id, status: 'verifying' }, { status: 202 })
  }),

  http.post(`${API}/submissions/:id/review`, ({ params }) => {
    const id = String(params.id)
    const sub = mockSub(id)
    sub.polls = 0
    return HttpResponse.json({ submission_id: id, status: 'verifying' }, { status: 202 })
  }),

  // Like the backend: while awaiting confirmation it serves the regions only (no verdict);
  // other unfinished states are 404 review_not_ready.
  http.get(`${API}/submissions/:id/review`, ({ params }) => {
    const id = String(params.id)
    const sub = mockSub(id)
    const status = mockStatus(sub)
    if (status === 'awaiting_confirmation') {
      const pending: Schemas['ReviewResponse'] = {
        submission_id: id,
        status,
        verification: null,
        review: null,
        ai_status: 'pending',
        regions: mockRegions(id, sub, false),
        step_to_region: {},
      }
      return HttpResponse.json(pending)
    }
    if (status !== 'completed') {
      const error = { code: 'review_not_ready', message: 'Review is not ready yet', details: {} }
      return HttpResponse.json({ error }, { status: 404 })
    }
    const done = example<Schemas['ReviewResponse']>('ReviewResponse.completed_incorrect')
    const regions = sub.mode === 'image' ? mockRegions(id, sub, true) : []
    return HttpResponse.json({
      ...done,
      submission_id: id,
      regions,
      step_to_region: Object.fromEntries(regions.map((r) => [String(r.line_index + 1), r.id])),
    })
  }),

  http.get(`${API}/learners/me/export`, () => HttpResponse.json(example('LearnerExport.small'))),
  http.delete(`${API}/learners/me/data`, ({ request }) => {
    if (new URL(request.url).searchParams.get('confirm') !== 'true') {
      const error = { code: 'confirmation_required', message: 'Pass confirm=true', details: {} }
      return HttpResponse.json({ error }, { status: 400 })
    }
    return HttpResponse.json(example('DeletionSummary.deleted'))
  }),

  http.get(`${API}/concepts`, () => HttpResponse.json([example('Concept.linear_equations')])),
  http.get(`${API}/problems`, () => HttpResponse.json([example('Problem.lin-003')])),
  http.get(`${API}/learners/me/mastery`, () => HttpResponse.json(example('Mastery.some_progress'))),
  http.get(`${API}/learners/me/revision`, () => HttpResponse.json(example('Revision.one_due'))),
  http.get(`${API}/learners/me/next`, () =>
    HttpResponse.json(example('NextAction.targeted_practice')),
  ),
]
