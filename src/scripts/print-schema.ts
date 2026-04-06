import { robloxSite } from '../sites/roblox'
import { instagramSite } from '../sites/instagram'
import { sahibindenSite } from '../sites/sahibinden'

process.stdout.write(
  JSON.stringify([instagramSite, sahibindenSite, robloxSite]) + '\n',
)
