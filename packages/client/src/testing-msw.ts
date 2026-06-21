import { setupServer } from 'msw/node'
import { HttpResponse, http } from 'msw'
import type { PollResponse, WorkerSitesResponse } from './api'
import { TEST_URL_ENDPOINT } from './testing-setup'

export const restHandlers = [
  http.get(`${TEST_URL_ENDPOINT}/api/pools/:poolId/workers/me/sites`, () => {
    return HttpResponse.json<WorkerSitesResponse>({
      name: 'test',
      opted_in: [],
      sites: [],
    })
  }),
  http.get(`${TEST_URL_ENDPOINT}/api/pools/:poolId/workers/me/jobs`, () => {
    return HttpResponse.json<PollResponse>({
      jobs: [],
      refetch: [],
    })
  }),
]

export const server = setupServer(...restHandlers)
