import { instagram, instagramPost } from '../fixtures/instagram/instagram'
import { sahibinden } from '../fixtures/sahibinden/sahibinden'

process.stdout.write(
  JSON.stringify([instagram, instagramPost, sahibinden]) + '\n',
)
