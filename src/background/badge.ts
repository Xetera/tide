const clearTimers = new Map<number | undefined, ReturnType<typeof setTimeout>>()

function setBadge(text: string, color: string, tabId: number | undefined, durationMs = 3000) {
  const existing = clearTimers.get(tabId)
  if (existing !== undefined) {
    clearTimeout(existing)
  }
  const details = tabId !== undefined ? { text, tabId } : { text }
  const colorDetails = tabId !== undefined ? { color, tabId } : { color }
  chrome.action.setBadgeText(details)
  chrome.action.setBadgeBackgroundColor(colorDetails)
  clearTimers.set(
    tabId,
    setTimeout(() => {
      chrome.action.setBadgeText(tabId !== undefined ? { text: '', tabId } : { text: '' })
      clearTimers.delete(tabId)
    }, durationMs),
  )
}

export function flashSuccess(tabId?: number) {
  setBadge('OK', '#22c55e', tabId)
}

export function flashError(tabId?: number) {
  setBadge('ERR', '#ef4444', tabId)
}
