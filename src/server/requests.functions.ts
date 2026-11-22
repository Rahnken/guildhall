/**
 * Crafting requests: a member asks for something to be made, a crafter
 * takes it, and one of them marks it done. Like character claims, it runs on
 * trust: anyone can take a request, and each step is posted to the updates
 * channel, notifying only the person it concerns.
 */
import { createServerFn } from '@tanstack/react-start'

import { prisma } from '#/db'
import { config } from './config.server'
import { recipeBySpell, recipeIcon } from './crafting.server'
import { postToChannel } from './discord.server'
import { requireMember } from './session.server'

/** Requests one member can have waiting at once. */
const MAX_ACTIVE = 10
/** Finished requests stay listed this long. */
const RECENT_DAYS = 14

const ACTIVE = ['open', 'accepted']

type Loose = Record<string, unknown>
const record = (v: unknown): Loose =>
  typeof v === 'object' && v !== null ? (v as Loose) : {}
const text = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : ''

const requestId = (data: unknown) => {
  const id = Number(record(data).id)
  if (!Number.isInteger(id)) throw new Error('Which request?')
  return { id }
}

/** "2× Linen Bag", as it is written in channel posts and on the page. */
const wanted = (request: { spellId: number; quantity: number }): string => {
  const name = recipeBySpell.get(request.spellId)?.name ?? 'something'
  return request.quantity > 1 ? `${request.quantity}× ${name}` : name
}

const link = () => `${config.publicUrl}/requests`

/** Open requests, and the ones finished lately. */
export const getRequests = createServerFn({ method: 'GET' }).handler(
  async () => {
    const viewer = requireMember()
    const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000)
    const [rows, known] = await Promise.all([
      prisma.craftRequest.findMany({
        where: {
          OR: [{ status: { in: ACTIVE } }, { updatedAt: { gte: since } }],
        },
        orderBy: { createdAt: 'desc' },
        include: { requester: true, asked: true, crafter: true },
      }),
      // What the viewer's own characters can make.
      prisma.knownRecipe.findMany({
        where: { profession: { character: { memberId: viewer.id } } },
        select: { spellId: true },
      }),
    ])
    const canMake = new Set(known.map((k) => k.spellId))
    const requests = rows.flatMap((row) => {
      const recipe = recipeBySpell.get(row.spellId)
      if (!recipe) return []
      return {
        id: row.id,
        status: row.status,
        spellId: row.spellId,
        name: recipe.name,
        profession: recipe.profession,
        icon: recipeIcon(recipe),
        quantity: row.quantity,
        materials: recipe.reagents.map((reagent) => ({
          name: reagent.name,
          count: reagent.count * row.quantity,
        })),
        deliverTo: row.deliverTo,
        hasMaterials: row.hasMaterials,
        note: row.note,
        requester: row.requester.name,
        asked: row.asked?.name ?? null,
        crafter: row.crafter?.name ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        mine: row.requesterId === viewer.id,
        askedMe: row.askedId === viewer.id,
        makingIt: row.crafterId === viewer.id,
        canMake: canMake.has(row.spellId),
      }
    })
    return {
      active: requests.filter((r) => ACTIVE.includes(r.status)),
      finished: requests
        .filter((r) => !ACTIVE.includes(r.status))
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
      officer: viewer.officer,
    }
  },
)

/** The viewer's claimed characters, to choose where a request is sent. */
export const getMyCharacters = createServerFn({ method: 'GET' }).handler(
  async () => {
    const viewer = requireMember()
    const characters = await prisma.character.findMany({
      where: { memberId: viewer.id },
      orderBy: [{ main: 'desc' }, { name: 'asc' }],
      select: { name: true },
    })
    return characters.map((c) => c.name)
  },
)

/**
 * Asks for something to be made. `ask` is the character of a crafter to
 * address it to; without one, it is open to whoever can make it.
 */
