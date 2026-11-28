/**
 * UUIDv7 (RFC 9562): time-ordered, so sorting by id gives insertion order.
 * A 12-bit counter in `rand_a` keeps ids monotonic within the same millisecond.
 */
let lastMs = 0
let counter = 0

export function uuidv7(now: number = Date.now()): string {
  if (now <= lastMs) {
    counter += 1
    if (counter > 0xfff) {
      lastMs += 1
      counter = 0
    }
  } else {
    lastMs = now
    counter = 0
  }
  const ms = lastMs
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[0] = Math.floor(ms / 2 ** 40) & 0xff
  bytes[1] = Math.floor(ms / 2 ** 32) & 0xff
  bytes[2] = (ms >>> 24) & 0xff
  bytes[3] = (ms >>> 16) & 0xff
  bytes[4] = (ms >>> 8) & 0xff
  bytes[5] = ms & 0xff
  bytes[6] = 0x70 | ((counter >>> 8) & 0x0f)
  bytes[7] = counter & 0xff
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
