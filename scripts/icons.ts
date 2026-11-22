// Finds out which icon every recipe and material uses, by asking the game.
//
//   npm run icons:ids     write addon/MankriksFluffers/RecipeIds.lua: every item and
//                         spell in the recipe list (run after recipes:import)
//   npm run addon:install
//   (in game)             /reload, type /gh icons, then /reload again
//   npm run icons:read    read what the game saved; write src/data/icons.json
//   npm run icons:build   copy the pictures those icons need into public/icons
//
// The pictures come from the game's own files, exported once with wow.export
// (Textures tab, search "interface/icons", select all, Export as PNG). The
// game names an icon by a file id; wow.export's file list says which exported
// picture that is.
// Reads WOW_FOREVER_DIR, WOW_ACCOUNT and WOW_EXPORT_DIR from .env.local.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import sharp from 'sharp'

import catalogue from '../src/data/recipes.json'
import { ADDON_FOLDER, savedData } from '../src/lib/wow/addon'
import { locateSaved } from './saved-file'

const root = join(import.meta.dirname, '..')

// A recipe is drawn with the icon of the item it makes, or of its spell
// when it makes none (enchantments); materials are items.
const items = new Set<number>()
const spells = new Set<number>()
/** Items a recipe makes: these also get their tooltip saved. */
const made = new Set<number>()
for (const recipe of catalogue.recipes) {
  if (recipe.itemId) {
    items.add(recipe.itemId)
    made.add(recipe.itemId)
  } else spells.add(recipe.spellId)
  for (const reagent of recipe.reagents) items.add(reagent.itemId)
}

/** Ids only, a dozen to a line, so the file stays readable in a diff. */
function luaList(ids: Set<number>): string {
  const sorted = [...ids].sort((a, b) => a - b)
  const lines: Array<string> = []
  for (let i = 0; i < sorted.length; i += 12)
    lines.push('    ' + sorted.slice(i, i + 12).join(', ') + ',')
  return `{\n${lines.join('\n')}\n}`
}

function writeIds() {
  const file = join(root, 'addon', ADDON_FOLDER, 'RecipeIds.lua')
  writeFileSync(
    file,
    `-- Written by \`npm run icons:ids\`; do not edit. The items and spells in the
-- website's recipe list, which /gh icons looks up. Ids only: the recipes
-- themselves stay on the website.
local _, shared = ...

shared.ITEMS = ${luaList(items)}

shared.SPELLS = ${luaList(spells)}

-- The items recipes make, whose tooltips are saved too.
shared.MADE = ${luaList(made)}
`,
  )
  console.log(`Wrote ${file}: ${items.size} items, ${spells.size} spells.`)
  console.log(
    'Now: npm run addon:install, then in game /reload, /gh icons, /reload.',
  )
}

function readSaved() {
  const file = locateSaved()
  const saved = savedData(readFileSync(file, 'utf8')).icons as
    Record<string, unknown> | undefined
  if (!saved)
    throw new Error(
      `No icons in ${file}. In game: /gh icons, then /reload, then run this again.`,
    )
  // The game gives a file id (a number) or, in older clients, a file path.
  const table = (key: string): Record<string, string | number> => {
    const out: Record<string, string | number> = {}
    for (const [id, icon] of Object.entries(saved[key] ?? {}))
      if (typeof icon === 'number' || typeof icon === 'string') out[id] = icon
    return out
  }
  const tips: Record<string, Array<string>> = {}
  for (const [id, lines] of Object.entries(saved.tips ?? {})) {
    // A Lua list arrives as an array, or as an object keyed 1, 2, 3.
    const list = Array.isArray(lines)
      ? lines
      : Object.entries(lines as object)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([, line]) => line)
    tips[id] = list.filter((line) => typeof line === 'string')
  }
  const icons = {
    items: table('items'),
    spells: table('spells'),
    quality: table('quality'),
    tips,
    spellText: table('spellText'),
  }
  const distinct = new Set([
    ...Object.values(icons.items),
    ...Object.values(icons.spells),
  ])
  writeFileSync(
    join(root, 'src', 'data', 'icons.json'),
    JSON.stringify(icons) + '\n',
  )
  console.log(`Read ${file}`)
  console.log(
    `${Object.keys(icons.items).length} of ${items.size} items and ` +
      `${Object.keys(icons.spells).length} of ${spells.size} spells have an icon; ` +
      `${distinct.size} different pictures in all. ` +
      `${Object.keys(tips).length} of ${made.size} crafted items have a tooltip.`,
  )
  console.log(`Examples: ${[...distinct].slice(0, 5).join(', ')}`)
}

