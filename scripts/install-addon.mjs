// Copies addon/Guildhall into the game's AddOns folder.
// Run with: npm run addon:install
import { cpSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const wowDir =
  process.env.WOW_FOREVER_DIR?.trim() ||
  'C:/Program Files (x86)/World of Warcraft/_forever_'
const addons = join(wowDir, 'Interface', 'AddOns')
if (!existsSync(addons)) {
  console.error(
    `No Interface/AddOns folder in ${wowDir}. Set WOW_FOREVER_DIR in .env.local.`,
  )
  process.exit(1)
}

const source = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'addon',
  'Guildhall',
)
const target = join(addons, 'Guildhall')
cpSync(source, target, { recursive: true })
console.log(`Installed Guildhall to ${target}`)
console.log('Restart the game, or /reload if it was already installed.')
