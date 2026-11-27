import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Stroke } from '../model'
import { InkCanvas } from './InkCanvas'

const RECT = { left: 0, top: 0, width: 500, height: 707, right: 500, bottom: 707, x: 0, y: 0 }

function setup(tool: 'pen' | 'lasso' = 'pen') {
  const onStrokeComplete = vi.fn<(s: Stroke) => void>()
  const onSelectArea = vi.fn()
  render(
    <InkCanvas
      pageId="pg_1"
      strokes={[]}
      tool={tool}
      color="#1f2937"
      width={2}
      onStrokeComplete={onStrokeComplete}
      onSelectArea={onSelectArea}
    />,
  )
  const canvas = screen.getByTestId('ink-canvas')
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ ...RECT, toJSON: () => RECT })
  return { canvas, onStrokeComplete, onSelectArea }
}

describe('InkCanvas', () => {
  it('turns a pointer sequence into one stroke with N normalized points', async () => {
    const { canvas, onStrokeComplete } = setup()
    const user = userEvent.setup()
    await user.pointer([
      { keys: '[MouseLeft>]', target: canvas, coords: { clientX: 50, clientY: 70.7 } },
      { target: canvas, coords: { clientX: 100, clientY: 141.4 } },
      { target: canvas, coords: { clientX: 150, clientY: 141.4 } },
      { target: canvas, coords: { clientX: 250, clientY: 353.5 } },
      { keys: '[/MouseLeft]', target: canvas },
    ])

    expect(onStrokeComplete).toHaveBeenCalledTimes(1)
    const stroke = onStrokeComplete.mock.calls[0][0]
    expect(stroke.points).toHaveLength(4)
    expect(stroke.points[0][0]).toBeCloseTo(0.1)
    expect(stroke.points[0][1]).toBeCloseTo(0.1)
    expect(stroke.points[3][0]).toBeCloseTo(0.5)
    expect(stroke.points[3][1]).toBeCloseTo(0.5)
    expect(stroke).toMatchObject({ page_id: 'pg_1', tool: 'pen', pressure: null, deleted: false })
    expect(stroke.bbox.x).toBeCloseTo(0.1)
    expect(stroke.bbox.w).toBeCloseTo(0.4)
    expect(stroke.timestamps).toHaveLength(4)
  })

  it('sets touch-action none so the browser does not scroll while writing', () => {
    const { canvas } = setup()
    expect(canvas.style.touchAction).toBe('none')
  })

  it('emits a closed selection polygon instead of a stroke for the lasso tool', async () => {
    const { canvas, onStrokeComplete, onSelectArea } = setup('lasso')
    const user = userEvent.setup()
    await user.pointer([
      { keys: '[MouseLeft>]', target: canvas, coords: { clientX: 10, clientY: 10 } },
      { target: canvas, coords: { clientX: 200, clientY: 10 } },
      { target: canvas, coords: { clientX: 200, clientY: 200 } },
      { keys: '[/MouseLeft]', target: canvas },
    ])
    expect(onStrokeComplete).not.toHaveBeenCalled()
    expect(onSelectArea).toHaveBeenCalledWith(expect.any(Array), 'lasso')
    expect(onSelectArea.mock.calls[0][0]).toHaveLength(3)
  })
})
