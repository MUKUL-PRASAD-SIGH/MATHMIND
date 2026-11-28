import { describe, expect, it } from 'vitest'
import { History } from './history'

describe('History', () => {
  it('undoes the last N adds in reverse order', () => {
    const h = new History<number>()
    for (let i = 1; i <= 5; i++) h.push('p', i)
    expect([h.undo('p'), h.undo('p'), h.undo('p')]).toEqual([5, 4, 3])
    expect(h.size('p')).toBe(2)
    expect([h.redo('p'), h.redo('p')]).toEqual([3, 4])
    expect(h.canRedo('p')).toBe(true)
  })

  it('clears redo after a new command', () => {
    const h = new History<string>()
    h.push('p', 'a')
    h.push('p', 'b')
    h.undo('p')
    expect(h.canRedo('p')).toBe(true)
    h.push('p', 'c')
    expect(h.canRedo('p')).toBe(false)
    expect(h.redo('p')).toBeUndefined()
    expect(h.undo('p')).toBe('c')
    expect(h.undo('p')).toBe('a')
  })

  it('enforces the cap by dropping the oldest entries', () => {
    const h = new History<number>(200)
    for (let i = 0; i < 250; i++) h.push('p', i)
    expect(h.size('p')).toBe(200)
    let last: number | undefined
    while (h.canUndo('p')) last = h.undo('p')
    expect(last).toBe(50)
  })

  it('keeps a separate stack per page', () => {
    const h = new History<number>()
    h.push('a', 1)
    h.push('b', 2)
    expect(h.undo('a')).toBe(1)
    expect(h.canUndo('a')).toBe(false)
    expect(h.canUndo('b')).toBe(true)
    expect(h.undo('missing')).toBeUndefined()
  })
})
