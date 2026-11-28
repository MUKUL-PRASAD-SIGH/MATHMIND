/**
 * Review annotations: derived from a ReviewResponse, drawn in an SVG layer above the ink.
 * They are never written into strokes or objects, so dismissing or recomputing them can't
 * touch the learner's work.
 */
import type { BBox } from '../../notebook/model'
import type { Schemas } from '../../services/api/client'

export type Verdict = Schemas['Verdict']

export interface Annotation {
  step: number
  regionId: string
  bbox: BBox
  verdict: Verdict
  reason: string
  /** The first incorrect step gets the pinned marker. */
  firstError: boolean
}

export const VERDICT_STYLE: Record<Verdict, { stroke: string; dash?: string; label: string }> = {
  supported: { stroke: '#15803d', label: 'Supported' },
  incorrect: { stroke: '#b91c1c', label: 'Not supported by the previous step' },
  inconclusive: { stroke: '#64748b', dash: '0.01 0.006', label: 'Could not be checked' },
}

/** One outline per verified step that is linked to a recognized region. */
export function annotationsFor(review: Schemas['ReviewResponse']): Annotation[] {
  const steps = review.verification?.steps ?? []
  const regions = new Map(review.regions.map((r) => [r.id, r]))
  const firstError =
    review.verification?.first_error_step ?? steps.find((s) => s.verdict === 'incorrect')?.index
  const out: Annotation[] = []
  for (const s of steps) {
    const regionId = review.step_to_region?.[String(s.index)]
    const region = regionId ? regions.get(regionId) : undefined
    if (!region) continue
    out.push({
      step: s.index,
      regionId: region.id,
      bbox: region.bbox,
      verdict: s.verdict,
      reason: s.reason,
      firstError: s.index === firstError,
    })
  }
  return out
}

/**
 * Page-normalized bbox → pixels for a page rendered `width` CSS px wide at `zoom`.
 * The SVG layer itself uses viewBox 0..1 (zoom-independent); this is for HTML callouts and
 * hit-testing, which live in screen space.
 */
export function bboxToPixels(bbox: BBox, width: number, height: number, zoom = 1): BBox {
  return {
    x: bbox.x * width * zoom,
    y: bbox.y * height * zoom,
    w: bbox.w * width * zoom,
    h: bbox.h * height * zoom,
  }
}

/** Where a recognized line sits inside the uploaded crop (for thumbnails), 0..1 of the crop. */
export function relativeTo(inner: BBox, outer: BBox): BBox {
  const w = outer.w || 1
  const h = outer.h || 1
  return { x: (inner.x - outer.x) / w, y: (inner.y - outer.y) / h, w: inner.w / w, h: inner.h / h }
}

export const RECOMMENDED_ACTION: Record<Schemas['RecommendedAction'], string> = {
  continue: 'Carry on with the next question.',
  increase_difficulty: 'Try a harder question.',
  targeted_practice: 'Practise a few more like this one.',
  prerequisite_review: 'Revise the skill this builds on first.',
  worked_example: 'Look at a worked example, then try again.',
  schedule_revision: 'Come back to this in a few days.',
  ask_another_question: 'Try another question.',
}

export const AI_UNAVAILABLE = 'AI explanation unavailable — showing verified checks only.'

/** OCR lines below this confidence get the amber "uncertain" badge (matches the backend default). */
export const UNCERTAIN_BELOW = 0.75
