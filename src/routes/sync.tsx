import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { Card, ErrorText, Table, useAction } from '../components/ui'
import { when } from '../lib/format'
import { describe, snapshotsFromSavedVariables } from '../lib/snapshot'
import { getSyncLog, uploadSnapshot } from '../server/guild.functions'

export const Route = createFileRoute('/sync')({
  beforeLoad: ({ context }) => {
    if (!context.site.viewer?.officer) throw redirect({ to: '/' })
  },
  loader: () => getSyncLog(),
  component: Sync,
})

function Sync() {
  const log = Route.useLoaderData()
  const router = useRouter()
  const { busy, error, run, setError } = useAction()
  const [results, setResults] = useState<Array<string>>([])

  // The file is read in the browser; only the guild data in it is sent.
  const upload = (file: File) =>
    run(async () => {
      setResults([])
      const snapshots = snapshotsFromSavedVariables(await file.text())
      if (snapshots.length === 0) {
        setError(
          'No guild data in that file. Log in with the addon enabled, open the guild roster, then /reload.',
        )
        return
      }
      const lines = []
      for (const snapshot of snapshots) {
        const result = await uploadSnapshot({ data: snapshot })
        lines.push(`${describe(snapshot)}. ${result.summary}`)
      }
      setResults(lines)
      await router.invalidate()
    })

  return (
    <div className="space-y-4">
      <Card title="Upload from the addon">
        <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-stone-300">
          <li>
            In game, with the Guildhall addon on: open the guild roster, and
            each guild bank tab you want updated.
          </li>
          <li>
            Type <code className="text-sky-300">/reload</code> (or log out) so
            the game saves the addon’s data.
          </li>
          <li>
            Choose{' '}
            <code className="text-sky-300">
              WTF/Account/&lt;account&gt;/SavedVariables/Guildhall.lua
            </code>{' '}
            from your game folder.
          </li>
        </ol>
        <input
          type="file"
          accept=".lua"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void upload(file)
            e.target.value = ''
          }}
          className="text-sm text-stone-300 file:mr-3 file:rounded file:border-0 file:bg-sky-500 file:px-3 file:py-1.5 file:font-medium file:text-(--on-sky)"
        />
        {busy && <p className="mt-2 text-sm text-stone-400">Uploading…</p>}
        {results.map((line) => (
          <p key={line} className="mt-2 text-sm text-emerald-300">
            {line}
          </p>
        ))}
        <ErrorText error={error} />
      </Card>
      <Card title="Recent uploads">
        {log.length === 0 ? (
          <p className="text-sm text-stone-400">None yet.</p>
        ) : (
          <Table head={['When', 'By', 'Result']}>
            {log.map((entry) => (
              <tr key={entry.id}>
                <td className="px-2 py-1.5 text-stone-300">
                  {when(entry.receivedAt)}
                </td>
                <td className="px-2 py-1.5 text-stone-300">
                  {entry.uploadedBy}
                </td>
                <td className="px-2 py-1.5 text-stone-400">{entry.summary}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  )
}
