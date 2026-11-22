/**
 * The professions that travel from the game to the site. The companion addon
 * saves, for each character played, its professions and the recipes seen in
 * each profession window; the member's upload page (or the sync script) turns
 * that file into a CraftingUpload, which the server checks again with
 * parseCrafting before storing anything.
 */
import { savedData } from './wow/addon'

export type ProfessionSnapshot = {
  name: string
  skill: number
  max: number
  /** Unix seconds. */
  scannedAt: number
  /**
   * `id` is what the game calls the recipe ("enchant:3755", "item:4238"),
   * or empty when the client did not say.
   */
  recipes: Array<{ name: string; id: string }>
}

export type CraftingUpload = {
  characters: Array<{
    name: string
    realm: string
    professions: Array<ProfessionSnapshot>
  }>
}

/** Crafting professions come with recipes; the rest are gathering skills. */
export const PROFESSIONS = [
  'Alchemy',
  'Blacksmithing',
  'Cooking',
  'Enchanting',
  'Engineering',
  'First Aid',
  'Leatherworking',
  'Tailoring',
  'Fishing',
  'Herbalism',
  'Mining',
  'Skinning',
]

const MAX_CHARACTERS = 60
const MAX_RECIPES = 1500

type Loose = Record<string, unknown>
const record = (v: unknown): Loose =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Loose) : {}
const list = (v: unknown): Array<unknown> =>
  Array.isArray(v) ? v : Object.values(record(v))
const text = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : ''
const whole = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0

/** Checks untrusted input and returns a clean CraftingUpload. */
export function parseCrafting(input: unknown): CraftingUpload {
  const characters: CraftingUpload['characters'] = []
  for (const entry of list(record(input).characters).slice(0, MAX_CHARACTERS)) {
    const c = record(entry)
    const name = text(c.name, 60)
    const realm = text(c.realm, 60)
    // The realm can be blank: the Forever client does not always report one.
    if (!name) continue
    const professions: Array<ProfessionSnapshot> = []
    for (const rawProfession of list(c.professions)) {
      const p = record(rawProfession)
      const profession = text(p.name, 30)
      const scannedAt = whole(p.scannedAt)
      if (!PROFESSIONS.includes(profession) || !scannedAt) continue
      if (professions.some((known) => known.name === profession)) continue
      const recipes = []
      for (const rawRecipe of list(p.recipes).slice(0, MAX_RECIPES)) {
        const r = record(rawRecipe)
        const recipe = text(r.name, 120)
        const id = text(r.id, 40)
        if (recipe)
          recipes.push({ name: recipe, id: /^\w+:\d+$/.test(id) ? id : '' })
      }
      professions.push({
        name: profession,
        skill: whole(p.skill),
        max: whole(p.max),
        scannedAt,
        recipes,
      })
    }
    if (professions.length > 0) characters.push({ name, realm, professions })
  }
  return { characters }
}

/** Reads the professions out of the addon's SavedVariables file. */
export function craftingFromSavedVariables(source: string): CraftingUpload {
  const db = savedData(source)
  return parseCrafting({
    characters: Object.values(record(db.characters)).map((entry) => {
      const c = record(entry)
      return {
        name: c.name,
        realm: c.realm,
        // Saved as { Tailoring = { skill, max, scannedAt, recipes = { [name] = id or true } } }.
        professions: Object.entries(record(c.professions)).map(
          ([name, raw]) => {
            const p = record(raw)
            return {
              ...p,
              name,
              recipes: Object.entries(record(p.recipes)).map(
                ([recipe, id]) => ({ name: recipe, id }),
              ),
            }
          },
        ),
      }
    }),
  })
}

export const describeCrafting = (upload: CraftingUpload): string =>
  upload.characters
    .map(
      (c) =>
        `${c.name}: ${c.professions.map((p) => `${p.name} ${p.skill}`).join(', ')}`,
    )
    .join('; ')
