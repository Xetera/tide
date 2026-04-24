import {
  Switch,
  SwitchControl,
  SwitchDescription,
  SwitchLabel,
} from '~/components/ui/switch'
import { useBrowserStorage } from '~/shared/hooks'

export function AddServer() {
  const { value: visualDebug, set: setVisualDebug } = useBrowserStorage(
    'debug:visual',
    false,
  )
  const { value: geminiKey, set: setGeminiKey } = useBrowserStorage(
    'gemini:api-key',
    '',
  )
  const { value: zaiKey, set: setZaiKey } = useBrowserStorage('zai:api-key', '')

  return (
    <div class='p-4 flex flex-col gap-4'>
      <Switch
        checked={visualDebug()}
        onChange={(state) => setVisualDebug(state)}
        class='flex items-center justify-between gap-3'
      >
        <div class='flex flex-col gap-0.5'>
          <SwitchLabel class='text-sm font-medium cursor-pointer'>
            Visual debugging
          </SwitchLabel>
          <SwitchDescription class='text-xs text-muted-foreground'>
            Highlight matched selectors on the page
          </SwitchDescription>
        </div>
        <SwitchControl />
      </Switch>
      <div class='flex flex-col gap-1.5'>
        <label class='text-sm font-medium'>Gemini API key</label>
        <input
          type='password'
          placeholder='AIza...'
          value={geminiKey() ?? ''}
          onInput={(e) => setGeminiKey(e.currentTarget.value)}
          class='w-full px-3 py-1.5 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring'
        />
        <p class='text-xs text-muted-foreground'>Used for spec generation</p>
      </div>
      <div class='flex flex-col gap-1.5'>
        <label class='text-sm font-medium'>z.ai API key</label>
        <input
          type='password'
          placeholder='z.ai key...'
          value={zaiKey() ?? ''}
          onInput={(e) => setZaiKey(e.currentTarget.value)}
          class='w-full px-3 py-1.5 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring'
        />
        <p class='text-xs text-muted-foreground'>
          Used for spec generation via GLM-4.1V Flash (takes priority over
          Gemini if set)
        </p>
      </div>
    </div>
  )
}
