import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'

import { Card, Input, Table } from '../components/ui'
import { gold, when } from '../lib/format'
import { getBank } from '../server/guild.functions'

export const Route = createFileRoute('/bank')({
  beforeLoad: ({ context }) => {
    if (!context.site.viewer) throw redirect({ to: '/' })
  },
  loader: () => getBank(),
  component: Bank,
})

function Bank() {
  const { tabs, copper } = Route.useLoaderData()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  if (tabs.length === 0)
    return (
      <Card title="Guild bank">
        <p className="text-stone-300">
          The bank has not been uploaded yet. It is captured when an officer
          with the addon opens each bank tab in game.
        </p>
      </Card>
    )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search the bank"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-64"
        />
        {copper !== null && (
          <span className="text-sm text-stone-400">
            Gold: <span className="text-amber-300">{gold(copper)}</span>
          </span>
        )}
      </div>
      {tabs.map((tab) => {
        // Stacks of the same item in a tab are shown as one row.
        const totals = new Map<number, { name: string; count: number }>()
        for (const item of tab.items) {
          if (q && !item.name.toLowerCase().includes(q)) continue
          const total = totals.get(item.itemId) ?? { name: item.name, count: 0 }
          total.count += item.count
          totals.set(item.itemId, total)
        }
        if (q && totals.size === 0) return null
        const rows = [...totals].sort((a, b) =>
          a[1].name.localeCompare(b[1].name),
        )
        return (
          <Card
            key={tab.index}
            title={tab.name}
            actions={
              <span className="text-xs text-stone-500">
                Seen {when(tab.scannedAt)}
              </span>
            }
          >
            {rows.length === 0 ? (
              <p className="text-sm text-stone-400">Empty.</p>
            ) : (
              <Table head={['Item', 'Count']}>
                {rows.map(([itemId, item]) => (
                  <tr key={itemId}>
                    <td className="px-2 py-1.5">{item.name}</td>
                    <td className="px-2 py-1.5 text-stone-300">{item.count}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        )
      })}
    </div>
  )
}
