import { http, HttpResponse } from 'msw'
import { TypedEmitter } from 'tiny-typed-emitter'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  sahibinden,
  sahibindenSmallJobs,
} from '~/fixtures/sahibinden/sahibinden'
import { server } from '~/msw'
import { TEST_URL_ENDPOINT } from '~/setup-tools'
import { Client, type ClientEvents, type ServerDefinition } from './client'
import { type JobPollResponse, ServerAutonomy } from './scrapeer'

const serverDefinition: ServerDefinition = {
  id: '----',
  name: 'test server',
  autonomy: ServerAutonomy.Active,
  poolId: 'test-pool',
  workerId: 'test-worker',
  workerSecret: 'test-secret',
  url: TEST_URL_ENDPOINT,
}

describe('client', () => {
  let client: Client

  afterEach(() => {
    client.stopAll()
  })

  it('gets resources on start', async () => {
    const events = new TypedEmitter<ClientEvents>()
    client = new Client({
      events,
      pollIntervalSeconds: 1,
      queueIntervalSeconds: 1,
      enabledResources: async () => [],
      defaultServers: [serverDefinition],
    })
    const fn = vi.fn()
    events.on('updatedResources', fn)
    await client.startAll()
    const args = [serverDefinition, [sahibinden]]
    expect(fn.mock.calls).toStrictEqual([args])
  })

  it('invalidates resources when instructed', async () => {
    const events = new TypedEmitter<ClientEvents>()
    client = new Client({
      events,
      pollIntervalSeconds: 1,
      queueIntervalSeconds: 1,
      enabledResources: async () =>
        sahibindenSmallJobs.map((a) => a.resource_id),
      defaultServers: [serverDefinition],
    })
    const poller = vi.fn()
    const resourceUpdater = vi.fn()
    const runJob = vi.fn()
    events.on('polled', poller)
    events.on('updatedResources', resourceUpdater)
    events.on('runJob', runJob)

    vi.useFakeTimers()
    await client.startAll()
    expect(poller).toBeCalledTimes(1)
    expect(runJob).toBeCalledTimes(0)
    expect(resourceUpdater).toBeCalledTimes(1)
    server.use(
      http.get(`${TEST_URL_ENDPOINT}/api/pool/:poolId/worker/jobs`, () => {
        return HttpResponse.json<JobPollResponse>({
          jobs: sahibindenSmallJobs,
          refetch: ['resources'],
        })
      }),
    )

    vi.advanceTimersByTime(1000)
    await vi.waitUntil(() => poller.mock.calls.length === 2)
    expect(poller).toBeCalledTimes(2)
    expect(runJob).toBeCalledTimes(1)
    expect(resourceUpdater).toBeCalledTimes(2)
    vi.useRealTimers()
  })

  it('sends the server passive jobs', async () => {
    const events = new TypedEmitter<ClientEvents>()
    client = new Client({
      events,
      pollIntervalSeconds: 1,
      queueIntervalSeconds: 1,
      enabledResources: async () =>
        sahibindenSmallJobs.map((a) => a.resource_id),
      defaultServers: [serverDefinition],
    })
    await client.startAll()

    server.use(
      http.post(
        `${TEST_URL_ENDPOINT}/api/pool/:poolId/worker/jobs`,
        () => {
          return HttpResponse.json({ assets: { upload_required: [] } })
        },
        { once: true },
      ),
    )

    events.emit('pageMatched', {
      payload: { hello: 'world' },
      media: {},
      resourceId: sahibinden.$id,
      source: {
        kind: 'passive',
      },
      variables: {},
      warnings: [],
    })
    const fn = vi.fn()
    server.events.on('request:match', fn)
    await vi.waitUntil(() => fn.mock.lastCall)
    const request = await fn.mock.calls[0]![0].request.json()

    expect(request).toStrictEqual({
      success: true,
      payload: { hello: 'world' },
      resource_id: 'sahibinden:city_listing',
      entity_id: 'sahibinden:city_listing',
      job: { kind: 'passive' },
      variables: {},
      warnings: [],
    })
  })
})
