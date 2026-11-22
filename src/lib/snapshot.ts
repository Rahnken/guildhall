/**
 * The guild data that travels from the game to the site. The companion addon
 * writes it to SavedVariables; the sync script (or the officers' upload page)
 * turns that file into a Snapshot and sends it to the server, which checks it
 * again with parseSnapshot before storing anything.
 */
import { savedData } from './wow/addon'

export type RosterMember = {
  name: string
  rank: string
  rankIndex: number
  level: number
  classToken: string
  zone: string
  note: string
  online: boolean
  lastOnlineHours: number | null
}

export type BankTabSnapshot = {
  index: number
  name: string
  /** Unix seconds. */
  scannedAt: number
  items: Array<{ slot: number; itemId: number; name: string; count: number }>
}

export type Snapshot = {
  guild: { name: string; realm: string; faction: string }
  /** Null when the addon has only seen the bank so far. */
  roster: {
    /** Unix seconds. */
    capturedAt: number
    capturedBy: string
    members: Array<RosterMember>
  } | null
  bank: {
    /** Copper. */
    money: number | null
    tabCount: number | null
    tabs: Array<BankTabSnapshot>
  }
}

const MAX_MEMBERS = 2000
const MAX_TABS = 20
const MAX_ITEMS = 200

type Loose = Record<string, unknown>

const record = (v: unknown): Loose =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Loose) : {}

/** A Lua list arrives as an array, or as an object when it has gaps. */
const list = (v: unknown): Array<unknown> =>
  Array.isArray(v) ? v : Object.values(record(v))

const text = (v: unknown, max = 200): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : ''

const whole = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null

/** Checks untrusted input and returns a clean Snapshot, or throws. */
export function parseSnapshot(input: unknown): Snapshot {
  const raw = record(input)
  const guild = record(raw.guild)
  const name = text(guild.name)
  const realm = text(guild.realm)
  // The realm can be blank: the Forever client does not always report one.
  if (!name) throw new Error('Snapshot has no guild name')

  let roster: Snapshot['roster'] = null
  const rawRoster = record(raw.roster)
  const capturedAt = whole(rawRoster.capturedAt)
  if (capturedAt) {
    const seen = new Set<string>()
    const members: Array<RosterMember> = []
    for (const entry of list(rawRoster.members).slice(0, MAX_MEMBERS)) {
      const m = record(entry)
      const memberName = text(m.name, 60)
      if (!memberName || seen.has(memberName)) continue
      seen.add(memberName)
      members.push({
        name: memberName,
        rank: text(m.rank, 60),
        rankIndex: whole(m.rankIndex) ?? 0,
        level: whole(m.level) ?? 0,
        classToken: text(m.classToken, 30).toUpperCase(),
        zone: text(m.zone, 80),
        note: text(m.note, 120),
        online: m.online === true,
        lastOnlineHours: m.online === true ? null : whole(m.lastOnlineHours),
      })
    }
    if (members.length === 0) throw new Error('Snapshot roster is empty')
    roster = { capturedAt, capturedBy: text(rawRoster.capturedBy, 60), members }
  }

  const rawBank = record(raw.bank)
  const tabs: Array<BankTabSnapshot> = []
  for (const entry of list(rawBank.tabs).slice(0, MAX_TABS)) {
    const t = record(entry)
    const index = whole(t.index)
    const scannedAt = whole(t.scannedAt)
    if (!index || !scannedAt) continue
    const items = []
    for (const rawItem of list(t.items).slice(0, MAX_ITEMS)) {
      const item = record(rawItem)
      const slot = whole(item.slot)
      const itemId = whole(item.itemId)
      if (!slot || !itemId) continue
      items.push({
        slot,
        itemId,
        name: text(item.name, 120) || `Item ${itemId}`,
        count: whole(item.count) || 1,
      })
    }
    tabs.push({
      index,
      name: text(t.name, 60) || `Tab ${index}`,
      scannedAt,
      items,
    })
  }

  if (!roster && tabs.length === 0)
    throw new Error('Snapshot has neither a roster nor any bank tabs')

  return {
    guild: { name, realm, faction: text(guild.faction, 20) },
    roster,
    bank: {
      money: whole(rawBank.money),
      tabCount: whole(rawBank.tabCount),
      tabs,
    },
  }
}

/**
 * Reads the addon's SavedVariables file (MankriksFluffers.lua). One snapshot per
 * guild the account has characters in, most recently captured first; guilds
 * with nothing usable are left out.
 */
export function snapshotsFromSavedVariables(source: string): Array<Snapshot> {
  const db = savedData(source)
  const found: Array<Snapshot> = []
  for (const entry of Object.values(record(db.guilds))) {
    const g = record(entry)
    const bank = record(g.bank)
    try {
      found.push(
        parseSnapshot({
          guild: { name: g.name, realm: g.realm, faction: g.faction },
          roster: {
            capturedAt: g.rosterAt,
            capturedBy: g.rosterBy,
            members: list(g.roster).map((raw) => {
              const m = record(raw)
              return { ...m, classToken: m.class }
            }),
          },
          bank: {
            money: bank.money,
            tabCount: bank.tabCount,
            tabs: list(bank.tabs).map((raw) => {
              const t = record(raw)
              return {
                ...t,
                items: list(t.items).map((rawItem) => {
                  const item = record(rawItem)
                  return { ...item, itemId: item.id }
                }),
              }
            }),
          },
        }),
      )
    } catch {
      // A guild record with nothing captured yet.
    }
  }
  return found.sort((a, b) => latest(b) - latest(a))
}

/** When a snapshot's newest piece of data was captured, in Unix seconds. */
export const latest = (s: Snapshot): number =>
  Math.max(s.roster?.capturedAt ?? 0, ...s.bank.tabs.map((t) => t.scannedAt))

export const describe = (s: Snapshot): string =>
  `${s.guild.name}${s.guild.realm ? ` (${s.guild.realm})` : ''}: ` +
  (s.roster ? `${s.roster.members.length} members` : 'no roster') +
  `, ${s.bank.tabs.length} bank tab${s.bank.tabs.length === 1 ? '' : 's'}`
