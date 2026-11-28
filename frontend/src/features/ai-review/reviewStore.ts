/**
 * The review flow: submit → poll status → (check recognition → POST /confirm) → fetch the
 * review → cache it in IndexedDB. One review runs at a time; finished reviews are kept per
 * page so their annotations show offline after a reload.
 */
import { create } from 'zustand'
import type { BBox, CachedReview } from '../../notebook/model'
import { reviewsRepo } from '../../services/db/repos/reviews'
import { api, ApiError, type Schemas } from '../../services/api/client'
import { pollStatus } from '../../services/api/poll'

type Status = Schemas['SubmissionStatus']
type Region = Schemas['RecognizedRegion']

export type Phase = 'sending' | 'working' | 'confirm' | 'done' | 'unreadable' | 'error'

export interface ActiveReview {
  pageId: string
  /** What started it: 'selection', 'capture' or a solution block's object id. */
  origin: string
  submissionId: string | null
  status: Status | null
  phase: Phase
  message: string | null
  /** The uploaded crop and its page bbox, for recognition thumbnails. */
  upload: { blob: Blob; bbox: BBox } | null
  /** Lines to check; null when the server could not provide them. */
  regions: Region[] | null
  edits: Record<string, string>
  looksRight: Record<string, boolean>
  confirmOpen: boolean
  slow: boolean
  result: Schemas['ReviewResponse'] | null
}

interface ReviewState {
  active: ActiveReview | null
  /** Cached reviews per page id, newest last. */
  byPage: Record<string, CachedReview[]>
  /** Submission shown in the panel when no review is running. */
  shownId: string | null

  start(opts: {
    pageId: string
    origin: string
    upload?: { blob: Blob; bbox: BBox } | null
    send(): Promise<Schemas['SubmissionAccepted']>
  }): Promise<void>
  cancel(): void
  setEdit(regionId: string, latex: string): void
  setLooksRight(regionId: string, ok: boolean): void
  setConfirmOpen(open: boolean): void
  submitConfirm(): Promise<void>
  retry(): Promise<void>
  loadPage(pageId: string): Promise<void>
  show(submissionId: string | null): void
  closePanel(): void
  setDismissed(submissionId: string, dismissed: boolean): Promise<void>
}

export const SLOW_AFTER_MS = 90_000

export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    return err.isNetwork
      ? 'The checker is offline. Your work is saved in this notebook — try again later.'
      : err.message
  }
  return err instanceof Error ? err.message : 'Something went wrong.'
}

let polling: AbortController | null = null
let slowTimer: ReturnType<typeof setTimeout> | undefined

function stopPolling() {
  polling?.abort()
  polling = null
  clearTimeout(slowTimer)
}

