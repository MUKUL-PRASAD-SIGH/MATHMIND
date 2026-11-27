import { useEffect, useState } from 'react'
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

  return (
    <div className="flex h-full flex-col">
      {notebookId ? (
        <>
          <h1 className="sr-only">MathMind</h1>
          <NotebookView notebookId={notebookId} />
        </>
      ) : (
        <>
          <header className="bg-white px-4 py-3 shadow-sm">
            <h1 className="text-xl font-bold text-blue-700">MathMind</h1>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto">
            <NotebookList />
          </main>
        </>
      )}
    </div>
  )
}
