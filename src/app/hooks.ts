import { EVENTS_KEY } from '~/shared/log'
import { useBrowserStorage } from '~/shared/hooks'

export function useLogs() {
  const { value: logs } = useBrowserStorage<'events'>(EVENTS_KEY, [])

  return { logs }
}
