import { createSignal, onMount } from 'solid-js'
import { sendMessage } from 'webext-bridge/popup'
import type { Resource } from '~/protocol/scrapeer'

export function SchemaEditor() {
  const [text, setText] = createSignal('')

  onMount(async () => {
    const { 'schema:local': stored } = await chrome.storage.local.get('schema:local')
    if (stored) setText(stored)
  })
  const [error, setError] = createSignal<string | null>(null)
  const [success, setSuccess] = createSignal(false)

  async function apply() {
    setError(null)
    setSuccess(false)
    let parsed: Resource[]
    try {
      parsed = JSON.parse(text())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON')
      return
    }
    if (!Array.isArray(parsed)) {
      setError('Schema must be an array of resources')
      return
    }
    await sendMessage('set-schema', parsed, { context: 'background', tabId: 0 })
    setSuccess(true)
  }

  return (
    <div class='flex flex-col gap-2 p-3'>
      <textarea
        class='w-full h-64 font-mono text-xs p-2 border border-border rounded bg-background text-foreground resize-y'
        placeholder='Paste JSON schema here...'
        value={text()}
        onInput={(e) => {
          setText(e.currentTarget.value)
          setError(null)
          setSuccess(false)
        }}
      />
      {error() && <p class='text-sm text-destructive'>{error()}</p>}
      {success() && <p class='text-sm text-green-600'>Schema applied</p>}
      <button
        type='button'
        class='self-start px-3 py-1 text-sm rounded bg-primary text-primary-foreground'
        onClick={apply}
      >
        Apply
      </button>
    </div>
  )
}
