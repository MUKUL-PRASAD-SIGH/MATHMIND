import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { requestPersistentStorage, saveQueue } from './notebook/autosave'
import { pageSync } from './services/api/sync'

async function enableMocks(): Promise<void> {
  if (import.meta.env.VITE_USE_MOCKS !== 'true') return
  const { worker } = await import('./mocks/browser')
  await worker.start({ onUnhandledRequest: 'bypass' })
}

void requestPersistentStorage()
// IndexedDB first, server second: every page saved locally is queued for best-effort sync.
saveQueue.onPageSaved = (pageId) => pageSync.enqueue(pageId)
pageSync.start()
void enableMocks().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
