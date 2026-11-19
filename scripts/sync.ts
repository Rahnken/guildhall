// Sends the Guildhall addon's saved data to the website.
//
//   npm run sync               upload once
//   npm run sync -- --watch    stay running; upload whenever the game saves
//   npm run sync -- --dry      show what would be uploaded, send nothing
//   npm run sync -- --file <path to Guildhall.lua>
//
// Reads SITE_URL, INGEST_TOKEN, WOW_FOREVER_DIR and WOW_ACCOUNT from .env.local.
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  watchFile,
} from 'node:fs'
import { join } from 'node:path'

import { describe, snapshotsFromSavedVariables } from '../src/lib/snapshot'

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(`--${name}`)
const fileArg = args.includes('--file') ? args[args.indexOf('--file') + 1] : ''

const siteUrl = (
  process.env.SITE_URL?.trim() || 'http://localhost:3000'
).replace(/\/$/, '')
const token = process.env.INGEST_TOKEN?.trim() ?? ''

/** The addon's SavedVariables file, from the most recently played account. */
function locate(): string {
  if (fileArg) return fileArg
  const wowDir =
    process.env.WOW_FOREVER_DIR?.trim() ||
    'C:/Program Files (x86)/World of Warcraft/_forever_'
  const accounts = join(wowDir, 'WTF', 'Account')
  if (!existsSync(accounts))
    throw new Error(
      `No WTF/Account folder in ${wowDir}. Set WOW_FOREVER_DIR in .env.local to your _forever_ folder.`,
    )
  const wanted = process.env.WOW_ACCOUNT?.trim()
  const files = readdirSync(accounts)
    .filter((account) => !wanted || account === wanted)
    .map((account) =>
      join(accounts, account, 'SavedVariables', 'Guildhall.lua'),
    )
    .filter((file) => existsSync(file))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  if (files.length === 0)
    throw new Error(
      `No Guildhall.lua under ${accounts}. Install the addon (npm run addon:install), log in, then /reload.`,
    )
  return files[0]
}

async function upload(file: string): Promise<boolean> {
  const snapshots = snapshotsFromSavedVariables(readFileSync(file, 'utf8'))
  if (snapshots.length === 0) {
    console.log(
      'No guild data saved yet. Open the guild roster in game, then /reload.',
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
