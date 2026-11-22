// Finds the addon's SavedVariables file in the game folder, for the scripts
// that read it. Reads WOW_FOREVER_DIR and WOW_ACCOUNT from .env.local.
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { ADDON_COMMAND, SAVED_FILES } from '../src/lib/wow/addon'

export const wowDir =
  process.env.WOW_FOREVER_DIR?.trim() ||
  'C:/Program Files (x86)/World of Warcraft/_forever_'

/**
 * The most recently saved file across the game's accounts (or the one
 * account named by WOW_ACCOUNT). The addon's current file name wins over
 * the one it used before it was renamed, whichever is newer.
 */
export function locateSaved(): string {
  const accounts = join(wowDir, 'WTF', 'Account')
  if (!existsSync(accounts))
    throw new Error(
      `No WTF/Account folder in ${wowDir}. Set WOW_FOREVER_DIR in .env.local to your _forever_ folder.`,
    )
  const wanted = process.env.WOW_ACCOUNT?.trim()
  for (const name of SAVED_FILES) {
    const files = readdirSync(accounts)
      .filter((account) => !wanted || account === wanted)
      .map((account) => join(accounts, account, 'SavedVariables', name))
      .filter((file) => existsSync(file))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    if (files.length > 0) return files[0]
  }
  throw new Error(
    `No ${SAVED_FILES[0]} under ${accounts}. Install the addon (npm run addon:install), log in, type ${ADDON_COMMAND} status, then /reload.`,
  )
}
