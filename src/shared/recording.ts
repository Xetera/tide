export interface RecordingState {
  hostname: string
  enabled: boolean
}

import { sessionStorageArea } from './storage'

const STORAGE_KEY = 'recording:state'

export type RecordingValue = RecordingState | null

/** @spec read the current recording state from session storage */
export async function getRecording(): Promise<RecordingValue> {
  const result = await sessionStorageArea().get({ [STORAGE_KEY]: null })
  const value = result[STORAGE_KEY] as RecordingValue
  return value ?? null
}

/** @spec persist a new recording state (or clear it) */
export async function setRecording(value: RecordingValue): Promise<void> {
  await sessionStorageArea().set({ [STORAGE_KEY]: value })
}

/** @spec true when the given hostname is the active recording target */
export function isRecordingFor(
  state: RecordingValue,
  hostname: string,
): boolean {
  if (!state) {
    return false
  }
  return state.enabled && state.hostname === hostname
}

/** @spec subscribe to changes of the recording state in session storage */
export function onRecordingChanged(
  handler: (value: RecordingValue) => void,
): () => void {
  const expectedArea: chrome.storage.AreaName = chrome.storage.session
    ? 'session'
    : 'local'
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: chrome.storage.AreaName,
  ) => {
    if (area !== expectedArea) {
      return
    }
    const change = changes[STORAGE_KEY]
    if (!change) {
      return
    }
    handler((change.newValue as RecordingValue) ?? null)
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}

export const RECORDING_STORAGE_KEY = STORAGE_KEY
