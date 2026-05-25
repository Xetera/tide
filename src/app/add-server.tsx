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
    <div class='flex flex-col'>
      <Switch
        checked={visualDebug()}
        onChange={(state) => setVisualDebug(state)}
        class='set-row'
      >
        <div class='set-meta'>
          <SwitchLabel class='set-name cursor-pointer'>
            Visual debugging
          </SwitchLabel>
          <SwitchDescription class='set-desc'>
            Highlight matched selectors on the page
          </SwitchDescription>
        </div>
        <SwitchControl />
      </Switch>

      <div class='set-row' style={{ 'flex-direction': 'column', 'align-items': 'flex-start', gap: '6px' }}>
        <label class='set-name'>Gemini API key</label>
        <input
          type='password'
          placeholder='AIza...'
          value={geminiKey() ?? ''}
          onInput={(e) => setGeminiKey(e.currentTarget.value)}
          class='input'
        />
        <p class='set-desc'>Used for spec generation</p>
      </div>

      <div class='set-row' style={{ 'flex-direction': 'column', 'align-items': 'flex-start', gap: '6px' }}>
        <label class='set-name'>z.ai API key</label>
        <input
          type='password'
          placeholder='z.ai key...'
          value={zaiKey() ?? ''}
          onInput={(e) => setZaiKey(e.currentTarget.value)}
          class='input'
        />
        <p class='set-desc'>
          Used for spec generation via GLM-4.1V Flash (takes priority over
          Gemini if set)
        </p>
      </div>
    </div>
  )
}
