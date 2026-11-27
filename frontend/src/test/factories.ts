import { uuidv7 } from '../notebook/ids'
import type { Point, Stroke } from '../notebook/model'
import { db } from '../services/db/db'

export function makeStroke(pageId: string, points: Point[], extra: Partial<Stroke> = {}): Stroke {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return {
    id: uuidv7(),
    page_id: pageId,
    points,
    pressure: null,
    timestamps: null,
    tool: 'pen',
    color: '#1f2937',
    width: 2,
    bbox: { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y },
    deleted: false,
    ...extra,
  }
}

/** Fresh, empty IndexedDB for each test. */
export async function resetDb(): Promise<void> {
  db.close()
  await db.delete()
  await db.open()
}
