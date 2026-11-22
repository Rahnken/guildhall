/** Answers Discord slash commands; src/lib/commands.ts defines them. */
import { prisma } from '#/db'
import {
  ONLINE_FRESH_MINUTES,
  className,
  gold,
  lastSeen,
  minutesSince,
} from '#/lib/format'

type Interaction = {
  data?: {
    name?: string
    options?: Array<{ name: string; value?: string | number | boolean }>
  }
}

const stamp = (date: Date | null) =>
  date ? `<t:${Math.floor(date.getTime() / 1000)}:R>` : 'never'

/** Returns the reply text for a slash command. */
export async function runCommand(interaction: Interaction): Promise<string> {
  const option = (name: string) => {
    const value = interaction.data?.options?.find((o) => o.name === name)?.value
    return typeof value === 'string' ? value.trim() : ''
  }
  switch (interaction.data?.name) {
    case 'roster':
      return roster()
    case 'who':
      return who(option('name'))
    case 'bank':
      return bank(option('item'))
    default:
      return 'I don’t know that command.'
  }
}

async function roster(): Promise<string> {
  const [guild, characters] = await Promise.all([
    prisma.guild.findUnique({ where: { id: 1 } }),
    prisma.character.findMany({
      orderBy: [{ level: 'desc' }, { name: 'asc' }],
    }),
  ])
  if (!guild || characters.length === 0)
    return 'No roster has been uploaded yet.'

  const byClass = new Map<string, number>()
  for (const c of characters)
    byClass.set(c.classToken, (byClass.get(c.classToken) ?? 0) + 1)
  const classes = [...byClass]
    .sort((a, b) => b[1] - a[1])
    .map(([token, count]) => `${className(token)} ${count}`)
    .join(', ')
  const top = characters
    .slice(0, 5)
    .map((c) => `${c.name} (${c.level})`)
    .join(', ')

  const lines = [
    `**${guild.name}**: ${characters.length} members`,
    `**Classes:** ${classes}`,
    `**Highest level:** ${top}`,
  ]
  // Who is online is only worth saying while the upload is recent.
  const age = minutesSince(guild.rosterAt, Date.now())
  if (age !== null && age < ONLINE_FRESH_MINUTES) {
    const online = characters.filter((c) => c.online).map((c) => c.name)
    const shown = online.slice(0, 20).join(', ')
    const more = online.length > 20 ? ` and ${online.length - 20} more` : ''
    lines.push(`**Online (${online.length}):** ${shown || 'nobody'}${more}`)
  }
  lines.push(`Roster updated ${stamp(guild.rosterAt)}`)
  return lines.join('\n')
}

async function who(query: string): Promise<string> {
  if (!query) return 'Give me a character name.'
  const found = await prisma.character.findMany({
    where: { name: { contains: query } },
    orderBy: { name: 'asc' },
    take: 6,
    include: { member: { include: { characters: { where: { main: true } } } } },
  })
  if (found.length === 0) return `Nobody in the guild matches “${query}”.`
  const lines = found.slice(0, 5).map((c) => {
    const where = c.zone ? `, ${c.zone}` : ''
    const main = c.member?.characters.at(0)?.name
    const player = !c.member
      ? ''
      : c.main || !main
        ? `. Played by ${c.member.name}`
        : `. ${c.member.name}’s alt (main: ${main})`
    return `**${c.name}**: level ${c.level} ${className(c.classToken)}, ${c.rank}${where} (${lastSeen(c.online, c.lastOnlineHours)})${player}`
  })
  if (found.length > 5) lines.push('More matches: narrow the name down.')
  return lines.join('\n')
}

async function bank(query: string): Promise<string> {
  const tabs = await prisma.bankTab.findMany({
    orderBy: { index: 'asc' },
    include: { _count: { select: { items: true } } },
  })
  if (tabs.length === 0) return 'The guild bank has not been uploaded yet.'

  if (!query) {
    const guild = await prisma.guild.findUnique({ where: { id: 1 } })
    const lines = tabs.map(
      (t) =>
        `**${t.name}**: ${t._count.items} stacks, seen ${stamp(t.scannedAt)}`,
    )
    if (guild?.bankCopper != null)
      lines.push(`**Gold:** ${gold(Number(guild.bankCopper))}`)
    return lines.join('\n')
  }

  const items = await prisma.bankItem.findMany({
    where: { name: { contains: query } },
    include: { tab: true },
  })
  if (items.length === 0) return `Nothing in the bank matches “${query}”.`
  // One line per item, adding up stacks and naming the tabs they sit in.
  const totals = new Map<string, { count: number; tabs: Set<string> }>()
  for (const item of items) {
    const total = totals.get(item.name) ?? { count: 0, tabs: new Set() }
    total.count += item.count
    total.tabs.add(item.tab.name)
    totals.set(item.name, total)
  }
  const lines = [...totals]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([name, t]) => `**${name}** x${t.count} (${[...t.tabs].join(', ')})`)
  if (totals.size > 10) lines.push(`…and ${totals.size - 10} more items.`)
  return lines.join('\n')
}
