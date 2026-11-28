import type { CachedReview } from '../../../notebook/model'
import { db } from '../db'

export const reviewsRepo = {
  put: (review: CachedReview) => db.reviews.put(review),
  get: (submissionId: string) => db.reviews.get(submissionId),
  listByPage: (pageId: string) => db.reviews.where('page_id').equals(pageId).toArray(),
  update: (submissionId: string, changes: Partial<CachedReview>) =>
    db.reviews.update(submissionId, changes),
  remove: (submissionId: string) => db.reviews.delete(submissionId),
}
