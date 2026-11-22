/** Stores an uploaded snapshot and announces what changed. */
import { prisma } from '#/db'
import { parseSnapshot } from '#/lib/snapshot'
import { postToChannel } from './discord.server'

export type IngestResult = {
  roster: 'updated' | 'unchanged' | 'absent'
  members: number
  joined: Array<string>
  left: Array<string>
  milestones: Array<{ name: string; level: number }>
  bankTabsUpdated: number
}

/** A refusal the uploader should see as-is (wrong guild, bad timestamps). */
export class IngestRefused extends Error {}

const MILESTONE_EVERY = 10
const names = (list: Array<string>) =>
  list.length > 15
    ? `${list.slice(0, 15).join(', ')} and ${list.length - 15} more`
    : list.join(', ')

export async function ingest(
  input: unknown,
  uploadedBy: string,
): Promise<IngestResult> {
  let snapshot
  try {
    snapshot = parseSnapshot(input)
  } catch (error) {
    throw new IngestRefused(
      error instanceof Error ? error.message : 'Bad snapshot',
    )
  }

  const tomorrow = Date.now() / 1000 + 24 * 60 * 60
  if ((snapshot.roster?.capturedAt ?? 0) > tomorrow)
    throw new IngestRefused('Snapshot is dated in the future')

  const result = await prisma.$transaction(async (tx) => {
    const guild = await tx.guild.findUnique({ where: { id: 1 } })
    // An officer's alt in another guild must not replace this guild's roster.
    // The realm only counts when both sides have one: the Forever client
    // sometimes reports none, and the guild's name is then all there is.
    const otherRealm =
      guild?.realm && snapshot.guild.realm
        ? guild.realm !== snapshot.guild.realm
        : false
    if (guild && (guild.name !== snapshot.guild.name || otherRealm))
      throw new IngestRefused(
        `This site is for ${guild.name} (${guild.realm}), not ${snapshot.guild.name} (${snapshot.guild.realm || 'no realm given'})`,
      )

    const out: IngestResult = {
      roster: snapshot.roster ? 'unchanged' : 'absent',
      members: 0,
      joined: [],
      left: [],
      milestones: [],
      bankTabsUpdated: 0,
    }

    const roster = snapshot.roster
    const rosterAt = roster && new Date(roster.capturedAt * 1000)
    const rosterIsNewer =
      rosterAt !== null && (!guild?.rosterAt || rosterAt > guild.rosterAt)

    if (roster && rosterIsNewer) {
      const before = new Map(
        (await tx.character.findMany()).map((c) => [c.name, c]),
      )
      const firstUpload = before.size === 0
      for (const member of roster.members) {
        const known = before.get(member.name)
        if (!known) {
          if (!firstUpload) out.joined.push(member.name)
        } else if (
          Math.floor(member.level / MILESTONE_EVERY) >
          Math.floor(known.level / MILESTONE_EVERY)
        )
          out.milestones.push({ name: member.name, level: member.level })
        await tx.character.upsert({
          where: { name: member.name },
          create: member,
          update: member,
        })
      }
      const current = new Set(roster.members.map((m) => m.name))
      out.left = [...before.keys()].filter((name) => !current.has(name))
      if (out.left.length > 0)
        await tx.character.deleteMany({ where: { name: { in: out.left } } })
      out.roster = 'updated'
    }

    for (const tab of snapshot.bank.tabs) {
      const scannedAt = new Date(tab.scannedAt * 1000)
      const known = await tx.bankTab.findUnique({ where: { index: tab.index } })
      if (known && known.scannedAt >= scannedAt) continue
      await tx.bankTab.deleteMany({ where: { index: tab.index } })
      await tx.bankTab.create({
        data: {
          index: tab.index,
          name: tab.name,
          scannedAt,
          items: { create: tab.items },
        },
      })
      out.bankTabsUpdated++
    }
    // Tabs the guild no longer has.
    if (snapshot.bank.tabCount !== null && out.bankTabsUpdated > 0)
      await tx.bankTab.deleteMany({
        where: { index: { gt: snapshot.bank.tabCount } },
      })

    const facts = {
      name: snapshot.guild.name,
      // A blank realm must not wipe the one already known.
      realm: snapshot.guild.realm || guild?.realm || '',
      faction: snapshot.guild.faction,
      ...(roster && rosterIsNewer
        ? { rosterAt, rosterBy: roster.capturedBy }
        : {}),
      ...(out.bankTabsUpdated > 0 && snapshot.bank.money !== null
        ? { bankCopper: BigInt(snapshot.bank.money) }
        : {}),
    }
    await tx.guild.upsert({
      where: { id: 1 },
      create: { id: 1, ...facts },
      update: facts,
    })

    out.members = await tx.character.count()
    // Repeat uploads of the same data are not worth a history row.
    if (out.roster === 'updated' || out.bankTabsUpdated > 0)
      await tx.syncLog.create({
        data: { uploadedBy, summary: summarize(out) },
      })
    return out
  })

  await announce(result)
  return result
}

export function summarize(r: IngestResult): string {
  const parts = []
  if (r.roster === 'updated') {
    parts.push(`roster updated (${r.members} members)`)
    if (r.joined.length) parts.push(`${r.joined.length} joined`)
    if (r.left.length) parts.push(`${r.left.length} left`)
  } else if (r.roster === 'unchanged') parts.push('roster not newer, kept')
  if (r.bankTabsUpdated)
    parts.push(
      `${r.bankTabsUpdated} bank tab${r.bankTabsUpdated === 1 ? '' : 's'} updated`,
    )
  return parts.join(', ') || 'nothing new'
}

async function announce(r: IngestResult) {
  const lines = []
  if (r.joined.length) lines.push(`**Joined:** ${names(r.joined)}`)
  if (r.left.length) lines.push(`**Left:** ${names(r.left)}`)
  if (r.milestones.length)
    lines.push(
      `**Levelled up:** ${names(r.milestones.map((m) => `${m.name} (${m.level})`))}`,
    )
  if (lines.length) await postToChannel(lines.join('\n'))
}
