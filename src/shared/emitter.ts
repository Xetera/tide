type EventMap = Record<string, (...args: never[]) => void>

export class TypedEmitter<T extends EventMap> {
  #listeners = new Map<keyof T, Set<(...args: never[]) => void>>()

  on<K extends keyof T>(event: K, listener: T[K]): this {
    let set = this.#listeners.get(event)
    if (!set) {
      set = new Set()
      this.#listeners.set(event, set)
    }
    set.add(listener)
    return this
  }

  off<K extends keyof T>(event: K, listener: T[K]): this {
    this.#listeners.get(event)?.delete(listener)
    return this
  }

  once<K extends keyof T>(event: K, listener: T[K]): this {
    const wrapper = (...args: Parameters<T[K]>) => {
      this.off(event, wrapper as T[K])
      listener(...args)
    }
    return this.on(event, wrapper as T[K])
  }

  emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>): void {
    this.#listeners.get(event)?.forEach((listener) => listener(...args))
  }
}
