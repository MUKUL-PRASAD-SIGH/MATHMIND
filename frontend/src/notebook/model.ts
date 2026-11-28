/**
 * Notebook domain types. Contract types (shared/contracts) are re-exported where they exist;
 * local-only fields are added on top. All stored coordinates are page-normalized (0..1).
 */
import type { Schemas } from '../services/api/client'

export type BBox = Schemas['BBox']
export type Background = Schemas['Background']
/** Ink tools that produce strokes (contract `Tool`). */
export type InkTool = Schemas['Tool']
/** Every toolbar tool. Eraser and selection tools never create strokes. */
export type ToolName = InkTool | 'eraser' | 'lasso' | 'rect'

/** `[x, y]`, page-normalized. */
export type Point = [number, number]

/**
 * A stroke exactly as in the contract. `width` is in px relative to a page that is
 * {@link REF_PAGE_WIDTH} px wide, so it scales with zoom. Strokes are never hard-deleted.
 */
export type Stroke = Schemas['Stroke']

/** Page height / width (A4 portrait). */
export const PAGE_ASPECT = 1.414
/** Reference page width in px that stroke widths are expressed against. */
export const REF_PAGE_WIDTH = 1000

export type Notebook = Schemas['Notebook'] & {
  /** Server id once synced (the server assigns notebook ids). */
  remote_id: string | null
}

export interface Page {
  id: string
  notebook_id: string
  chapter: string | null
  order: number
  title: string | null
  background: Background
  bookmarked: boolean
  /** Last server version seen (0 = never synced); sent back for optimistic concurrency. */
  version: number
  /** Set for a working-space area attached below its parent page (T1.8). */
  parent_page_id: string | null
  updated_at: string
}

export interface SolutionStep {
  id: string
  latex: string
}

interface ObjectBase {
  id: string
  page_id: string
  bbox: BBox
  deleted: boolean
}

export type EquationObject = ObjectBase & {
  kind: 'equation'
  /** problemId links the attempt to the problem bank (mastery); the prompt is kept for offline display. */
  payload: { steps: SolutionStep[]; problemId?: string; problemPrompt?: string }
}
export type TextObject = ObjectBase & { kind: 'text'; payload: { text: string } }
export type ImageObject = ObjectBase & {
  kind: 'image'
  /**
   * `source` is the imported file, never mutated. `image` is the downscaled working copy
   * (≤ 2048 px long side) used for display and crops.
   */
  payload: { source: Blob; image: Blob; width: number; height: number }
}
export type NotebookObject = EquationObject | TextObject | ImageObject
export type ObjectKind = NotebookObject['kind']

/** A review fetched from the backend, cached for offline viewing. Derived data only. */
export interface CachedReview {
  submission_id: string
  page_id: string
  response: Schemas['ReviewResponse']
  saved_at: string
  /** The learner hid its annotations (they can be shown again; ink is never touched). */
  dismissed?: boolean
}
