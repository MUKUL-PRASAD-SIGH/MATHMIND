import { useEffect, useState } from 'react'
import { create } from 'zustand'

export type ScreenClass = 'phone' | 'tablet' | 'desktop'
export type DeviceMode = 'tablet' | 'phone' | 'laptop' | 'hybrid'

export interface Capabilities {
  anyCoarse: boolean
  anyFine: boolean
  hover: boolean
  screenClass: ScreenClass
  penSeen: boolean
  touchSeen: boolean
}

type MatchMedia = (query: string) => { matches: boolean }

/** phone < 640 ≤ tablet < 1280 ≤ desktop (CSS px). */
export function screenClassFor(width: number): ScreenClass {
  return width < 640 ? 'phone' : width < 1280 ? 'tablet' : 'desktop'
}

export function detectCapabilities(
  matchMedia: MatchMedia = window.matchMedia.bind(window),
  width: number = window.innerWidth,
  seen: { penSeen?: boolean; touchSeen?: boolean } = {},
): Capabilities {
  return {
    anyCoarse: matchMedia('(any-pointer: coarse)').matches,
    anyFine: matchMedia('(any-pointer: fine)').matches,
    hover: matchMedia('(any-hover: hover)').matches,
    screenClass: screenClassFor(width),
    penSeen: seen.penSeen ?? false,
    touchSeen: seen.touchSeen ?? false,
  }
}

/**
 * docs/02-architecture.md §2: coarse pointer → phone (< 640 px) or tablet; otherwise laptop.
 * A touch screen next to a fine pointer with hover (2-in-1), or touch seen on a laptop, is
 * hybrid.
 */
export function deriveMode(c: Capabilities): DeviceMode {
  if (c.anyCoarse) {
    if (c.screenClass === 'phone') return 'phone'
    if (c.anyFine && c.hover && !c.penSeen) return 'hybrid'
    return 'tablet'
  }
  return c.touchSeen ? 'hybrid' : 'laptop'
}

// --- Settings (persisted per device) -------------------------------------------------------

export interface DeviceSettings {
  modeOverride: DeviceMode | 'auto'
  ignoreTouchWithPen: boolean
}

const SETTINGS_KEY = 'mathmind.settings'
const DEFAULT_SETTINGS: DeviceSettings = { modeOverride: 'auto', ignoreTouchWithPen: true }

function loadSettings(): DeviceSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw
      ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<DeviceSettings>) }
      : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

interface SettingsState extends DeviceSettings {
  penSeen: boolean
  touchSeen: boolean
  update(changes: Partial<DeviceSettings>): void
  markInput(pointerType: string): void
}

export const useDeviceSettings = create<SettingsState>()((set, get) => ({
  ...loadSettings(),
  penSeen: false,
  touchSeen: false,
  update(changes) {
    set(changes)
    const { modeOverride, ignoreTouchWithPen } = get()
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ modeOverride, ignoreTouchWithPen }))
    } catch {
      // Settings still apply for this session.
    }
  },
  markInput(pointerType) {
    if (pointerType === 'pen' && !get().penSeen) set({ penSeen: true })
    if (pointerType === 'touch' && !get().touchSeen) set({ touchSeen: true })
  },
}))

/** Current device mode (manual override wins), updated on resize and pointer-type changes. */
export function useDeviceMode(): { mode: DeviceMode; caps: Capabilities } {
  const { modeOverride, penSeen, touchSeen, markInput } = useDeviceSettings()
  const [caps, setCaps] = useState(() => detectCapabilities(undefined, undefined))

  useEffect(() => {
    const refresh = () => setCaps(detectCapabilities())
    const onPointer = (e: PointerEvent) => markInput(e.pointerType)
    window.addEventListener('resize', refresh)
    window.addEventListener('pointerdown', onPointer, { capture: true, passive: true })
    return () => {
      window.removeEventListener('resize', refresh)
      window.removeEventListener('pointerdown', onPointer, { capture: true })
    }
  }, [markInput])

  const full = { ...caps, penSeen, touchSeen }
  return { mode: modeOverride === 'auto' ? deriveMode(full) : modeOverride, caps: full }
}
