import { createServerFn } from '@tanstack/react-start'

import { prisma } from '#/db'
import {
  describeRecipe,
  iconOf,
  madeBy,
  recipeIcon,
  recipeBySpell,
  recipes,
  storeCrafting,
} from './crafting.server'
import { requireMember } from './session.server'

/** Who has each profession, highest skill first. */
export const getCrafters = createServerFn({ method: 'GET' }).handler(
  async () => {
    requireMember()
    const rows = await prisma.profession.findMany({
      orderBy: [{ name: 'asc' }, { skill: 'desc' }],
      include: {
        character: { include: { member: true } },
        _count: { select: { recipes: true } },
      },
    })
    const professions = new Map<
      string,
      Array<{
        character: string
        classToken: string
        player: string | null
        skill: number
        maxSkill: number
        recipes: number
      }>
    >()
    for (const row of rows)
      professions.set(row.name, [
        ...(professions.get(row.name) ?? []),
        {
          character: row.character.name,
          classToken: row.character.classToken,
          player: row.character.member?.name ?? null,
          skill: row.skill,
          maxSkill: row.maxSkill,
          recipes: row._count.recipes,
        },
      ])
    return [...professions].map(([name, crafters]) => ({ name, crafters }))
  },
)

/** The sidebar entry that lists every profession's recipes together. */
const ALL = 'All'

/**
 * The recipe book for one profession (or all of them): every recipe the
 * guild's faction can learn, how many guild characters know each, and whether
 * one of the viewer's own does. Reagents are left to getRecipe, to keep the
 * list small.
 */
export const getRecipeBook = createServerFn({ method: 'GET' })
  .validator((data: unknown) => {
    const profession = (data as { profession?: unknown } | null)?.profession
    return {
      profession: typeof profession === 'string' ? profession.slice(0, 30) : '',
    }
  })
  .handler(async ({ data }) => {
    const viewer = requireMember()
    const [guild, known] = await Promise.all([
      prisma.guild.findUnique({ where: { id: 1 } }),
      prisma.knownRecipe.findMany({
        select: {
          spellId: true,
          profession: { select: { character: { select: { memberId: true } } } },
        },
      }),
    ])
    const knownBy = new Map<number, number>()
    const mine = new Set<number>()
    for (const k of known) {
      knownBy.set(k.spellId, (knownBy.get(k.spellId) ?? 0) + 1)
      if (k.profession.character.memberId === viewer.id) mine.add(k.spellId)
    }
    const faction = guild?.faction ?? ''
    const learnable = recipes.filter(
      (r) => !r.side || !faction || faction.startsWith(r.side),
    )

    const totals = new Map<string, { recipes: number; known: number }>()
    for (const r of learnable) {
      const total = totals.get(r.profession) ?? { recipes: 0, known: 0 }
      total.recipes++
      if (knownBy.has(r.spellId)) total.known++
      totals.set(r.profession, total)
    }
    const professions = [...totals]
      .map(([name, total]) => ({ name, ...total }))
      .sort((a, b) => a.name.localeCompare(b.name))

    // Asked for by name, or else the one the guild knows most about.
    const busiest = [...professions].sort((a, b) => b.known - a.known)[0]
    const profession =
      data.profession === ALL || totals.has(data.profession)
        ? data.profession
        : busiest.name

    return {
      professions,
      profession,
      recipes: learnable
        .filter((r) => profession === ALL || r.profession === profession)
        .map((r) => ({
          spellId: r.spellId,
          name: r.name,
          profession: r.profession,
          skill: r.skill ?? null,
          icon: recipeIcon(r),
          knownBy: knownBy.get(r.spellId) ?? 0,
          mine: mine.has(r.spellId),
          // Lower case, for the search box.
          materials: r.reagents.map((x) => x.name.toLowerCase()).join('|'),
        }))
        .sort(
          (a, b) =>
            (a.skill ?? 999) - (b.skill ?? 999) || a.name.localeCompare(b.name),
        ),
    }
  })

/** One recipe in full: materials, what the bank holds, and who knows it. */
export const getRecipe = createServerFn({ method: 'GET' })
  .validator((data: unknown) => {
    const spellId = Number((data as { spellId?: unknown } | null)?.spellId)
    return { spellId: Number.isInteger(spellId) ? spellId : 0 }
  })
  .handler(async ({ data }) => {
    const viewer = requireMember()
    const recipe = recipeBySpell.get(data.spellId)
    if (!recipe) return null
    // A material that is itself crafted is shown with what it is made from.
    const from = new Map(
      recipe.reagents.flatMap((reagent) => {
        const made = madeBy(reagent.itemId)
        // Not the recipe itself, for the few that take what they make.
        return made && made.spellId !== recipe.spellId
          ? [[reagent.itemId, made] as const]
          : []
      }),
    )
    const [known, bank] = await Promise.all([
      prisma.knownRecipe.findMany({
        where: { spellId: recipe.spellId },
        include: {
          profession: { include: { character: { include: { member: true } } } },
        },
      }),
      prisma.bankItem.groupBy({
        by: ['itemId'],
        where: {
          itemId: {
            in: [
              ...recipe.reagents,
              ...[...from.values()].flatMap((made) => made.reagents),
            ].map((x) => x.itemId),
          },
        },
        _sum: { count: true },
      }),
    ])
    const inBank = new Map(bank.map((b) => [b.itemId, b._sum.count ?? 0]))
    const sub = (made: typeof recipe | undefined) =>
      made
        ? {
            spellId: made.spellId,
            profession: made.profession,
            makes: made.makes ?? 1,
            reagents: made.reagents.map((raw) => ({
              ...raw,
              icon: iconOf('items', raw.itemId),
              inBank: inBank.get(raw.itemId) ?? 0,
            })),
          }
        : null
    return {
      ...recipe,
      ...describeRecipe(recipe),
      icon: recipeIcon(recipe),
      reagents: recipe.reagents.map((reagent) => ({
        ...reagent,
        icon: iconOf('items', reagent.itemId),
        inBank: inBank.get(reagent.itemId) ?? 0,
        from: sub(from.get(reagent.itemId)),
      })),
      crafters: known
        .map((k) => ({
          character: k.profession.character.name,
          classToken: k.profession.character.classToken,
          player: k.profession.character.member?.name ?? null,
          mine: k.profession.character.memberId === viewer.id,
          skill: k.profession.skill,
        }))
        .sort((a, b) => b.skill - a.skill),
    }
  })

/** Everything the signed-in member's own characters can make. */
export const getMyRecipes = createServerFn({ method: 'GET' }).handler(
  async () => {
    const viewer = requireMember()
    const rows = await prisma.profession.findMany({
      where: { character: { memberId: viewer.id } },
      orderBy: [{ character: { name: 'asc' } }, { name: 'asc' }],
      include: { character: true, recipes: true },
    })
    return rows.map((row) => ({
      character: row.character.name,
      profession: row.name,
      skill: row.skill,
      maxSkill: row.maxSkill,
      scannedAt: row.scannedAt,
      recipes: row.recipes
        .flatMap((k) => recipeBySpell.get(k.spellId)?.name ?? [])
        .sort(),
    }))
  },
)

/** A member sends the professions from their own addon file. */
export const uploadCrafting = createServerFn({ method: 'POST' })
  .validator((data: unknown) => data)
  .handler(async ({ data }) => {
    const viewer = requireMember()
    return storeCrafting(data, { id: viewer.id, name: viewer.name })
  })
