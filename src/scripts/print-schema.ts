import { instagram } from '../fixtures/instagram/instagram'
import { sahibinden } from '../fixtures/sahibinden/sahibinden'

const schemas = { instagram, sahibinden }
const name = process.argv[2]

if (!name) {
  console.error(`Usage: pnpm schema <name>\nAvailable: ${Object.keys(schemas).join(', ')}`)
  process.exit(1)
}

const schema = schemas[name as keyof typeof schemas]
if (!schema) {
  console.error(`Unknown schema: ${name}\nAvailable: ${Object.keys(schemas).join(', ')}`)
  process.exit(1)
}

process.stdout.write(JSON.stringify([schema], null, 2) + '\n')
