import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sahibindenSmallJobs } from '@tide/sites'
import { server } from './testing-msw'
import { TEST_URL_ENDPOINT } from './testing-setup'
import { Client, type ServerDefinition } from './client'
import { type JobPollResponse, ServerAutonomy } from '@tide/spec'

const serverDefinition: ServerDefinition = {
  id: '----',
  name: 'test server',
  autonomy: ServerAutonomy.Active,
  poolId: 'test-pool',
  workerId: 'test-worker',
  workerSecret: 'test-secret',
  url: TEST_URL_ENDPOINT,
}

function makeClient(onSitesUpdated = vi.fn()) {
  return new Client({
    getJobTab: vi.fn().mockResolvedValue(1),
    runJob: vi.fn().mockResolvedValue(undefined),
    pollIntervalSeconds: 1,
    queueIntervalSeconds: 1,
    defaultServers: [serverDefinition],
    onSitesUpdated,
  })
}

describe('client', () => {
  let client: Client

  afterEach(() => {
    client.stopAll()
  })

  it('gets sites on start', async () => {
    const onSitesUpdated = vi.fn()
    client = makeClient(onSitesUpdated)
    await client.startAll()
    expect(onSitesUpdated).toHaveBeenCalledWith(serverDefinition, [])
  })

  it('invalidates sites when instructed', async () => {
    const onSitesUpdated = vi.fn()
    client = makeClient(onSitesUpdated)

    vi.useFakeTimers()
    await client.startAll()
    expect(onSitesUpdated).toBeCalledTimes(1)
    server.use(
      http.get(`${TEST_URL_ENDPOINT}/api/pool/:poolId/workers/me/jobs`, () => {
        return HttpResponse.json<JobPollResponse>({
          jobs: sahibindenSmallJobs,
          refetch: ['sites'],
        })
      }),
    )

    vi.advanceTimersByTime(1000)
    await vi.waitUntil(() => onSitesUpdated.mock.calls.length === 2)
    expect(onSitesUpdated).toBeCalledTimes(2)
    vi.useRealTimers()
  })
})
