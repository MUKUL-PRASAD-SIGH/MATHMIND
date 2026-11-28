import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { server } from '../../test/setup'
import { api } from './client'

it('filters problems with the query name from the contract (?concept=)', async () => {
  let query = ''
  server.use(
    http.get('*/api/v1/problems', ({ request }) => {
      query = new URL(request.url).search
      return HttpResponse.json([])
    }),
  )
  await api.problems('linear_equations')
  expect(query).toBe('?concept=linear_equations')
})
