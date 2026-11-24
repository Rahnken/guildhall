import {
  Link,
  createFileRoute,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { useState, useSyncExternalStore } from 'react'

import {
  Button,
  Card,
  ErrorText,
  Input,
  Select,
  cx,
  useAction,
} from '../components/ui'
import { REPLIES, ROLES } from '../lib/events'
import { classColor, className } from '../lib/format'
import {
  cancelEvent,
  deleteEvent,
  getEvents,
  respondToEvent,
  saveEvent,
  withdrawFromEvent,
} from '../server/events.functions'

export const Route = createFileRoute('/events')({
  beforeLoad: ({ context }) => {
    if (!context.site.viewer) throw redirect({ to: '/' })
  },
  loader: () => getEvents(),
  component: Events,
})

type Data = Awaited<ReturnType<typeof getEvents>>
type GuildEvent = Data['events'][number]
type Signup = GuildEvent['signups'][number]
type Character = Data['characters'][number]

const label = 'mb-1 block text-sm font-medium text-stone-300'
const hint = 'mt-1 text-xs text-stone-500'
const badge = 'rounded px-1.5 text-xs'

const subscribe = () => () => {}
/**
 * False on the server and until the browser takes the page over. Times are
 * written in UTC until then, and in the visitor's own time zone after.
 */
const useInBrowser = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )

const startText = (date: Date | string, inBrowser: boolean) =>
  new Date(date).toLocaleString(inBrowser ? undefined : 'en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    ...(inBrowser ? {} : { timeZone: 'UTC' }),
  })

/** A date as `<input type="datetime-local">` wants it: local, to the minute. */
const toInputValue = (date: Date | string) => {
  const d = new Date(date)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)
}

function Events() {
  const { events, characters, officer } = Route.useLoaderData()
  const [adding, setAdding] = useState(false)

  return (
    <div className="space-y-4">
      <Card
        title="Events"
        actions={
          officer &&
          !adding && <Button onClick={() => setAdding(true)}>New event</Button>
        }
      >
        <p className="text-sm text-stone-400">
          What the guild is doing together. Times are shown in your own time
          zone. Say whether you are coming, on which character and in which
          role, so the group can be planned.
        </p>
        {adding && (
          <div className="mt-4 border-t border-stone-800 pt-4">
            <EventForm onDone={() => setAdding(false)} />
          </div>
        )}
        {events.length === 0 && !adding && (
          <p className="pt-4 text-sm text-stone-500">
            Nothing is planned yet.
            {officer && ' “New event” adds the first one.'}
          </p>
        )}
      </Card>
      {events.map((event) => (
        <EventCard
          key={event.id}
          event={event}
          characters={characters}
          officer={officer}
        />
      ))}
    </div>
  )
}