export const createRequest = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    const d = record(data)
    const quantity = Number(d.quantity)
    return {
      spellId: Number(d.spellId),
      quantity: Number.isInteger(quantity)
        ? Math.min(Math.max(quantity, 1), 200)
        : 1,
      deliverTo: text(d.deliverTo, 60),
      hasMaterials: d.hasMaterials === true,
      note: text(d.note, 300),
      ask: text(d.ask, 60),
    }
  })
  .handler(async ({ data }) => {
    const viewer = requireMember()
    const recipe = recipeBySpell.get(data.spellId)
    if (!recipe) throw new Error('That recipe is not in the list.')

    const [active, askedCharacter, crafters] = await Promise.all([
      prisma.craftRequest.count({
        where: { requesterId: viewer.id, status: { in: ACTIVE } },
      }),
      data.ask
        ? prisma.character.findUnique({
            where: { name: data.ask },
            include: { member: true },
          })
        : null,
      prisma.knownRecipe.findMany({
        where: { spellId: recipe.spellId },
        select: { profession: { select: { character: true } } },
      }),
    ])
    if (active >= MAX_ACTIVE)
      throw new Error(
        `You already have ${MAX_ACTIVE} requests waiting. Cancel one first.`,
      )
    const asked = askedCharacter?.member ?? null
    if (data.ask && !asked)
      throw new Error(
        `${data.ask} has not been claimed by anyone, so there is nobody to ask.`,
      )

    await prisma.member.upsert({
      where: { id: viewer.id },
      create: { id: viewer.id, name: viewer.name },
      update: { name: viewer.name },
    })
    const request = await prisma.craftRequest.create({
      data: {
        spellId: recipe.spellId,
        quantity: data.quantity,
        deliverTo: data.deliverTo,
        hasMaterials: data.hasMaterials,
        note: data.note,
        requesterId: viewer.id,
        askedId: asked?.id ?? null,
      },
    })

    const names = crafters.map((k) => k.profession.character.name)
    await postToChannel(
      [
        `**Request:** ${viewer.name} would like ${wanted(request)} (${recipe.profession})` +
          (data.deliverTo ? `, sent to ${data.deliverTo}` : '') +
          '.',
        data.hasMaterials
          ? 'They will send the materials.'
          : 'They need the materials too.',
        data.note ? `“${data.note}”` : '',
        asked
          ? `Asked: <@${asked.id}>.`
          : names.length > 0
            ? `Can make it: ${names.slice(0, 8).join(', ')}.`
            : 'Nobody has this recipe saved on the site yet.',
        link(),
      ]
        .filter(Boolean)
        .join(' '),
      asked ? [asked.id] : [],
    )
    return { id: request.id }
  })

/** "I'll make it": only while nobody else has taken it. */
export const acceptRequest = createServerFn({ method: 'POST' })
  .validator(requestId)
  .handler(async ({ data }) => {
    const viewer = requireMember()
    await prisma.member.upsert({
      where: { id: viewer.id },
      create: { id: viewer.id, name: viewer.name },
      update: { name: viewer.name },
    })
    const { count } = await prisma.craftRequest.updateMany({
      where: { id: data.id, status: 'open' },
      data: { status: 'accepted', crafterId: viewer.id },
    })
    if (count === 0)
      throw new Error('Someone has already taken that request, or it is gone.')
    const request = await prisma.craftRequest.findUniqueOrThrow({
      where: { id: data.id },
    })
    await postToChannel(
      `**Request taken:** ${viewer.name} will make ${wanted(request)} for <@${request.requesterId}>.` +
        (request.hasMaterials ? ' Send them the materials.' : ''),
      [request.requesterId],
    )
  })

/** The crafter gives a request back, so someone else can take it. */
export const releaseRequest = createServerFn({ method: 'POST' })
  .validator(requestId)
  .handler(async ({ data }) => {
    const viewer = requireMember()
    const { count } = await prisma.craftRequest.updateMany({
      where: { id: data.id, status: 'accepted', crafterId: viewer.id },
      data: { status: 'open', crafterId: null },
    })
    if (count === 0) throw new Error('That request is not yours to give back.')
    const request = await prisma.craftRequest.findUniqueOrThrow({
      where: { id: data.id },
    })
    await postToChannel(
      `**Request open again:** ${viewer.name} cannot make ${wanted(request)} for <@${request.requesterId}> after all. ${link()}`,
      [request.requesterId],
    )
  })

/** Made and sent. The crafter, the requester or an officer can say so. */
export const completeRequest = createServerFn({ method: 'POST' })
  .validator(requestId)
  .handler(async ({ data }) => {
    const viewer = requireMember()
    const { count } = await prisma.craftRequest.updateMany({
      where: {
        id: data.id,
        status: 'accepted',
        ...(viewer.officer
          ? {}
          : { OR: [{ crafterId: viewer.id }, { requesterId: viewer.id }] }),
      },
      data: { status: 'done' },
    })
    if (count === 0) throw new Error('That request is not yours to finish.')
    const request = await prisma.craftRequest.findUniqueOrThrow({
      where: { id: data.id },
      include: { crafter: true },
    })
    // The requester already knows when they are the one saying so.
    if (request.requesterId !== viewer.id)
      await postToChannel(
        `**Request done:** ${request.crafter?.name ?? viewer.name} made ${wanted(request)} for <@${request.requesterId}>` +
          (request.deliverTo ? `. It goes to ${request.deliverTo}.` : '.'),
        [request.requesterId],
      )
  })

/** The requester no longer wants it; officers can cancel anyone's. */
export const cancelRequest = createServerFn({ method: 'POST' })
  .validator(requestId)
  .handler(async ({ data }) => {
    const viewer = requireMember()
    const before = await prisma.craftRequest.findUnique({
      where: { id: data.id },
    })
    const { count } = await prisma.craftRequest.updateMany({
      where: {
        id: data.id,
        status: { in: ACTIVE },
        ...(viewer.officer ? {} : { requesterId: viewer.id }),
      },
      data: { status: 'cancelled' },
    })
    if (count === 0 || !before)
      throw new Error('That request is not yours to cancel.')
    // Only the crafter needs telling, and only if someone had taken it.
    if (before.crafterId && before.crafterId !== viewer.id)
      await postToChannel(
        `**Request cancelled:** <@${before.crafterId}>, ${wanted(before)} is no longer needed.`,
        [before.crafterId],
      )
  })
