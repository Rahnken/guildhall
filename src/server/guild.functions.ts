import { createServerFn } from '@tanstack/react-start'

import { prisma } from '#/db'
import { config } from './config.server'
import { IngestRefused, ingest, summarize } from './ingest.server'
import { getViewer, requireMember, requireOfficer } from './session.server'

/** What every page needs: the guild's public details and who is signed in. */
export const getSite = createServerFn({ method: 'GET' }).handler(() => ({
  name: config.guildName,
  tagline: config.tagline,
  inviteUrl: config.inviteUrl,
  viewer: getViewer(),
}))

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
  return { rosterAt: guild?.rosterAt ?? null, characters }
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
