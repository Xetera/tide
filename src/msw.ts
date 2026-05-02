import { setupServer } from 'msw/node'
import { HttpResponse, http } from 'msw'
import type { JobPollResponse, ResourcesResponse } from './site-spec/types'
import { TEST_URL_ENDPOINT } from './setup-tools'

export const restHandlers = [
  http.get(`${TEST_URL_ENDPOINT}/api/pool/:poolId/resources`, () => {
    return HttpResponse.json<ResourcesResponse>({
      name: 'test',
      resources: [],
    })
  }),
  http.get(`${TEST_URL_ENDPOINT}/api/pool/:poolId/worker/jobs`, () => {
    return HttpResponse.json<JobPollResponse>({
      jobs: [],
    })
  }),
]

export const server = setupServer(...restHandlers)
