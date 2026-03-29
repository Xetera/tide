import { Switch, SwitchControl, SwitchDescription, SwitchLabel } from '~/components/ui/switch'
import { useBrowserStorage } from '~/shared/hooks'

export function AddServer() {
  const { value: visualDebug, set: setVisualDebug } = useBrowserStorage(
    'debug:visual',
    false,
  )

  return (
    <div class='p-4'>
      <Switch
        checked={visualDebug()}
        onChange={(state) => setVisualDebug(state)}
        class='flex items-center justify-between gap-3'
      >
        <div class='flex flex-col gap-0.5'>
          <SwitchLabel class='text-sm font-medium cursor-pointer'>Visual debugging</SwitchLabel>
          <SwitchDescription class='text-xs text-muted-foreground'>
            Highlight matched selectors on the page
          </SwitchDescription>
        </div>
        <SwitchControl />
      </Switch>
    </div>
  )
}
