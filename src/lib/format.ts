/** Class tokens the client uses, with display names and the usual colours. */
const CLASSES: Record<string, { name: string; color: string } | undefined> = {
  WARRIOR: { name: 'Warrior', color: '#C69B6D' },
  PALADIN: { name: 'Paladin', color: '#F48CBA' },
  HUNTER: { name: 'Hunter', color: '#AAD372' },
  ROGUE: { name: 'Rogue', color: '#FFF468' },
  PRIEST: { name: 'Priest', color: '#FFFFFF' },
  DEATHKNIGHT: { name: 'Death Knight', color: '#C41E3A' },
  SHAMAN: { name: 'Shaman', color: '#0070DD' },
  MAGE: { name: 'Mage', color: '#3FC7EB' },
  WARLOCK: { name: 'Warlock', color: '#8788EE' },
  MONK: { name: 'Monk', color: '#00FF98' },
  DRUID: { name: 'Druid', color: '#FF7C0A' },
  DEMONHUNTER: { name: 'Demon Hunter', color: '#A330C9' },
  EVOKER: { name: 'Evoker', color: '#33937F' },
}

export const className = (token: string): string =>
  CLASSES[token]?.name ??
  (token ? token.charAt(0) + token.slice(1).toLowerCase() : 'Unknown')

export const classColor = (token: string): string =>
  CLASSES[token]?.color ?? '#d6d3d1'

/** "online", "5h ago", "3d ago" from the roster's hours-since-seen. */
export function lastSeen(online: boolean, hours: number | null): string {
  if (online) return 'online'
  if (hours === null) return 'unknown'
  if (hours < 1) return 'under 1h ago'
  if (hours < 48) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function gold(copper: number): string {
  return `${Math.floor(copper / 10000).toLocaleString('en-US')}g`
}

export function when(date: Date | string | null): string {
  if (!date) return 'never'
  return new Date(date).toLocaleString('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
