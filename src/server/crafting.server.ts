/** The recipe catalogue, and storing what members' addons say they know. */
import { prisma } from '#/db'
import iconFiles from '#/data/icon-files.json'
import fromGame from '#/data/icons.json'
import catalogue from '#/data/recipes.json'
import { parseCrafting } from '#/lib/crafting'
import { postToChannel } from './discord.server'

export type Recipe = {
  profession: string
  spellId: number
  name: string
  category: string
  itemId?: number
  makes?: number
  skill?: number
  start?: boolean
  recipeItemId?: number
  side?: string
  reagents: Array<{ itemId: number; count: number; name: string }>
}

export const recipes = catalogue.recipes as Array<Recipe>
export const recipeBySpell = new Map(recipes.map((r) => [r.spellId, r]))

/**
 * What the game itself shows for the things recipes make, saved by the
 * addon's /gh icons and read in by `npm run icons:read`. Empty until then.
 */
const game = fromGame as {
  items: Record<string, number | string | undefined>
  spells: Record<string, number | string | undefined>
  quality: Record<string, number | undefined>
  tips: Record<string, Array<string> | undefined>
  spellText: Record<string, string | undefined>
}

const makers = new Map<number, Array<Recipe>>()
for (const recipe of recipes)
  if (recipe.itemId)
    makers.set(recipe.itemId, [...(makers.get(recipe.itemId) ?? []), recipe])

/**
 * The recipe that makes an item, when a material is itself crafted (a Bolt
 * of Silk Cloth from Silk Cloth). Null when nothing makes it, or when
 * differently named recipes do (the transmutes), since none is "the" way.
 */
export function madeBy(itemId: number): Recipe | null {
  const found = makers.get(itemId) ?? []
  return found.length > 0 && found.every((r) => r.name === found[0].name)
    ? found[0]
    : null
}

/** Icons with a picture in public/icons (written by `npm run icons:build`). */
const pictures = new Set<number>(iconFiles)

/** The picture for an item or spell, as the number in /icons/<number>.webp. */
export function iconOf(kind: 'items' | 'spells', id: number): number | null {
  const icon = game[kind][id]
  return typeof icon === 'number' && pictures.has(icon) ? icon : null
}

/** A recipe is drawn as the item it makes, or as its spell when it makes none. */
export const recipeIcon = (recipe: Recipe): number | null =>
  recipe.itemId
    ? iconOf('items', recipe.itemId)
    : iconOf('spells', recipe.spellId)

/** The in-game tooltip of what a recipe makes, name line left out. */
export function describeRecipe(recipe: Recipe): {
  quality: number | null
  tooltip: Array<string>
} {
  if (!recipe.itemId) {
    const text = game.spellText[recipe.spellId]
    return { quality: null, tooltip: text ? [text] : [] }
  }
  return {
    quality: game.quality[recipe.itemId] ?? null,
    tooltip: (game.tips[recipe.itemId] ?? [])
      .slice(1)
      .filter((line) => !NOT_ABOUT_THE_ITEM.test(line))
      .map(plural),
  }
}

/**
 * Tooltip lines that say nothing a reader needs: the quality's name (the
 * title's colour shows it) and lines about the character who saved them.
 */
const NOT_ABOUT_THE_ITEM =
  /^(Poor|Common|Uncommon|Rare|Epic|Legendary|You haven't collected this appearance|You've collected this appearance.*|Sell Price:.*)$/

/** The game writes "1 |4Sec:Secs;" and picks the word by the number. */
const plural = (line: string): string =>
  line.replace(
    /(\d+) \|4([^:;]*):([^;]*);/g,
    (_, n: string, one: string, many: string) =>
      `${n} ${n === '1' ? one : many}`,
  )

const key = (profession: string, name: string) =>
  `${profession}|${name.toLowerCase()}`
const byName = new Map<string, Array<Recipe>>()
const byItem = new Map<string, Array<Recipe>>()
for (const recipe of recipes) {
  const named = key(recipe.profession, recipe.name)
  byName.set(named, [...(byName.get(named) ?? []), recipe])
  if (recipe.itemId) {
    const made = `${recipe.profession}|${recipe.itemId}`
    byItem.set(made, [...(byItem.get(made) ?? []), recipe])
  }
}

/**
 * The catalogue recipes an addon's entry stands for: by the game's own id
 * when it gave one, otherwise by name. Two recipes can share a name (one per
 * faction), and then the guild's faction decides.
 */
