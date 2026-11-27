import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { handlers } from '../mocks/handlers'

export const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  cleanup()
})
afterAll(() => server.close())

// --- jsdom gaps -------------------------------------------------------------

/** A 2D context that accepts every call; jsdom has no canvas implementation. */
function fakeContext(): CanvasRenderingContext2D {
  const state: Record<string | symbol, unknown> = {}
  return new Proxy(state, {
    get: (target, prop) => (prop in target ? target[prop] : () => undefined),
    set: (target, prop, value) => {
      target[prop] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
}

HTMLCanvasElement.prototype.getContext = function getContext() {
  return fakeContext()
} as unknown as HTMLCanvasElement['getContext']

HTMLCanvasElement.prototype.toBlob = function toBlob(cb: BlobCallback, type?: string) {
  cb(new Blob([new Uint8Array([137, 80, 78, 71])], { type: type ?? 'image/png' }))
}

if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

if (!URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:mock'
  URL.revokeObjectURL = () => {}
}

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.hasPointerCapture = () => false
}
