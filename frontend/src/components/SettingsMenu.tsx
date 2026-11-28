import { useDeviceSettings, type DeviceMode } from '../services/device/capabilities'

const MODES: { value: DeviceMode | 'auto'; label: string }[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'laptop', label: 'Laptop (keyboard first)' },
  { value: 'tablet', label: 'Tablet (ink first)' },
  { value: 'phone', label: 'Phone (short practice)' },
  { value: 'hybrid', label: '2-in-1 (hybrid)' },
]

export function SettingsMenu({ mode }: { mode: DeviceMode }) {
  const { modeOverride, ignoreTouchWithPen, update } = useDeviceSettings()
  return (
    <details className="relative">
      <summary className="flex min-h-9 min-w-9 shrink-0 cursor-pointer list-none items-center rounded px-2 text-sm hover:bg-slate-100">
        <span aria-hidden>⚙</span>
        <span className="sr-only sm:not-sr-only sm:ml-1">Settings</span>
      </summary>
      <div className="absolute right-0 z-40 mt-1 flex w-64 flex-col gap-3 rounded-lg border bg-white p-3 text-sm shadow-lg">
        <div className="flex flex-col gap-1">
          <label htmlFor="device-mode">Device mode</label>
          <select
            id="device-mode"
            value={modeOverride}
            onChange={(e) => update({ modeOverride: e.target.value as DeviceMode | 'auto' })}
            className="rounded border px-2 py-1"
          >
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">Current: {mode}</span>
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={ignoreTouchWithPen}
            onChange={(e) => update({ ignoreTouchWithPen: e.target.checked })}
          />
          Ignore touch when a pen is detected
        </label>
      </div>
    </details>
  )
}
