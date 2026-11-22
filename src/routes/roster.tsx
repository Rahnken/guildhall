import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

import {
  Card,
  ErrorText,
  Input,
  Select,
  Table,
  useAction,
} from '../components/ui'
import {
  ONLINE_FRESH_MINUTES,
  ago,
  classColor,
  className,
  lastSeen,
  minutesSince,
  when,
} from '../lib/format'
import {
  claimCharacter,
  getRoster,
  releaseCharacter,
  setMain,
} from '../server/guild.functions'

export const Route = createFileRoute('/roster')({
  beforeLoad: ({ context }) => {
    if (!context.site.viewer) throw redirect({ to: '/' })
  },
  loader: () => getRoster(),
  component: Roster,
})

type Sort = 'rank' | 'level' | 'name' | 'seen'

function Roster() {
  const { characters, rosterAt, officer, now: loadedAt } = Route.useLoaderData()
  const router = useRouter()
  const { busy, error, run } = useAction()
  const act =
    (change: (input: { data: { id: number } }) => Promise<void>) =>
    (id: number) =>
      run(async () => {
        await change({ data: { id } })
        await router.invalidate()
      })
  const claim = act(claimCharacter)
  const release = act(releaseCharacter)
  const makeMain = act(setMain)
  const [mineOnly, setMineOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [classToken, setClassToken] = useState('')
  const [sort, setSort] = useState<Sort>('rank')
  const [onlineOnly, setOnlineOnly] = useState(false)

  // Starts on the server's clock so the first render matches, then follows
  // this browser's. Each minute it also asks the server for a newer roster.
  const [now, setNow] = useState(() => new Date(loadedAt).getTime())
  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => {
      setNow(Date.now())
      if (document.visibilityState === 'visible') void router.invalidate()
    }, 60_000)
    return () => clearInterval(timer)
  }, [router])

  // "Online" is a snapshot from the last upload: current only while recent.
  const age = minutesSince(rosterAt, now)
  const fresh = age !== null && age < ONLINE_FRESH_MINUTES
  const onlineCount = characters.filter((c) => c.online).length
  const filterOnline = onlineOnly && fresh

  const classes = useMemo(
    () => [...new Set(characters.map((c) => c.classToken))].sort(),
    [characters],
  )

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = characters.filter(
      (c) =>
        (!filterOnline || c.online) &&
        (!mineOnly || c.mine) &&
        (!classToken || c.classToken === classToken) &&
        (!q ||
          c.name.toLowerCase().includes(q) ||
          c.zone.toLowerCase().includes(q) ||
          (c.player ?? '').toLowerCase().includes(q) ||
          (c.altOf ?? '').toLowerCase().includes(q) ||
          c.note.toLowerCase().includes(q)),
    )
    // The server sends rank order; the others re-sort a copy.
    if (sort === 'level') list.sort((a, b) => b.level - a.level)
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name))
    if (sort === 'seen')
      list.sort(
        (a, b) =>
          (a.online ? -1 : (a.lastOnlineHours ?? Infinity)) -
          (b.online ? -1 : (b.lastOnlineHours ?? Infinity)),
      )
    return list
  }, [characters, query, classToken, sort, filterOnline, mineOnly])

  return (
    <Card
      title={`Roster: ${shown.length} of ${characters.length}`}
      actions={
        <span className="text-xs text-stone-500">Updated {when(rosterAt)}</span>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <Input
          placeholder="Search name, player, zone or note"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-64"
        />
        <Select
          value={classToken}
          onChange={(e) => setClassToken(e.target.value)}
          aria-label="Class"
        >
          <option value="">All classes</option>
          {classes.map((token) => (
            <option key={token} value={token}>
              {className(token)}
            </option>
          ))}
        </Select>
        <Select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort by"
        >
          <option value="rank">Sort by rank</option>
          <option value="level">Sort by level</option>
          <option value="name">Sort by name</option>
          <option value="seen">Sort by last seen</option>
        </Select>
        <label
          className={`flex items-center gap-2 text-sm ${fresh ? 'text-stone-200' : 'text-stone-500'}`}
        >
          <input
            type="checkbox"
            checked={filterOnline}
            disabled={!fresh}
            onChange={(e) => setOnlineOnly(e.target.checked)}
            className="size-4 accent-sky-500"
          />
          Online only{fresh ? ` (${onlineCount})` : ''}
        </label>
        <label className="flex items-center gap-2 text-sm text-stone-200">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(e) => setMineOnly(e.target.checked)}
            className="size-4 accent-sky-500"
          />
          Mine
        </label>
      </div>
      {age !== null && (
        <p className="mb-3 text-xs text-stone-500">
          {fresh
            ? `Online status as of ${ago(age)}.`
            : `Online status is from ${ago(age)}, too old to filter by. It refreshes when someone with the addon types /reload.`}
        </p>
      )}
      <ErrorText error={error} />
      <Table
        head={[
          'Name',
          'Player',
          'Level',
          'Class',
          'Rank',
          'Zone',
          'Last seen',
          'Note',
        ]}
      >
        {shown.map((c) => (
          <tr key={c.id}>
            <td
              className="px-2 py-1.5 font-medium"
              style={{ color: classColor(c.classToken) }}
            >
              {c.name}
            </td>
            <td className="px-2 py-1.5 whitespace-nowrap">
              {c.player === null ? (
                <RowAction disabled={busy} onClick={() => claim(c.id)}>
                  This is mine
                </RowAction>
              ) : (
                <>
                  <span className="text-stone-200">{c.player}</span>
                  <span className="ml-1.5 text-xs text-stone-500">
                    {c.main ? 'main' : c.altOf ? `alt of ${c.altOf}` : ''}
                  </span>
                  {c.mine && !c.main && (
                    <RowAction disabled={busy} onClick={() => makeMain(c.id)}>
                      Make main
                    </RowAction>
                  )}
                  {(c.mine || officer) && (
                    <RowAction disabled={busy} onClick={() => release(c.id)}>
                      {c.mine ? 'Not mine' : 'Remove claim'}
                    </RowAction>
                  )}
                </>
              )}
            </td>
            <td className="px-2 py-1.5">{c.level}</td>
            <td className="px-2 py-1.5 text-stone-300">
              {className(c.classToken)}
            </td>
            <td className="px-2 py-1.5 text-stone-300">{c.rank}</td>
            <td className="px-2 py-1.5 text-stone-400">{c.zone}</td>
            <td
              className={`px-2 py-1.5 ${c.online && fresh ? 'text-emerald-400' : 'text-stone-400'}`}
            >
              {c.online && !fresh && age !== null
                ? `online ${ago(age)}`
                : lastSeen(c.online, c.lastOnlineHours)}
            </td>
            <td className="px-2 py-1.5 text-stone-400">{c.note}</td>
          </tr>
        ))}
      </Table>
      {shown.length === 0 && (
        <p className="mt-3 text-sm text-stone-400">
          {characters.length === 0
            ? 'No roster has been uploaded yet.'
            : 'Nobody matches that.'}
        </p>
      )}
    </Card>
  )
}

function RowAction(props: {
  disabled: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      {...props}
      className="ml-2 text-xs text-sky-400 first:ml-0 hover:underline disabled:opacity-50"
    />
  )
}