export const useReviewStore = create<ReviewState>()((set, get) => {
  const patch = (changes: Partial<ActiveReview>, submissionId?: string) =>
    set((s) => {
      if (!s.active) return {}
      if (submissionId && s.active.submissionId !== submissionId) return {}
      return { active: { ...s.active, ...changes } }
    })

  const finish = async (submissionId: string) => {
    const response = await api.getReview(submissionId)
    const pageId = get().active?.pageId
    if (!pageId || get().active?.submissionId !== submissionId) return
    const cached: CachedReview = {
      submission_id: submissionId,
      page_id: pageId,
      response,
      saved_at: new Date().toISOString(),
    }
    // Derived data only: a failure to cache must not hide the result.
    await reviewsRepo.put(cached).catch(() => undefined)
    set((s) => ({
      byPage: {
        ...s.byPage,
        [pageId]: [
          ...(s.byPage[pageId] ?? []).filter((r) => r.submission_id !== submissionId),
          cached,
        ],
      },
      shownId: submissionId,
    }))
    patch({ phase: 'done', result: response, status: response.status }, submissionId)
  }

  const askToConfirm = async (submissionId: string, message: string | null) => {
    let regions: Region[] | null = null
    try {
      const res = await api.getReview(submissionId)
      regions = res.regions.length > 0 ? res.regions : null
    } catch {
      regions = null // server cannot list the lines yet: offer "Type instead" / "Re-crop"
    }
    patch(
      {
        phase: 'confirm',
        regions,
        confirmOpen: true,
        message: message ?? "We're not sure we read this correctly. Please check.",
        edits: Object.fromEntries((regions ?? []).map((r) => [r.id, r.corrected_latex ?? r.latex])),
      },
      submissionId,
    )
  }

  const track = async (submissionId: string) => {
    stopPolling()
    const ctrl = new AbortController()
    polling = ctrl
    slowTimer = setTimeout(() => patch({ slow: true }, submissionId), SLOW_AFTER_MS)
    patch({ phase: 'working', slow: false }, submissionId)
    try {
      const last = await pollStatus(submissionId, {
        signal: ctrl.signal,
        onUpdate: (r) => patch({ status: r.status }, submissionId),
      })
      clearTimeout(slowTimer)
      if (last.status === 'awaiting_confirmation')
        await askToConfirm(submissionId, last.message ?? null)
      else if (last.status === 'completed' || last.status === 'completed_without_ai') {
        await finish(submissionId)
      } else if (last.status === 'failed_recognition') {
        patch({
          phase: 'unreadable',
          message:
            last.message ??
            "We couldn't read this handwriting. Try a clearer crop, or type the steps instead.",
        })
      } else {
        patch({ phase: 'error', message: last.message ?? 'The check failed. Please try again.' })
      }
    } catch (err) {
      if (!ctrl.signal.aborted) patch({ phase: 'error', message: describeError(err) }, submissionId)
    } finally {
      clearTimeout(slowTimer)
    }
  }

  return {
    active: null,
    byPage: {},
    shownId: null,

    async start({ pageId, origin, upload = null, send }) {
      stopPolling()
      set({
        shownId: null,
        active: {
          pageId,
          origin,
          submissionId: null,
          status: null,
          phase: 'sending',
          message: null,
          upload,
          regions: null,
          edits: {},
          looksRight: {},
          confirmOpen: false,
          slow: false,
          result: null,
        },
      })
      try {
        const res = await send()
        if (get().active?.origin !== origin) return
        patch({ submissionId: res.submission_id, status: res.status })
        await track(res.submission_id)
      } catch (err) {
        if (get().active?.origin === origin) patch({ phase: 'error', message: describeError(err) })
      }
    },

    cancel() {
      stopPolling()
      set({ active: null })
    },

    setEdit: (id, latex) =>
      set((s) =>
        s.active ? { active: { ...s.active, edits: { ...s.active.edits, [id]: latex } } } : {},
      ),
    setLooksRight: (id, ok) =>
      set((s) =>
        s.active
          ? { active: { ...s.active, looksRight: { ...s.active.looksRight, [id]: ok } } }
          : {},
      ),
    setConfirmOpen: (open) => patch({ confirmOpen: open }),

    async submitConfirm() {
      const a = get().active
      if (!a?.submissionId || !a.regions) return
      const regions: Schemas['RegionConfirmation'][] = a.regions.map((r) => {
        const edited = (a.edits[r.id] ?? r.latex).trim()
        return {
          id: r.id,
          confirmed: true,
          corrected_latex: edited !== r.latex ? edited : null,
        }
      })
      patch({ phase: 'working', confirmOpen: false, message: null })
      try {
        await api.confirm(a.submissionId, { regions })
        await track(a.submissionId)
      } catch (err) {
        patch({ phase: 'confirm', confirmOpen: true, message: describeError(err) })
      }
    },

    async retry() {
      const a = get().active
      if (!a?.submissionId) return
      patch({ phase: 'working', message: null })
      try {
        await api.startReview(a.submissionId)
        await track(a.submissionId)
      } catch (err) {
        patch({ phase: 'error', message: describeError(err) })
      }
    },

    async loadPage(pageId) {
      const list = await reviewsRepo.listByPage(pageId).catch(() => [] as CachedReview[])
      list.sort((a, b) => (a.saved_at < b.saved_at ? -1 : 1))
      set((s) => ({ byPage: { ...s.byPage, [pageId]: list } }))
    },

    show: (submissionId) => set({ shownId: submissionId }),

    closePanel() {
      const a = get().active
      // A finished (or failed) run can be closed; a running one keeps going in the background.
      if (a && (a.phase === 'done' || a.phase === 'error' || a.phase === 'unreadable')) {
        set({ active: null })
      } else if (a?.phase === 'confirm') patch({ confirmOpen: false })
      set({ shownId: null })
    },

    async setDismissed(submissionId, dismissed) {
      await reviewsRepo.update(submissionId, { dismissed }).catch(() => undefined)
      set((s) => ({
        byPage: Object.fromEntries(
          Object.entries(s.byPage).map(([pid, list]) => [
            pid,
            list.map((r) => (r.submission_id === submissionId ? { ...r, dismissed } : r)),
          ]),
        ),
      }))
    },
  }
})

/** The cached review currently shown in the panel (finished run or picked from the page). */
export function shownReview(state: Pick<ReviewState, 'byPage' | 'shownId'>): CachedReview | null {
  if (!state.shownId) return null
  for (const list of Object.values(state.byPage)) {
    const hit = list.find((r) => r.submission_id === state.shownId)
    if (hit) return hit
  }
  return null
}
