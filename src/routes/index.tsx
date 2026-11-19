import { Link, createFileRoute } from '@tanstack/react-router'

import { Card } from '../components/ui'
import { classColor, className, when } from '../lib/format'
import { getOverview } from '../server/guild.functions'

const ERRORS: Record<string, string> = {
  'not-member':
    'That Discord account is not a member of the guild’s server yet. Ask to join first.',
  failed: 'Discord sign-in did not complete. Try again.',
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { error?: string } => ({
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  // Visitors get the public page; members also get the guild overview.
  loader: async ({ context }) =>
    context.site.viewer ? await getOverview() : null,
  component: Home,
})

function Home() {
  const { site } = Route.useRouteContext()
  const overview = Route.useLoaderData()
  const { error } = Route.useSearch()

  if (!overview)
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <img src="/logo.svg" alt="" className="mx-auto mb-6 size-20" />
        <h1 className="text-4xl font-semibold text-stone-50">{site.name}</h1>
        {site.description && (
          <p className="mt-4 text-lg whitespace-pre-line text-stone-300">
            {site.description}
          </p>
        )}
        {error && (
          <p className="mt-6 rounded border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-200">
            {ERRORS[error] ?? ERRORS.failed}
          </p>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {site.inviteUrl && (
            <a
              href={site.inviteUrl}
              className="rounded bg-sky-500 px-5 py-2.5 font-medium text-stone-950 hover:bg-sky-400"
            >
              Request to join
            </a>
          )}
          <a
            href="/auth/discord"
            className="rounded border border-stone-700 px-5 py-2.5 font-medium text-stone-200 hover:bg-stone-800"
          >
            Member sign in
          </a>
        </div>
      </div>
    )

  if (overview.members === 0)
    return (
      <Card title="Nothing here yet">
        <p className="text-stone-300">
          No roster has been uploaded.{' '}
          {site.viewer?.officer ? (
            <>
              Upload one from the{' '}
              <Link to="/sync" className="text-sky-300 underline">
                Sync page
              </Link>
              .
            </>
          ) : (
            'An officer needs to sync the guild addon first.'
          )}
        </p>
      </Card>
    )

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card title="Guild">
        <p className="text-3xl font-semibold">{overview.members}</p>
        <p className="text-sm text-stone-400">
          members{overview.realm ? ` on ${overview.realm}` : ''}
        </p>
        <p className="mt-3 text-xs text-stone-500">
          Roster updated {when(overview.rosterAt)}
        </p>
      </Card>
      <Card title="Classes">
        <ul className="space-y-1 text-sm">
          {overview.classes.map((c) => (
            <li key={c.classToken} className="flex justify-between">
              <span style={{ color: classColor(c.classToken) }}>
                {className(c.classToken)}
              </span>
              <span className="text-stone-400">{c.count}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Highest level">
        <ol className="space-y-1 text-sm">
          {overview.top.map((c) => (
            <li key={c.name} className="flex justify-between">
              <span style={{ color: classColor(c.classToken) }}>{c.name}</span>
              <span className="text-stone-400">{c.level}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}
