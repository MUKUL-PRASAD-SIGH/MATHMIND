import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotebookStore } from '../../notebook/store'
import { db } from '../../services/db/db'
import { resetDb } from '../../test/factories'
import { server } from '../../test/setup'
import * as privacy from './privacy'
import { PrivacyPanel } from './PrivacyPanel'

beforeEach(async () => {
  await resetDb()
  useNotebookStore.getState().closeNotebook()
  await useNotebookStore.getState().createNotebook('Algebra')
})

describe('your data', () => {
  it('exports this browser’s notebooks together with the server copy', async () => {
    const data = await privacy.collectExport()
    expect(data.local.notebooks).toHaveLength(1)
    expect(data.local.pages).toHaveLength(1)
    expect('format_version' in data.server && data.server.format_version).toBe(1)
  })

  it('still exports the local notebook when the server is offline, and says so', async () => {
    server.use(http.get('*/api/v1/learners/me/export', () => HttpResponse.error()))
    const download = vi.spyOn(privacy, 'downloadJson').mockImplementation(() => {})
    const user = userEvent.setup()
    render(<PrivacyPanel />)
    await user.click(screen.getByRole('button', { name: 'Export my data (JSON)' }))
    expect(await screen.findByRole('status')).toHaveTextContent('server copy was not included')
    expect(download).toHaveBeenCalledTimes(1)
    const [payload, name] = download.mock.calls[0] as [privacy.MyDataExport, string]
    expect(payload.local.notebooks).toHaveLength(1)
    expect(name).toMatch(/^mathmind-export-\d{4}-\d{2}-\d{2}\.json$/)
  })

  it('deletes only after confirmation, on the server and in this browser', async () => {
    let deleted = false
    server.use(
      http.delete('*/api/v1/learners/me/data', ({ request }) => {
        deleted = new URL(request.url).searchParams.get('confirm') === 'true'
        return HttpResponse.json({ deleted: { submissions: 2 } })
      }),
    )
    const user = userEvent.setup()
    render(<PrivacyPanel />)
    await user.click(screen.getByRole('button', { name: 'Delete all my data' }))
    await user.click(screen.getByRole('button', { name: 'Keep my data' }))
    expect(await db.notebooks.count()).toBe(1)
    expect(deleted).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Delete all my data' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete everything' }))
    expect(await screen.findByRole('status')).toHaveTextContent('in this browser and on the server')
    expect(deleted).toBe(true)
    await waitFor(async () => expect(await db.notebooks.count()).toBe(0))
    expect(await db.pages.count()).toBe(0)
    expect(useNotebookStore.getState().notebooks).toEqual([])
  })

  it('wipes the local copy and reports it when the server cannot be reached', async () => {
    server.use(http.delete('*/api/v1/learners/me/data', () => HttpResponse.error()))
    const user = userEvent.setup()
    render(<PrivacyPanel />)
    await user.click(screen.getByRole('button', { name: 'Delete all my data' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete everything' }))
    expect(await screen.findByRole('status')).toHaveTextContent('its copy is still there')
    expect(await db.notebooks.count()).toBe(0)
  })
})
