import { useBrowserStorage } from '~/shared/hooks'
import {
  TextField,
  TextFieldLabel,
  TextFieldRoot,
  TextFieldDescription,
} from '~/components/ui/textfield'

export function Pool() {
  const { value: poolUrl, set: setPoolUrl } = useBrowserStorage('pool:url', '')

  return (
    <div class='p-4 flex flex-col gap-4'>
      <TextFieldRoot>
        <TextFieldLabel>Pool URL</TextFieldLabel>
        <TextField
          type='url'
          placeholder='https://pool.example.com'
          value={poolUrl() ?? ''}
          onChange={(event) => setPoolUrl(event.target.value)}
        />
        <TextFieldDescription>
          Enter a URL to join a scraping pool. The pool will distribute work
          across connected clients.
        </TextFieldDescription>
      </TextFieldRoot>
    </div>
  )
}
