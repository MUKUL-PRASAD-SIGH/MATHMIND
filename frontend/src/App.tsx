import { useEffect, useState } from 'react'
import { ProgressPage } from './features/analytics/ProgressPage'
import { readLast } from './notebook/autosave'
import { NotebookList } from './notebook/pages/NotebookList'
import { NotebookView } from './notebook/pages/NotebookView'

/** On a fresh start (no route in the URL) reopen the last notebook and page. */
function initialRoute(): string {
  if (window.location.hash) return window.location.hash
  const last = readLast()
  if (!last) return '#/'
  window.history.replaceState(null, '', `#/nb/${last.notebookId}`)
  return window.location.hash
}

function useHashRoute(): string {
  const [hash, setHash] = useState(initialRoute)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

export default function App() {
  const route = useHashRoute()
  const notebookId = /^#\/nb\/([\w-]+)/.exec(route)?.[1]
  const progress = route.startsWith('#/progress')

  return (
    <div className="flex h-full flex-col">
      {notebookId ? (
        <>
          <h1 className="sr-only">MathMind</h1>
          <NotebookView notebookId={notebookId} />
        </>
      ) : (
        <>
          <header className="flex items-center gap-4 bg-white px-4 py-3 shadow-sm">
            <h1 className="text-xl font-bold text-blue-700">MathMind</h1>
            <nav aria-label="Main" className="flex gap-1 text-sm">
              <a
                href="#/"
                aria-current={!progress ? 'page' : undefined}
                className="rounded px-2 py-1 hover:bg-slate-100 aria-[current=page]:font-semibold"
              >
                Notebooks
              </a>
              <a
                href="#/progress"
                aria-current={progress ? 'page' : undefined}
                className="rounded px-2 py-1 hover:bg-slate-100 aria-[current=page]:font-semibold"
              >
                Progress
              </a>
            </nav>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto">
            {progress ? <ProgressPage /> : <NotebookList />}
          </main>
        </>
      )}
    </div>
  )
}
