/**
 * Events, as the page and the `/events` slash command both read them.
 *
 * A weekly event is one row at a time. Once it has started, a copy a week
 * later is made and takes over the `repeats` flag, so replies belong to one
 * week only, editing the next occurrence changes the ones after it, and
 * unticking "repeats" ends the series. There is no scheduler: the copy is
 * made the next time anyone looks.
 */
import { prisma } from '#/db'
import { LISTED_HOURS_AFTER_START, weekLater } from '#/lib/events'

/** Makes next week's copy of every weekly event that has started. */
async function rollOver(now: Date): Promise<void> {
  const started = await prisma.event.findMany({
    where: { repeats: true, startsAt: { lt: now } },
  })
  for (const event of started) {
    let next = weekLater(event.startsAt, event.timeZone)
    while (next < now) next = weekLater(next, event.timeZone)
    await prisma.$transaction(async (tx) => {
      // Two people looking at once must not make two copies.
      const { count } = await tx.event.updateMany({
        where: { id: event.id, repeats: true },
        data: { repeats: false },
      })
      if (count === 0) return
      await tx.event.create({
        data: {
          title: event.title,
          description: event.description,
          startsAt: next,
          timeZone: event.timeZone,
          repeats: true,
          createdBy: event.createdBy,
        },
      })
    })
  }
}

/** The earliest start an event can have and still be listed. */
export const listedSince = (now: Date) =>
  new Date(now.getTime() - LISTED_HOURS_AFTER_START * 60 * 60 * 1000)

/** Events still to come or only just started, soonest first, with replies. */
export async function listedEvents(now = new Date()) {
  await rollOver(now)
  return prisma.event.findMany({
    where: { startsAt: { gte: listedSince(now) } },
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    include: {
      signups: {
        include: { character: true, member: true },
        orderBy: { id: 'asc' },
      },
    },
  })
}
