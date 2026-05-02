import PQueue from 'p-queue'
import type { ServerDefinition } from '~/server/client'
import type {
  ServerAutonomy,
} from '~/site-spec/types'
import type { ScrapeResult } from '~/sources/page-rule-runner'
import type { Log } from '~/shared'
import type {
  GenerationAttempt,
  GenerationProgress,
  GenerationResult,
} from '~/generation/types'

export class Storage<T extends Record<string, unknown>> {
  #q = new PQueue()

  async get<K extends keyof T>(key: K, defaultValue: T[K]): Promise<T[K]> {
    const data = await chrome.storage.local.get({ [key]: defaultValue })

    return data[key as string] as T[K]
  }

  async set<K extends keyof T>(key: K, value: T[K]): Promise<void> {
    await chrome.storage.local.set({ [key]: value })
  }

  async push<
    K extends {
      [K in keyof T]: T[K] extends unknown[] ? K : never
    }[keyof T],
    V extends T[K] extends Array<infer R> ? R : never,
  >(key: K, value: V): Promise<V[]> {
    return this.#q.add(
      async () => {
        const out = (await this.get(key, [] as T[K])) as V[]
        if (out.includes(value)) {
          return out
        }
        out.push(value)
        await this.set(key, out as T[K])
        return out
      },
    )
  }

  async pull<
    K extends {
      [K in keyof T]: T[K] extends unknown[] ? K : never
    }[keyof T],
    V extends T[K] extends Array<infer R> ? R : never,
  >(key: K, value: V): Promise<V[]> {
    return this.#q.add(
      async () => {
        const out = (await this.get(key, [] as T[K])) as V[]
        const filtered = out.filter((elem) => elem !== value)
        await this.set(key, filtered as T[K])
        return filtered
      },
    )
  }
}

export class ServerStorage {
  #q = new PQueue()
  #storage = new Storage<{ servers: ServerDefinition[]; hello: number }>()

  add(server: ServerDefinition): Promise<ServerDefinition[]> {
    return this.#storage.push('servers', server)
  }

  async update(id: string, newValue: ServerDefinition) {
    return this.#q.add(
      async () => {
        const servers = await this.#storage.get('servers', [])
        if (servers.length === 0) {
          return false
        }

        const server = servers.find((server) => server.id === id)

        const newServer = { ...server, ...newValue }

        const updatedServers = servers.map((existing) => {
          if (existing.id === id) {
            return newServer
          }
          return existing
        })

        await this.#storage.set('servers', updatedServers)
      },
    )
  }

  async get(id: string): Promise<undefined | ServerDefinition> {
    const servers = await this.#storage.get('servers', [])
    return servers.find((server) => server.id === id)
  }

  async getAll(): Promise<ServerDefinition[]> {
    return await this.#storage.get('servers', [])
  }
}

export type BrowserStorageSchema = {
  events: Log[]
  enabledResources: string[]
  'server:url'?: string
  'server:name'?: string
  'server:pool-id'?: string
  'server:worker-id'?: string
  'server:worker-secret'?: string
  'server:enabled'?: boolean
  'server:autonomy'?: ServerAutonomy
  'schema:local'?: string
  'scrape:last'?: ScrapeResult
  'legend:position'?: { x: number; y: number } | null
  'legend:opacity'?: number
  'legend:hidden'?: string[]
  'legend:collapsed'?: boolean
  'debug:visual'?: boolean
  'resources:all'?: import('~/site-spec/types').ResourceSpec[]
  'gemini:api-key'?: string
  'zai:api-key'?: string
  'generation:progress'?: GenerationProgress
  'generation:attempts'?: GenerationAttempt[]
  'generation:last-result'?: { result: GenerationResult; timestamp: number }
}
