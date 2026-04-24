import { createSignal, onCleanup } from 'solid-js'
import type { BrowserStorageSchema } from './storage'

export function useBrowserStorage<T extends keyof BrowserStorageSchema>(
  eventsKey: T,
  defaultValue: BrowserStorageSchema[T],
) {
  const [value, setValue] = createSignal<BrowserStorageSchema[T]>(defaultValue)

  chrome.storage.local.get({ [eventsKey]: defaultValue }).then((rawValue) => {
    setValue(() => rawValue[eventsKey as string] as BrowserStorageSchema[T])
  })

  function listener(changes: Record<string, chrome.storage.StorageChange>) {
    const change = changes[eventsKey as string]
    if (change === undefined) {return}
    setValue(() => change.newValue as BrowserStorageSchema[T])
  }

  chrome.storage.local.onChanged.addListener(listener)
  onCleanup(() => chrome.storage.local.onChanged.removeListener(listener))

  async function set(newValue: BrowserStorageSchema[T]) {
    await chrome.storage.local.set({ [eventsKey]: newValue })
  }

  return { value, set }
}
