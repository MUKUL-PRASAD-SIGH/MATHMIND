import type { components } from './types'

/** Contract schemas generated from shared/contracts/openapi.yaml (`npm run gen:types`). */
export type Schemas = components['schemas']

/** Uniform error for every failed call. `status` 0 means the network/backend is unreachable. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, unknown>

  constructor(
    status: number,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  get isNetwork(): boolean {
    return this.status === 0
  }
}

/** `VITE_API_BASE_URL` is the backend origin (e.g. http://localhost:8000); empty = same origin. */
export function apiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
  const origin = base.replace(/\/+$/, '') || window.location.origin
  return `${origin}/api/v1${path}`
}

async function request<T>(
  method: string,
  path: string,
  { json, form, signal }: { json?: unknown; form?: FormData; signal?: AbortSignal } = {},
): Promise<T> {
  let res: Response
  try {
    res = await fetch(apiUrl(path), {
      method,
      signal,
      headers: json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: json !== undefined ? JSON.stringify(json) : form,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(0, 'network', 'The MathMind server could not be reached.')
  }
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!res.ok) {
    const e = (body as Partial<Schemas['ErrorResponse']> | null)?.error
    throw new ApiError(
      res.status,
      e?.code ?? `http_${res.status}`,
      e?.message ?? (res.statusText || `Request failed (${res.status})`),
      (e?.details as Record<string, unknown> | undefined) ?? {},
    )
  }
  return body as T
}

const enc = encodeURIComponent

export const api = {
  health: (signal?: AbortSignal) => request<Schemas['Health']>('GET', '/health', { signal }),

  listNotebooks: () => request<Schemas['Notebook'][]>('GET', '/notebooks'),
  createNotebook: (body: Schemas['NotebookCreate']) =>
    request<Schemas['Notebook']>('POST', '/notebooks', { json: body }),
  listPages: (notebookId: string) =>
    request<Schemas['Page'][]>('GET', `/notebooks/${enc(notebookId)}/pages`),
  upsertPage: (notebookId: string, pageId: string, body: Schemas['PageUpsert']) =>
    request<Schemas['Page']>('PUT', `/notebooks/${enc(notebookId)}/pages/${enc(pageId)}`, {
      json: body,
    }),

  submitTyped: (body: Schemas['TypedSubmissionCreate']) =>
    request<Schemas['SubmissionAccepted']>('POST', '/submissions/typed', { json: body }),
  submitImage: (input: {
    file: Blob
    pageId?: string | null
    problemId?: string | null
    bbox?: Schemas['BBox'] | null
    strokeIds?: string[] | null
  }) => {
    const form = new FormData()
    form.append('file', input.file, 'region.png')
    if (input.pageId) form.append('page_id', input.pageId)
    if (input.problemId) form.append('problem_id', input.problemId)
    if (input.bbox) form.append('bbox', JSON.stringify(input.bbox))
    if (input.strokeIds) form.append('stroke_ids', JSON.stringify(input.strokeIds))
    return request<Schemas['SubmissionAccepted']>('POST', '/submissions/image', { form })
  },
  getStatus: (id: string, signal?: AbortSignal) =>
    request<Schemas['SubmissionStatusResponse']>('GET', `/submissions/${enc(id)}/status`, {
      signal,
    }),
  confirm: (id: string, body: Schemas['ConfirmRequest']) =>
    request<Schemas['SubmissionAccepted']>('POST', `/submissions/${enc(id)}/confirm`, {
      json: body,
    }),
  startReview: (id: string) =>
    request<Schemas['SubmissionAccepted']>('POST', `/submissions/${enc(id)}/review`),
  getReview: (id: string) =>
    request<Schemas['ReviewResponse']>('GET', `/submissions/${enc(id)}/review`),

  mastery: () => request<Schemas['Mastery']>('GET', '/learners/me/mastery'),
  revision: () => request<Schemas['Revision']>('GET', '/learners/me/revision'),
  next: () => request<Schemas['NextAction']>('GET', '/learners/me/next'),
  exportMyData: () => request<Schemas['LearnerExport']>('GET', '/learners/me/export'),
  deleteMyData: () =>
    request<Schemas['DeletionSummary']>('DELETE', '/learners/me/data?confirm=true'),
}
