/** What the Events page, its server functions and `/events` in Discord share. */

export const ROLES = [
  { key: 'tank', label: 'Tank', plural: 'Tanks' },
  { key: 'healer', label: 'Healer', plural: 'Healers' },
  { key: 'damage', label: 'Damage', plural: 'Damage' },
] as const

export const REPLIES = [
  { key: 'going', label: 'Going' },
  { key: 'maybe', label: 'Maybe' },
  { key: 'out', label: 'Can’t make it' },
] as const

export type Role = (typeof ROLES)[number]['key']
export type Reply = (typeof REPLIES)[number]['key']

export const isRole = (v: unknown): v is Role => ROLES.some((r) => r.key === v)
export const isReply = (v: unknown): v is Reply =>
  REPLIES.some((r) => r.key === v)

/** An event stays listed, and open to replies, this long after it starts. */
export const LISTED_HOURS_AFTER_START = 3

export const isTimeZone = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/** How far the zone's clock is ahead of UTC at that moment, in milliseconds. */
function zoneOffset(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(at)
  const part = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value)
  const onTheClock = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  )
  return onTheClock - Math.floor(at.getTime() / 1000) * 1000
}

const WEEK = 7 * 24 * 60 * 60 * 1000

/**
 * The same time of day a week on, by the clock in `timeZone`: 8pm stays 8pm
 * when the clocks change in between, which seven times 24 hours would not.
 */
export function weekLater(at: Date, timeZone: string): Date {
  const plain = new Date(at.getTime() + WEEK)
  if (!isTimeZone(timeZone)) return plain
  return new Date(
    plain.getTime() + zoneOffset(at, timeZone) - zoneOffset(plain, timeZone),
  )
}
