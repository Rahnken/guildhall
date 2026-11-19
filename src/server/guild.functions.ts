import { createServerFn } from '@tanstack/react-start'

import { prisma } from '#/db'
import { config } from './config.server'
import { IngestRefused, ingest, summarize } from './ingest.server'
import { getViewer, requireMember, requireOfficer } from './session.server'

/** What every page needs: the guild's public details and who is signed in. */
export const getSite = createServerFn({ method: 'GET' }).handler(async () => {
  // Officers' saved settings win; the environment only fills in before then.
  const saved = await prisma.siteSettings.findUnique({ where: { id: 1 } })
  return {
    name: saved?.name ?? config.guildName,
    description: saved?.description ?? config.tagline,
    inviteUrl: saved?.inviteUrl ?? config.inviteUrl,
    viewer: getViewer(),
  }
})

const INVITE = /^https:\/\/(discord\.gg|discord\.com\/invite)\/[\w-]+$/

/** The Settings page: what the public page says about the guild. */
export const saveSettings = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    const input = (data ?? {}) as Record<string, unknown>
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    const name = text(input.name)
    const description = text(input.description).replace(/\r\n/g, '\n')
    const inviteUrl = text(input.inviteUrl)
    if (!name) throw new Error('The guild needs a name.')
    if (name.length > 60) throw new Error('Keep the name under 60 characters.')
    if (description.length > 2000)
      throw new Error('Keep the description under 2,000 characters.')
    if (inviteUrl && !INVITE.test(inviteUrl))
      throw new Error(
        'The invite must be a Discord invite link, like https://discord.gg/abc123.',
      )
    return { name, description, inviteUrl }
  })
  .handler(async ({ data }) => {
    requireOfficer()
    await prisma.siteSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
    })
  })

export const getOverview = createServerFn({ method: 'GET' }).handler(
  async () => {
    requireMember()
    const [guild, characters, tabs] = await Promise.all([
      prisma.guild.findUnique({ where: { id: 1 } }),
      prisma.character.findMany({
        select: { name: true, level: true, classToken: true, online: true },
        orderBy: [{ level: 'desc' }, { name: 'asc' }],
      }),
      prisma.bankTab.count(),
    ])
    const byClass = new Map<string, number>()
    for (const c of characters)
      byClass.set(c.classToken, (byClass.get(c.classToken) ?? 0) + 1)
    return {
      realm: guild?.realm ?? null,
      rosterAt: guild?.rosterAt ?? null,
      members: characters.length,
      classes: [...byClass]
        .map(([classToken, count]) => ({ classToken, count }))
        .sort((a, b) => b.count - a.count),
      top: characters.slice(0, 10),
      bankTabs: tabs,
    }
  },
)

export const getRoster = createServerFn({ method: 'GET' }).handler(async () => {
  requireMember()
  const [guild, characters] = await Promise.all([
    prisma.guild.findUnique({ where: { id: 1 } }),
    prisma.character.findMany({
      orderBy: [{ rankIndex: 'asc' }, { level: 'desc' }, { name: 'asc' }],
    }),
  ])
  // `now` is the server's clock, so the page's first render agrees with it.
  return { rosterAt: guild?.rosterAt ?? null, now: new Date(), characters }
})

export const getBank = createServerFn({ method: 'GET' }).handler(async () => {
  requireMember()
  const [guild, tabs] = await Promise.all([
    prisma.guild.findUnique({ where: { id: 1 } }),
    prisma.bankTab.findMany({
      orderBy: { index: 'asc' },
      include: { items: { orderBy: { slot: 'asc' } } },
    }),
  ])
  return {
    copper: guild?.bankCopper != null ? Number(guild.bankCopper) : null,
    tabs,
  }
})

export const getSyncLog = createServerFn({ method: 'GET' }).handler(
  async () => {
    requireOfficer()
    return prisma.syncLog.findMany({ orderBy: { id: 'desc' }, take: 20 })
  },
)

/** The officers' upload page: same path as the sync script, signed in instead. */
export const uploadSnapshot = createServerFn({ method: 'POST' })
  .validator((data: unknown) => data)
  .handler(async ({ data }) => {
    const viewer = requireOfficer()
    try {
      return {
        ok: true as const,
        summary: summarize(await ingest(data, viewer.name)),
      }
    } catch (error) {
      if (error instanceof IngestRefused)
        return { ok: false as const, summary: error.message }
      throw error
    }
  })