function EventForm({
  event,
  onDone,
}: {
  event?: GuildEvent
  onDone: () => void
}) {
  const router = useRouter()
  const { busy, error, run } = useAction()
  const [title, setTitle] = useState(event?.title ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [startsAt, setStartsAt] = useState(
    event ? toInputValue(event.startsAt) : '',
  )
  const [repeats, setRepeats] = useState(event?.repeats ?? false)

  const save = () =>
    run(async () => {
      const at = new Date(startsAt)
      if (Number.isNaN(at.getTime())) throw new Error('Pick a date and time.')
      await saveEvent({
        data: {
          id: event?.id ?? null,
          title,
          description,
          startsAt: at.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          repeats,
        },
      })
      await router.invalidate()
      onDone()
    })

  const id = (name: string) => `event-${event?.id ?? 'new'}-${name}`

  return (
    <form
      className="max-w-2xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div>
        <label htmlFor={id('title')} className={label}>
          Name
        </label>
        <Input
          id={id('title')}
          value={title}
          maxLength={80}
          required
          placeholder="Raid night"
          onChange={(e) => setTitle(e.target.value)}
          className="w-full"
        />
      </div>
      <div>
        <label htmlFor={id('starts')} className={label}>
          Starts
        </label>
        <Input
          id={id('starts')}
          type="datetime-local"
          value={startsAt}
          required
          onChange={(e) => setStartsAt(e.target.value)}
        />
        <p className={hint}>
          In your own time zone. Everyone else sees it in theirs.
        </p>
      </div>
      <div>
        <label htmlFor={id('description')} className={label}>
          Details
        </label>
        <textarea
          id={id('description')}
          value={description}
          maxLength={1000}
          rows={4}
          placeholder="Where to meet, what to bring, who is leading"
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded border border-stone-700 bg-stone-900 px-2 py-1.5 text-sm text-stone-100 placeholder:text-stone-500 focus:border-amber-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="flex items-center gap-2 text-sm text-stone-200">
          <input
            type="checkbox"
            checked={repeats}
            onChange={(e) => setRepeats(e.target.checked)}
          />
          Repeats every week
        </label>
        <p className={hint}>
          Next week’s event appears once this one starts, with a fresh list of
          replies. Untick this to stop it repeating.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : event ? 'Save changes' : 'Add event'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <ErrorText error={error} />
    </form>
  )
}

function EventCard({
  event,
  characters,
  officer,
}: {
  event: GuildEvent
  characters: Array<Character>
  officer: boolean
}) {
  const router = useRouter()
  const inBrowser = useInBrowser()
  const { busy, error, run } = useAction()
  const [editing, setEditing] = useState(false)
  const act = (fn: () => Promise<unknown>) =>
    run(async () => {
      await fn()
      await router.invalidate()
    })
  const started = inBrowser && new Date(event.startsAt).getTime() < Date.now()

  if (editing)
    return (
      <Card title={`Change “${event.title}”`}>
        <EventForm event={event} onDone={() => setEditing(false)} />
      </Card>
    )

  return (
    <Card className={cx(event.cancelled && 'opacity-70')}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span
              className={cx(
                'text-lg font-semibold text-stone-100',
                event.cancelled && 'line-through',
              )}
            >
              {event.title}
            </span>
            {event.cancelled && (
              <span className={cx(badge, 'bg-red-950 text-red-300')}>
                Cancelled
              </span>
            )}
            {started && !event.cancelled && (
              <span className={cx(badge, 'bg-emerald-500/15 text-emerald-300')}>
                Started
              </span>
            )}
            {event.repeats && (
              <span className={cx(badge, 'bg-stone-800 text-stone-300')}>
                Every week
              </span>
            )}
          </h3>
          <p className="mt-0.5 text-sm text-sky-300">
            {startText(event.startsAt, inBrowser)}
          </p>
        </div>
        {officer && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                act(() =>
                  cancelEvent({
                    data: { id: event.id, cancelled: !event.cancelled },
                  }),
                )
              }
            >
              {event.cancelled
                ? 'Back on'
                : event.repeats
                  ? 'Cancel this week'
                  : 'Cancel event'}
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    `Delete “${event.title}” and its replies?` +
                      (event.repeats ? ' It will stop repeating.' : ''),
                  )
                )
                  void act(() => deleteEvent({ data: { id: event.id } }))
              }}
            >
              Delete
            </Button>
          </div>
        )}
      </div>
      {event.description && (
        <p className="mt-3 max-w-3xl whitespace-pre-line text-sm text-stone-300">
          {event.description}
        </p>
      )}
      <ErrorText error={error} />
      <Replies signups={event.signups} />
      {!event.cancelled && <Answer event={event} characters={characters} />}
    </Card>
  )
}

function Who({ signup, withRole }: { signup: Signup; withRole?: boolean }) {
  const role = ROLES.find((r) => r.key === signup.role)?.label
  return (
    <li>
      <span
        style={{ color: classColor(signup.classToken) }}
        title={`Level ${signup.level} ${className(signup.classToken)}, played by ${signup.member}`}
      >
        {signup.character}
      </span>
      <span className="text-stone-500">
        {' '}
        {signup.level}
        {withRole && role && ` · ${role}`}
      </span>
      {signup.note && <span className="text-stone-400"> “{signup.note}”</span>}
    </li>
  )
}

