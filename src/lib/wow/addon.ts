/**
 * The companion addon's names, in one place: its folder, the file the game
 * saves for it, and the table inside that file.
 *
 * The addon was plain Guildhall until it became Mankrik's Fluffers Guildhall,
 * with a folder and saved file named after the guild, to avoid another addon
 * called Guildhall. A file saved by the old one is still read, so nothing a
 * member captured before the rename is lost.
 */
import { parseSavedVariables } from './luaTable'

/** The addon's folder in Interface/AddOns, and the name of its zip. */
export const ADDON_FOLDER = 'MankriksFluffers'

/** Its slash command in game; /fluffers also works. */
export const ADDON_COMMAND = '/gh'

/** SavedVariables file names, newest name first. */
export const SAVED_FILES = ['MankriksFluffers.lua', 'Guildhall.lua']

/** What the addon saved, from the text of its SavedVariables file. */
export function savedData(source: string): Record<string, unknown> {
  const parsed = parseSavedVariables(source)
  const data = parsed.MankriksFluffersDB ?? parsed.GuildhallDB
  return typeof data === 'object' && data !== null && !Array.isArray(data)
    ? data
    : {}
}
