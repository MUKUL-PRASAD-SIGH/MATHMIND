import { useState } from 'react'
import { collectExport, deleteEverything, downloadJson, type DeleteOutcome } from './privacy'

/** "Your data": export everything as JSON, or delete it all (with an in-page confirmation). */
export function PrivacyPanel() {
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const onExport = async () => {
    setBusy('export')
    setMessage(null)
    try {
      const data = await collectExport()
      downloadJson(data, `mathmind-export-${data.exported_at.slice(0, 10)}.json`)
      setMessage(
        'unavailable' in data.server
          ? `Exported this browser's notebooks. The server copy was not included: ${data.server.unavailable}`
          : 'Exported your notebooks and your reviews from the server.',
      )
    } finally {
      setBusy(null)
    }
  }

  const onDelete = async () => {
    setBusy('delete')
    setMessage(null)
    let outcome: DeleteOutcome
    try {
      outcome = await deleteEverything()
    } finally {
      setBusy(null)
      setConfirming(false)
    }
    setMessage(
      'unavailable' in outcome.server
        ? `Deleted everything stored in this browser. The server could not be reached, so its copy is still there: ${outcome.server.unavailable}`
        : 'Deleted everything in this browser and on the server.',
    )
  }

  const btn =
    'min-h-9 rounded px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50'

  return (
    <section aria-labelledby="your-data" className="rounded-lg bg-white p-4 shadow-sm">
      <h3 id="your-data" className="font-medium">
        Your data
      </h3>
      <p className="mb-3 text-sm text-slate-600">
        Everything stays on this computer. Download a copy, or delete it all.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void onExport()}
          className={`${btn} border border-slate-300 hover:bg-slate-50`}
        >
          {busy === 'export' ? 'Exporting…' : 'Export my data (JSON)'}
        </button>
        {!confirming ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => setConfirming(true)}
            className={`${btn} border border-red-300 text-red-800 hover:bg-red-50`}
          >
            Delete all my data
          </button>
        ) : (
          <div
            role="group"
            aria-label="Confirm deletion"
            className="flex flex-wrap items-center gap-2 rounded border border-red-300 bg-red-50 p-2"
          >
            <span className="text-sm text-red-900">
              This removes every notebook, page, stroke and review. It cannot be undone.
            </span>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void onDelete()}
              className={`${btn} bg-red-700 text-white hover:bg-red-800`}
            >
              {busy === 'delete' ? 'Deleting…' : 'Yes, delete everything'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className={`${btn} hover:bg-white`}
            >
              Keep my data
            </button>
          </div>
        )}
      </div>
      {message && (
        <p role="status" className="mt-2 text-sm text-slate-700">
          {message}
        </p>
      )}
    </section>
  )
}
