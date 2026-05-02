import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sahibindenSmallJobs } from '~/sites/sahibinden'
import { server } from '~/msw'
import { TEST_URL_ENDPOINT } from '~/setup-tools'
import { Client, type ServerDefinition } from './client'
import { type JobPollResponse, ServerAutonomy } from '~/site-spec/types'

const serverDefinition: ServerDefinition = {
  id: '----',
  name: 'test server',
  autonomy: ServerAutonomy.Active,
  poolId: 'test-pool',
  workerId: 'test-worker',
  workerSecret: 'test-secret',
  url: TEST_URL_ENDPOINT,
}

const mockCst = {
  getScriptTab: vi.fn().mockResolvedValue(1),
  getAllScriptTabs: vi.fn().mockResolvedValue([1]),
  isValid: vi.fn().mockReturnValue(true),
}

function makeClient(onResourcesUpdated = vi.fn()) {
  return new Client({
    cst: mockCst as any,
    pollIntervalSeconds: 1,
    queueIntervalSeconds: 1,
    enabledResources: async () => sahibindenSmallJobs.map((a) => a.resource_id),
    defaultServers: [serverDefinition],
    onResourcesUpdated,
  })
}

describe('client', () => {
  let client: Client

  afterEach(() => {
    client.stopAll()
  })

  it('gets resources on start', async () => {
    const onResourcesUpdated = vi.fn()
    client = makeClient(onResourcesUpdated)
    await client.startAll()
    expect(onResourcesUpdated).toHaveBeenCalledWith(serverDefinition, [])
  })

  it('invalidates resources when instructed', async () => {
    const onResourcesUpdated = vi.fn()
    client = makeClient(onResourcesUpdated)

    vi.useFakeTimers()
    await client.startAll()
    expect(onResourcesUpdated).toBeCalledTimes(1)
    server.use(
      http.get(`${TEST_URL_ENDPOINT}/api/pool/:poolId/worker/jobs`, () => {
        return HttpResponse.json<JobPollResponse>({
          jobs: sahibindenSmallJobs,
          refetch: ['resources'],
        })
      }),
    )

    vi.advanceTimersByTime(1000)
    await vi.waitUntil(() => onResourcesUpdated.mock.calls.length === 2)
    expect(onResourcesUpdated).toBeCalledTimes(2)
    vi.useRealTimers()
  })
})
