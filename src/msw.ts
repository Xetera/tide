import { setupServer } from 'msw/node'
import { HttpResponse, http } from 'msw'
import type { JobPollResponse, SitesResponse } from './site-spec/types'
import { TEST_URL_ENDPOINT } from './setup-tools'

export const restHandlers = [
  http.get(`${TEST_URL_ENDPOINT}/api/pool/:poolId/workers/me/sites`, () => {
    return HttpResponse.json<SitesResponse>({
      name: 'test',
      sites: [],
    })
  }),
  http.get(`${TEST_URL_ENDPOINT}/api/pool/:poolId/workers/me/jobs`, () => {
    return HttpResponse.json<JobPollResponse>({
      jobs: [],
    })
  }),
]

export const server = setupServer(...restHandlers)
