/**
 * The Events page: officers set events up, members answer with one of their
 * characters and the role it would play.
 */
import { createServerFn } from '@tanstack/react-start'

import { prisma } from '#/db'
import { isReply, isRole, isTimeZone } from '#/lib/events'
import { listedEvents, listedSince } from './events.server'
import { requireMember, requireOfficer } from './session.server'

type Loose = Record<string, unknown>
const record = (v: unknown): Loose =>
  typeof v === 'object' && v !== null ? (v as Loose) : {}
const text = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : ''

const eventId = (data: unknown) => {
  const id = Number(record(data).id)
  if (!Number.isInteger(id)) throw new Error('Which event?')
  return { id }
}

/** Listed events with everyone's replies, and what the viewer can answer with. */
export const getEvents = createServerFn({ method: 'GET' }).handler(async () => {
  const viewer = requireMember()
  const [events, characters] = await Promise.all([
    listedEvents(),
    prisma.character.findMany({
      where: { memberId: viewer.id },
      orderBy: [{ main: 'desc' }, { name: 'asc' }],
    }),
  ])
  return {
    officer: viewer.officer,
    characters: characters.map((c) => ({
      id: c.id,
      name: c.name,
      level: c.level,
      classToken: c.classToken,
    })),
    events: events.map((event) => {
      const mine = event.signups.find((s) => s.memberId === viewer.id)
      return {
        id: event.id,
        title: event.title,
        description: event.description,
        startsAt: event.startsAt,
        repeats: event.repeats,
        cancelled: event.cancelled,
        createdBy: event.createdBy,
        signups: event.signups.map((s) => ({
          id: s.id,
          member: s.member.name,
          character: s.character.name,
          level: s.character.level,
          classToken: s.character.classToken,
          reply: s.reply,
          role: s.role,
          note: s.note,
        })),
        mine: mine
          ? {
              characterId: mine.characterId,
              reply: mine.reply,
              role: mine.role,
              note: mine.note,
            }
          : null,
      }
    }),
  }
})

/** Creates an event, or changes one when given its id. Officers only. */
export const saveEvent = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    const d = record(data)
    const title = text(d.title, 80)
    if (!title) throw new Error('The event needs a name.')
    const description =
      typeof d.description === 'string'
        ? d.description.trim().replace(/\r\n/g, '\n').slice(0, 1000)
        : ''
    const startsAt = new Date(typeof d.startsAt === 'string' ? d.startsAt : '')
    if (Number.isNaN(startsAt.getTime()))
      throw new Error('Pick a date and time.')
    const timeZone = text(d.timeZone, 60)
    return {
      id: d.id == null ? null : Number(d.id),
      title,
      description,
      startsAt,
      timeZone: isTimeZone(timeZone) ? timeZone : 'UTC',
      repeats: d.repeats === true,
    }
  })
  .handler(async ({ data }) => {
    const viewer = requireOfficer()
    const { id, ...fields } = data
    if (id === null) {
      if (fields.startsAt < new Date())
        throw new Error('That time has already passed.')
      const event = await prisma.event.create({
        data: { ...fields, createdBy: viewer.name },
      })
      return { id: event.id }
    }
    const { count } = await prisma.event.updateMany({
      where: { id },
      data: fields,
    })
    if (count === 0) throw new Error('That event is gone.')
    return { id }
  })

/** Calls an event off, or back on. Replies are kept either way. */
export const cancelEvent = createServerFn({ method: 'POST' })
  .validator((data: unknown) => ({
    ...eventId(data),
    cancelled: record(data).cancelled !== false,
  }))
  .handler(async ({ data }) => {
    requireOfficer()
    const { count } = await prisma.event.updateMany({
      where: { id: data.id },
      data: { cancelled: data.cancelled },
    })
    if (count === 0) throw new Error('That event is gone.')
  })

/** Removes an event and its replies. A weekly one stops repeating. */
export const deleteEvent = createServerFn({ method: 'POST' })
  .validator(eventId)
  .handler(async ({ data }) => {
    requireOfficer()
    await prisma.event.deleteMany({ where: { id: data.id } })
  })

/** A member's answer to an event; answering again replaces it. */
export const respondToEvent = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    const d = record(data)
    const characterId = Number(d.characterId)
    if (!Number.isInteger(characterId)) throw new Error('Pick a character.')
    if (!isReply(d.reply)) throw new Error('Going, maybe, or can’t make it?')
    if (!isRole(d.role)) throw new Error('Pick a role.')
    return {
      ...eventId(data),
      characterId,
      reply: d.reply,
      role: d.role,
      note: text(d.note, 200),
    }
  })
  .handler(async ({ data }) => {
    const viewer = requireMember()
    const [event, character] = await Promise.all([
      prisma.event.findUnique({ where: { id: data.id } }),
      prisma.character.findUnique({ where: { id: data.characterId } }),
    ])
    if (!event) throw new Error('That event is gone.')
    if (event.cancelled) throw new Error('That event has been cancelled.')
    if (event.startsAt < listedSince(new Date()))
      throw new Error('That event is over.')
    if (character?.memberId !== viewer.id)
      throw new Error('Answer with a character you have claimed on the roster.')

    await prisma.member.upsert({
      where: { id: viewer.id },
      create: { id: viewer.id, name: viewer.name },
      update: { name: viewer.name },
    })
    const answer = {
      characterId: character.id,
      reply: data.reply,
      role: data.role,
      note: data.note,
    }
    await prisma.eventSignup.upsert({
      where: { eventId_memberId: { eventId: event.id, memberId: viewer.id } },
      create: { eventId: event.id, memberId: viewer.id, ...answer },
      update: answer,
    })
  })

/** Takes the viewer's answer back, as if they had never replied. */
export const withdrawFromEvent = createServerFn({ method: 'POST' })
  .validator(eventId)
  .handler(async ({ data }) => {
    const viewer = requireMember()
    await prisma.eventSignup.deleteMany({
      where: { eventId: data.id, memberId: viewer.id },
    })
  })
