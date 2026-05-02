import type { BrowserStorageSchema } from '~/shared/storage'

export class StorageListener {
  #updateMap: Array<{
    key: keyof BrowserStorageSchema
    callback: (value: NonNullable<BrowserStorageSchema[keyof BrowserStorageSchema]>) => void
  }> = []

  constructor() {
    chrome.storage.local.onChanged.addListener((changes) => {
      for (const entry of this.#updateMap) {
        if (!(entry.key in changes)) {
          continue
        }
        const newValue = changes[entry.key]?.newValue
        if (newValue !== undefined) {
          entry.callback(newValue as NonNullable<BrowserStorageSchema[keyof BrowserStorageSchema]>)
        }
      }
    })
  }

  on<T extends keyof BrowserStorageSchema>(
    key: T,
    callback: (value: NonNullable<BrowserStorageSchema[T]>) => void,
  ) {
    this.#updateMap.push({
      key,
      callback: callback as (value: NonNullable<BrowserStorageSchema[keyof BrowserStorageSchema]>) => void,
    })
  }
}
