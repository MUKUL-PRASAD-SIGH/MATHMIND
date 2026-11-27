import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../../App'
import { pagesRepo } from '../../services/db/repos/pages'
import { resetDb } from '../../test/factories'
import { useNotebookStore } from '../store'

beforeEach(async () => {
  await resetDb()
  useNotebookStore.getState().closeNotebook()
  useNotebookStore.setState({ notebooks: [] })
  window.location.hash = '#/'
})

const currentTitle = () => screen.getByTestId('current-page-title').textContent

describe('notebooks and pages', () => {
  it('creates a notebook, adds 3 pages and navigates to the right page', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('New notebook title'), 'Algebra')
    await user.click(screen.getByRole('button', { name: 'Create notebook' }))
    await screen.findByRole('heading', { name: 'Algebra' })
    expect(currentTitle()).toBe('Page 1')

    const add = screen.getByRole('button', { name: '+ Add page' })
    await user.click(add)
    await user.click(add)
    await user.click(add)
    const nav = screen.getByRole('navigation', { name: 'Pages' })
    await waitFor(() =>
      expect(within(nav).getByRole('button', { name: 'Page 4' })).toBeInTheDocument(),
    )
    expect(currentTitle()).toBe('Page 4')

    await user.click(within(nav).getByRole('button', { name: 'Page 2' }))
    expect(currentTitle()).toBe('Page 2')
    expect(within(nav).getByRole('button', { name: 'Page 2' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('region', { name: 'Page 2' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next page →' }))
    expect(currentTitle()).toBe('Page 3')
    await user.keyboard('{PageDown}')
    await waitFor(() => expect(currentTitle()).toBe('Page 4'))
    await user.keyboard('{PageUp}{PageUp}')
    await waitFor(() => expect(currentTitle()).toBe('Page 2'))
  })

  it('renames, reorders, bookmarks and changes the background of a page', async () => {
    const user = userEvent.setup()
    const nb = await useNotebookStore.getState().createNotebook('Geometry')
    window.location.hash = `#/nb/${nb.id}`
    render(<App />)
    await screen.findByRole('heading', { name: 'Geometry' })
    await user.click(screen.getByRole('button', { name: '+ Add page' }))
    const nav = screen.getByRole('navigation', { name: 'Pages' })

    await user.click(within(nav).getByRole('button', { name: 'Rename Page 2' }))
    await user.clear(screen.getByLabelText('Page title'))
    await user.type(screen.getByLabelText('Page title'), 'Triangles')
    await user.type(screen.getByLabelText('Chapter'), 'Shapes')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(within(nav).getByRole('region', { name: 'Shapes' })).toBeInTheDocument()

    await user.click(within(nav).getByRole('button', { name: 'Move Triangles up' }))
    const buttons = within(nav)
      .getAllByRole('button')
      .filter((b) => !b.getAttribute('aria-label') && b.textContent !== '+ Add page')
    expect(buttons.map((b) => b.textContent)).toEqual(['Triangles', 'Page 1'])

    await user.click(screen.getByRole('button', { name: 'Bookmark page' }))
    await user.selectOptions(screen.getByLabelText('Background'), 'squared')
    const id = useNotebookStore.getState().currentPageId!
    await waitFor(async () =>
      expect(await pagesRepo.get(id)).toMatchObject({
        title: 'Triangles',
        chapter: 'Shapes',
        bookmarked: true,
        background: 'squared',
        order: 0,
      }),
    )
  })

  it('deletes a notebook only after confirmation', async () => {
    const user = userEvent.setup()
    await useNotebookStore.getState().createNotebook('Scratch')
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Delete Scratch' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Delete “Scratch”')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('link', { name: 'Scratch' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete Scratch' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Scratch' })).toBeNull())
  })
})
