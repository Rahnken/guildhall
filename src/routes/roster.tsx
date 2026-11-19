import { createFileRoute, redirect } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { Card, Input, Select, Table } from '../components/ui'
import { classColor, className, lastSeen, when } from '../lib/format'
import { getRoster } from '../server/guild.functions'

export const Route = createFileRoute('/roster')({
  beforeLoad: ({ context }) => {
    if (!context.site.viewer) throw redirect({ to: '/' })
  },
  loader: () => getRoster(),
  component: Roster,
})

type Sort = 'rank' | 'level' | 'name' | 'seen'

function Roster() {
  const { characters, rosterAt } = Route.useLoaderData()
  const [query, setQuery] = useState('')
  const [classToken, setClassToken] = useState('')
  const [sort, setSort] = useState<Sort>('rank')

  const classes = useMemo(
    () => [...new Set(characters.map((c) => c.classToken))].sort(),
    [characters],
  )

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = characters.filter(
      (c) =>
        (!classToken || c.classToken === classToken) &&
        (!q ||
          c.name.toLowerCase().includes(q) ||
          c.zone.toLowerCase().includes(q) ||
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
  }, [characters, query, classToken, sort])

  return (
    <Card
      title={`Roster: ${shown.length} of ${characters.length}`}
      actions={
        <span className="text-xs text-stone-500">Updated {when(rosterAt)}</span>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <Input
          placeholder="Search name, zone or note"
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
      </div>
      <Table
        head={['Name', 'Level', 'Class', 'Rank', 'Zone', 'Last seen', 'Note']}
      >
        {shown.map((c) => (
          <tr key={c.id}>
            <td
              className="px-2 py-1.5 font-medium"
              style={{ color: classColor(c.classToken) }}
            >
              {c.name}
            </td>
            <td className="px-2 py-1.5">{c.level}</td>
            <td className="px-2 py-1.5 text-stone-300">
              {className(c.classToken)}
            </td>
            <td className="px-2 py-1.5 text-stone-300">{c.rank}</td>
            <td className="px-2 py-1.5 text-stone-400">{c.zone}</td>
            <td
              className={`px-2 py-1.5 ${c.online ? 'text-emerald-400' : 'text-stone-400'}`}
            >
              {lastSeen(c.online, c.lastOnlineHours)}
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
