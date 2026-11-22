// Sends the companion addon's saved data to the website.
//
//   npm run sync               upload once
//   npm run sync -- --watch    stay running; upload whenever the game saves
//   npm run sync -- --dry      show what would be uploaded, send nothing
//   npm run sync -- --file <path to MankriksFluffers.lua>
//
// Reads SITE_URL, INGEST_TOKEN, WOW_FOREVER_DIR and WOW_ACCOUNT from .env.local.
import { readFileSync, watchFile } from 'node:fs'

import {
  craftingFromSavedVariables,
  describeCrafting,
} from '../src/lib/crafting'
import { describe, snapshotsFromSavedVariables } from '../src/lib/snapshot'
import { locateSaved } from './saved-file'

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(`--${name}`)
const fileArg = args.includes('--file') ? args[args.indexOf('--file') + 1] : ''

const siteUrl = (
  process.env.SITE_URL?.trim() || 'http://localhost:3000'
).replace(/\/$/, '')
const token = process.env.INGEST_TOKEN?.trim() ?? ''

/** The file to read: the one named on the command line, or the game's. */
const locate = (): string => fileArg || locateSaved()

/** Sends the professions of the characters played on this account. */
async function uploadCrafting(source: string): Promise<void> {
  const crafting = craftingFromSavedVariables(source)
  if (crafting.characters.length === 0) return
  if (flag('dry')) {
    console.log(`Would upload professions. ${describeCrafting(crafting)}`)
    return
  }
  const response = await fetch(`${siteUrl}/api/crafting`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(crafting),
  })
  const body = (await response.json().catch(() => ({}))) as {
    lines?: Array<string>
    error?: string
  }
  if (response.ok) for (const line of body.lines ?? []) console.log(line)
  else
    console.error(
      `Professions refused (${response.status}): ${body.error ?? 'no reason given'}`,
    )
}

async function upload(file: string): Promise<boolean> {
  const source = readFileSync(file, 'utf8')
  const snapshots = snapshotsFromSavedVariables(source)
  if (snapshots.length === 0) {
    await uploadCrafting(source)
    console.log(
      'No roster or bank saved yet. Open the guild roster in game, then /reload.',
    )
    return false
  }
  let ok = true
  for (const snapshot of snapshots) {
    if (flag('dry')) {
      console.log(`Would upload ${describe(snapshot)}`)
      continue
    }
    const response = await fetch(`${siteUrl}/api/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(snapshot),
    })
    const body = (await response.json().catch(() => ({}))) as {
      summary?: string
      error?: string
    }
    if (response.ok) console.log(`${describe(snapshot)}. ${body.summary}`)
    else {
      ok = false
      console.error(
        `${describe(snapshot)}. Refused (${response.status}): ${body.error ?? 'no reason given'}`,
      )
    }
  }
  // After the roster, so characters that just joined are known.
  await uploadCrafting(source)
  return ok
}

async function main() {
  if (!flag('dry') && !token)
    throw new Error(
      'Set INGEST_TOKEN in .env.local (one of the site’s INGEST_TOKENS).',
    )
  const file = locate()
  console.log(`Reading ${file}`)
  const ok = await upload(file)

  if (!flag('watch')) {
    if (!ok) process.exitCode = 1
    return
  }
  console.log(
    'Watching for the game to save (logout or /reload). Ctrl+C to stop.',
  )
  watchFile(file, { interval: 5000 }, (now, before) => {
    if (now.mtimeMs === before.mtimeMs || now.size === 0) return
    console.log(`\n${new Date().toLocaleTimeString()}: the game saved`)
    upload(file).catch((error) => console.error(String(error)))
  })
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
