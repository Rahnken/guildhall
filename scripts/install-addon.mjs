// Copies addon/MankriksFluffers into the game's AddOns folder, and removes
// the copy installed under the addon's old name, Guildhall, so the two do not
// both run.
// Run with: npm run addon:install
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FOLDER = 'MankriksFluffers'

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
  FOLDER,
)
const target = join(addons, FOLDER)
cpSync(source, target, { recursive: true })
console.log(`Installed ${FOLDER} to ${target}`)

// Only our own old addon: another addon is also called Guildhall.
const old = join(addons, 'Guildhall')
const oldToc = join(old, 'Guildhall.toc')
if (
  existsSync(oldToc) &&
  readFileSync(oldToc, 'utf8').includes('## Author: Rahnken')
) {
  rmSync(old, { recursive: true })
  console.log(`Removed the old copy at ${old}`)
}
console.log('Restart the game: a renamed addon is not picked up by /reload.')