/** Pixels on a side: twice the size the page draws them, for sharp screens. */
const SIZE = 56

/**
 * File id to exported picture name, from wow.export's own list of texture
 * files: a count, then for each file a 4-byte id and its path ending in a 0.
 */
function exportedNames(wanted: Set<number>): Map<number, string> {
  const list = join(
    process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'),
    'wow.export/User Data/Default/casc/listfile/listfile-pf-textures.dat',
  )
  if (!existsSync(list))
    throw new Error(
      `No wow.export file list at ${list}. Open the game in wow.export once.`,
    )
  const data = readFileSync(list)
  const names = new Map<number, string>()
  let pos = 4
  while (pos + 4 < data.length) {
    const id = data.readUInt32BE(pos)
    const end = data.indexOf(0, pos + 4)
    if (end < 0) break
    if (wanted.has(id)) names.set(id, data.toString('latin1', pos + 4, end))
    pos = end + 1
  }
  return names
}

async function build() {
  const exported =
    process.env.WOW_EXPORT_DIR?.trim() || join(homedir(), 'wow.export')
  const saved = JSON.parse(
    readFileSync(join(root, 'src', 'data', 'icons.json'), 'utf8'),
  ) as { items: Record<string, unknown>; spells: Record<string, unknown> }
  const wanted = new Set<number>()
  for (const icon of [
    ...Object.values(saved.items),
    ...Object.values(saved.spells),
  ])
    if (typeof icon === 'number') wanted.add(icon)
  if (wanted.size === 0)
    throw new Error('No icons in src/data/icons.json. Run npm run icons:read.')

  const names = exportedNames(wanted)
  const target = join(root, 'public', 'icons')
  mkdirSync(target, { recursive: true })
  const done: Array<number> = []
  const missing: Array<string> = []
  let bytes = 0
  for (const id of [...wanted].sort((a, b) => a - b)) {
    const name = names.get(id)
    const picture = name && join(exported, name.replace(/\.blp$/i, '.png'))
    if (!picture || !existsSync(picture)) {
      missing.push(name ?? String(id))
      continue
    }
    const out = await sharp(picture)
      .resize(SIZE, SIZE)
      .webp({ quality: 82 })
      .toBuffer()
    writeFileSync(join(target, `${id}.webp`), out)
    bytes += out.length
    done.push(id)
  }
  // The site only draws icons it has a picture for.
  writeFileSync(
    join(root, 'src', 'data', 'icon-files.json'),
    JSON.stringify(done) + '\n',
  )
  console.log(
    `${done.length} of ${wanted.size} pictures written to ${target}, ` +
      `${(bytes / 1024 / 1024).toFixed(1)} MB in all.`,
  )
  if (missing.length > 0)
    console.log(
      `${missing.length} not in ${exported}: ${missing.slice(0, 8).join(', ')}` +
        (missing.length > 8 ? ', …' : ''),
    )
}

try {
  if (process.argv[2] === 'ids') writeIds()
  else if (process.argv[2] === 'read') readSaved()
  else if (process.argv[2] === 'build') await build()
  else throw new Error('Use: npm run icons:ids, icons:read or icons:build')
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
