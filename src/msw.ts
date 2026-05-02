import { setupServer } from 'msw/node'
import { HttpResponse, http } from 'msw'
import type { JobPollResponse, ResourcesResponse } from './protocol/scrapeer'
import { sahibindenSite } from '~/sites/sahibinden'
import { TEST_URL_ENDPOINT } from './setup-tools'

export const restHandlers = [
  http.get(`${TEST_URL_ENDPOINT}/api/pool/:poolId/resources`, () => {
    return HttpResponse.json<ResourcesResponse>({
      name: 'test',
      resources: sahibindenSite.getPages(),
    })
  }),
  http.get(`${TEST_URL_ENDPOINT}/api/pool/:poolId/worker/jobs`, () => {
    return HttpResponse.json<JobPollResponse>({
      jobs: [],
    })
  }),
]

export const server = setupServer(...restHandlers)