function Replies({ signups }: { signups: Array<Signup> }) {
  const going = signups.filter((s) => s.reply === 'going')
  const maybe = signups.filter((s) => s.reply === 'maybe')
  const out = signups.filter((s) => s.reply === 'out')

  return (
    <div className="mt-4 space-y-3 border-t border-stone-800 pt-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        {ROLES.map((role) => {
          const inRole = going.filter((s) => s.role === role.key)
          return (
            <div key={role.key}>
              <h4 className="text-xs font-medium uppercase tracking-wide text-stone-500">
                {role.plural} · {inRole.length}
              </h4>
              {inRole.length === 0 ? (
                <p className="text-stone-600">Nobody yet</p>
              ) : (
                <ul>
                  {inRole.map((s) => (
                    <Who key={s.id} signup={s} />
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
      {maybe.length > 0 && (
        <div>
          <h4 className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Maybe · {maybe.length}
          </h4>
          <ul className="flex flex-wrap gap-x-4">
            {maybe.map((s) => (
              <Who key={s.id} signup={s} withRole />
            ))}
          </ul>
        </div>
      )}
      {out.length > 0 && (
        <p className="text-stone-500">
          Can’t make it: {out.map((s) => s.member).join(', ')}
        </p>
      )}
    </div>
  )
}

function Answer({
  event,
  characters,
}: {
  event: GuildEvent
  characters: Array<Character>
}) {
  const router = useRouter()
  const { busy, error, run } = useAction()
  const mine = event.mine
  const [characterId, setCharacterId] = useState(
    mine?.characterId ?? characters.at(0)?.id,
  )
  const [role, setRole] = useState(mine?.role ?? 'damage')
  const [note, setNote] = useState(mine?.note ?? '')

  if (characters.length === 0)
    return (
      <p className="mt-3 border-t border-stone-800 pt-3 text-sm text-stone-400">
        To reply, first say which characters are yours on the{' '}
        <Link to="/roster" className="text-sky-300 hover:underline">
          Roster
        </Link>
        .
      </p>
    )

  const act = (fn: () => Promise<unknown>) =>
    run(async () => {
      await fn()
      await router.invalidate()
    })

  return (
    <div className="mt-3 border-t border-stone-800 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Character"
          value={characterId}
          onChange={(e) => setCharacterId(Number(e.target.value))}
        >
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.level} {className(c.classToken)})
            </option>
          ))}
        </Select>
        <Select
          aria-label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          {ROLES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </Select>
        <Input
          aria-label="Note"
          value={note}
          maxLength={200}
          placeholder="Note (optional)"
          onChange={(e) => setNote(e.target.value)}
          className="min-w-40 flex-1"
        />
        {REPLIES.map((reply) => (
          <Button
            key={reply.key}
            variant={mine?.reply === reply.key ? 'primary' : 'ghost'}
            aria-pressed={mine?.reply === reply.key}
            disabled={busy}
            onClick={() =>
              act(() =>
                respondToEvent({
                  data: {
                    id: event.id,
                    characterId,
                    reply: reply.key,
                    role,
                    note,
                  },
                }),
              )
            }
          >
            {reply.label}
          </Button>
        ))}
        {mine && (
          <Button
            variant="danger"
            disabled={busy}
            onClick={() =>
              act(() => withdrawFromEvent({ data: { id: event.id } }))
            }
          >
            Remove my reply
          </Button>
        )}
      </div>
      <p className={hint}>
        {mine
          ? 'Your reply is highlighted. Change the character, role or note and press a reply again to update it.'
          : 'Pick the character and role you would bring, then press a reply.'}
      </p>
      <ErrorText error={error} />
    </div>
  )
}