function match(
  profession: string,
  entry: { name: string; id: string },
): Array<Recipe> {
  const [kind, id] = entry.id.split(':')
  if (kind === 'item')
    return (
      byItem.get(`${profession}|${id}`) ??
      byName.get(key(profession, entry.name)) ??
      []
    )
  const bySpell = id ? recipeBySpell.get(Number(id)) : undefined
  if (bySpell?.profession === profession) return [bySpell]
  return byName.get(key(profession, entry.name)) ?? []
}

export type CraftingResult = {
  /** One line per character, saying what happened to it. */
  lines: Array<string>
  updated: number
}

/**
 * Stores an upload of professions. With a member, their unclaimed characters
 * in it become theirs (the file comes from playing them) and characters
 * someone else has claimed are left alone. Without one (the sync script, run
 * by an officer), professions are stored and claims are not touched.
 */
export async function storeCrafting(
  input: unknown,
  member: { id: string; name: string } | null,
): Promise<CraftingResult> {
  const upload = parseCrafting(input)
  const claimed: Array<string> = []
  const result = await prisma.$transaction(async (tx) => {
    const out: CraftingResult = { lines: [], updated: 0 }
    const guild = await tx.guild.findUnique({ where: { id: 1 } })
    if (!guild) {
      out.lines.push('No roster has been uploaded yet.')
      return out
    }
    for (const uploaded of upload.characters) {
      if (uploaded.realm && uploaded.realm !== guild.realm) continue
      const character = await tx.character.findUnique({
        where: { name: uploaded.name },
        include: { professions: true },
      })
      if (!character) {
        out.lines.push(`${uploaded.name}: not on the guild roster, skipped.`)
        continue
      }
      if (member && character.memberId && character.memberId !== member.id) {
        out.lines.push(
          `${uploaded.name}: claimed by someone else, skipped. Ask an officer if that is wrong.`,
        )
        continue
      }
      if (member && !character.memberId) {
        await tx.member.upsert({
          where: { id: member.id },
          create: member,
          update: { name: member.name },
        })
        const first =
          (await tx.character.count({ where: { memberId: member.id } })) === 0
        await tx.character.update({
          where: { id: character.id },
          data: { memberId: member.id, main: first },
        })
        claimed.push(character.name)
      }

      const parts: Array<string> = []
      let unknown = 0
      for (const profession of uploaded.professions) {
        const scannedAt = new Date(profession.scannedAt * 1000)
        const known = character.professions.find(
          (p) => p.name === profession.name,
        )
        if (known && known.scannedAt > scannedAt) continue
        const spellIds = new Set<number>()
        for (const entry of profession.recipes) {
          const all = match(profession.name, entry)
          const ours = all.filter(
            (r) => !r.side || guild.faction.startsWith(r.side),
          )
          const found = ours.length > 0 ? ours : all
          if (found.length === 0) unknown++
          for (const recipe of found) spellIds.add(recipe.spellId)
        }
        const facts = {
          skill: profession.skill,
          maxSkill: profession.max,
          scannedAt,
        }
        const saved = await tx.profession.upsert({
          where: {
            characterId_name: {
              characterId: character.id,
              name: profession.name,
            },
          },
          create: {
            characterId: character.id,
            name: profession.name,
            ...facts,
          },
          update: facts,
        })
        // The profession window may not have been opened since the last
        // upload; an empty list then means "no news", not "knows nothing".
        if (spellIds.size > 0) {
          await tx.knownRecipe.deleteMany({ where: { professionId: saved.id } })
          await tx.knownRecipe.createMany({
            data: [...spellIds].map((spellId) => ({
              professionId: saved.id,
              spellId,
            })),
          })
        }
        parts.push(
          `${profession.name} ${profession.skill}` +
            (spellIds.size > 0 ? ` (${spellIds.size} recipes)` : ''),
        )
      }
      // Professions the character no longer has.
      await tx.profession.deleteMany({
        where: {
          characterId: character.id,
          name: { notIn: uploaded.professions.map((p) => p.name) },
        },
      })
      out.updated++
      out.lines.push(
        `${uploaded.name}: ${parts.join(', ') || 'nothing newer'}` +
          (unknown > 0
            ? `. ${unknown} recipe${unknown === 1 ? '' : 's'} not in the site’s list.`
            : '.'),
      )
    }
    if (out.lines.length === 0)
      out.lines.push(
        `No characters from ${guild.realm} with professions in that file.`,
      )
    return out
  })
  if (member && claimed.length > 0)
    await postToChannel(
      `**Claimed:** ${member.name} claimed ${claimed.join(', ')}`,
    )
  return result
}
