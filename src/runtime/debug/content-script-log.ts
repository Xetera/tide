import { sendMessage } from 'webext-bridge/content-script'
import type { PlainLog } from '~/shared/log'

export function sendLog(log: Omit<PlainLog, 'date' | 'type' | 'id'>) {
  sendMessage('log', log)
}
