import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App'
import { useDeviceSettings } from '../../services/device/capabilities'
import { resetDb } from '../../test/factories'
import { api } from '../../services/api/client'
import type { ImageObject } from '../model'
import { useNotebookStore } from '../store'

const fixture = () =>
  new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'work.png', { type: 'image/png' })

type Upload = Parameters<typeof api.submitImage>[0]
let uploads: Upload[]

beforeEach(async () => {
  await resetDb()
  useNotebookStore.getState().closeNotebook()
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 800, height: 400, close: () => {} })),
  )
  // jsdom's FormData cannot go through Node's fetch, so capture the upload at the client
  // boundary (the multipart request itself is covered by the Playwright review spec).
  uploads = []
  vi.spyOn(api, 'submitImage').mockImplementation(async (input) => {
    uploads.push(input)
    return { submission_id: 'sub_img', status: 'received' }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  useDeviceSettings.getState().update({ modeOverride: 'auto' })
})

async function openNotebook(mode: 'tablet' | 'phone') {
  useDeviceSettings.getState().update({ modeOverride: mode })
  const nb = await useNotebookStore.getState().createNotebook('Images')
  window.location.hash = `#/nb/${nb.id}`
  render(<App />)
  await screen.findByRole('heading', { name: 'Images' })
  return useNotebookStore.getState().currentPageId!
}

const images = (pageId: string) =>
  useNotebookStore.getState().objects[pageId].filter((o): o is ImageObject => o.kind === 'image')

describe('image import and region export', () => {
  it('imports an image as a page object and keeps the original file', async () => {
    const user = userEvent.setup()
    const pageId = await openNotebook('tablet')
    const file = fixture()
    await user.upload(screen.getByLabelText('Import image'), file)

    expect(await screen.findByRole('group', { name: 'Image' })).toBeInTheDocument()
    const [img] = images(pageId)
    expect(img.payload.source).toBe(file)
    expect(img.payload).toMatchObject({ width: 800, height: 400 })
  })

  it('rejects unsupported files with a visible message', async () => {
    const user = userEvent.setup({ applyAccept: false })
    await openNotebook('tablet')
    await user.upload(
      screen.getByLabelText('Import image'),
      new File(['GIF89a'], 'anim.gif', { type: 'image/gif' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('PNG, JPEG or WebP')
  })

  it('exports a selected region as a PNG and uploads it with bbox and page id', async () => {
    const user = userEvent.setup()
    const pageId = await openNotebook('tablet')
    await user.upload(screen.getByLabelText('Import image'), fixture())
    await screen.findByRole('group', { name: 'Image' })

    act(() => {
      useNotebookStore.getState().selectArea(pageId, [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ])
    })
    await user.click(screen.getByRole('menuitem', { name: 'Review this' }))
    await waitFor(() => expect(uploads).toHaveLength(1))

    const upload = uploads[0]
    expect(upload.file).toBeInstanceOf(Blob)
    expect(upload.file.type).toBe('image/png')
    expect(upload.pageId).toBe(pageId)
    const b = images(pageId)[0].bbox
    expect(upload.bbox).toEqual({
      x: expect.closeTo(b.x),
      y: expect.closeTo(b.y),
      w: expect.closeTo(b.w),
      h: expect.closeTo(b.h),
    })
    expect(await screen.findByText(/Sent for checking/)).toBeInTheDocument()
  })

  it('phone: Capture → crop → Use this keeps the photo and uploads the crop', async () => {
    const user = userEvent.setup()
    const pageId = await openNotebook('phone')
    await user.click(screen.getByRole('button', { name: '📷 Capture' }))
    await user.upload(screen.getByLabelText('Take a photo'), fixture())

    const dialog = await screen.findByRole('dialog', { name: 'Crop your photo' })
    await user.click(within(dialog).getByRole('button', { name: 'Use this' }))

    await waitFor(() => expect(uploads).toHaveLength(1))
    expect(uploads[0].file.type).toBe('image/png')
    expect(uploads[0].bbox).toEqual(images(pageId)[0].bbox) // whole photo
    expect(images(pageId)).toHaveLength(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
