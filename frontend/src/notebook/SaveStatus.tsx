import { useEffect, useSyncExternalStore } from 'react'
import { saveQueue } from './autosave'
import { flushPendingMeta } from './store'

const subscribe = (fn: () => void) => saveQueue.subscribe(fn)
const getStatus = () => saveQueue.status

/** "Saved" / "Saving…" indicator plus a banner while IndexedDB writes are failing. */
export function SaveStatus() {
  const status = useSyncExternalStore(subscribe, getStatus)

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushPendingMeta()
    }
    const onUnload = (e: BeforeUnloadEvent) => {
      flushPendingMeta()
      if (saveQueue.pending > 0) e.preventDefault()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [])

  return (
    <>
      <span
        role="status"
        className={`text-sm ${status === 'error' ? 'font-semibold text-red-700' : 'text-slate-500'}`}
      >
        {status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving…' : '⚠ Not saved — retrying'}
      </span>
      {status === 'error' && (
        <div
          role="alert"
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 bg-red-600 px-4 py-2 text-sm text-white"
        >
          Your latest changes could not be saved to this device yet. They are kept in memory and
          retried automatically — don’t close this tab.
          <button
            type="button"
            onClick={() => saveQueue.retryNow()}
            className="rounded bg-white px-2 py-1 font-medium text-red-700"
          >
            Retry now
          </button>
        </div>
      )}
    </>
  )
}
