import { useEffect, useState } from 'react'

function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash || '#/')
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

export default function App() {
  const route = useHashRoute()
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">MathMind</h1>
      <p className="text-slate-600">{route === '#/' ? 'Your notebooks' : 'Page not found'}</p>
    </main>
  )
}
