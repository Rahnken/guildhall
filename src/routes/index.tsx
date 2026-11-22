import { Link, createFileRoute } from '@tanstack/react-router'

import { Card } from '../components/ui'
import emblem from '../data/emblem.json'
import { ago, classColor, className, minutesSince, when } from '../lib/format'
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
              className="rounded bg-sky-500 px-5 py-2.5 font-medium text-(--on-sky) hover:bg-sky-400"
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

  const age = minutesSince(overview.rosterAt, overview.now)
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* No card title: the guild's name is the heading. */}
      <Card className="md:col-span-3">
        <div className="flex items-center gap-6 px-2 py-1">
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-semibold text-stone-50">{site.name}</p>
            <p className="mt-1 text-sm text-stone-400">
              <span className="text-lg font-semibold text-stone-100">
                {overview.members}
              </span>{' '}
              members{overview.realm ? ` on ${overview.realm}` : ''}
            </p>
            {site.description && (
              <p className="mt-3 max-w-prose whitespace-pre-line text-sm text-stone-300">
                {site.description}
              </p>
            )}
            <p className="mt-3 text-xs text-stone-500">
              Roster updated {when(overview.rosterAt)}
            </p>
          </div>
          {/* The guild's tabard, once `npm run emblem:build` has drawn it. */}
          {emblem.tabard && (
            <img
              src={emblem.tabard}
              alt="The guild tabard"
              width={90}
              height={110}
              className="mr-2 shrink-0 drop-shadow-lg"
            />
          )}
        </div>
      </Card>
      {/* As tall as the row its neighbours make, however many are online:
          on wide screens the card is laid over this box and its list
          scrolls; on a phone it is simply capped. */}
      <div className="relative md:min-h-80">
        <Card
          title="Online"
          className="flex max-h-[28rem] flex-col md:absolute md:inset-0 md:max-h-none"
        >
          <p className="text-3xl font-semibold">{overview.online.length}</p>
          <p className="text-sm text-stone-400">
            online when the roster was saved
            {age !== null && `, ${ago(age)}`}
          </p>
          {overview.online.length > 0 && (
            <ul className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 text-sm [scrollbar-color:var(--color-stone-600)_transparent]">
              {overview.online.map((c) => (
                <li key={c.name} className="flex justify-between">
                  <span style={{ color: classColor(c.classToken) }}>
                    {c.name}
                  </span>
                  <span className="text-stone-400">{c.level}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="space-y-4">
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
                <span style={{ color: classColor(c.classToken) }}>
                  {c.name}
                </span>
                <span className="text-stone-400">{c.level}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
      <Card
        title="Open requests"
        actions={
          <Link to="/requests" className="text-xs text-sky-300 hover:underline">
            See all
          </Link>
        }
      >
        <p className="text-3xl font-semibold">{overview.openRequests}</p>
        <p className="text-sm text-stone-400">
          waiting for someone to make{' '}
          {overview.openRequests === 1 ? 'it' : 'them'}
        </p>
        {overview.requests.length > 0 && (
          <ul className="mt-3 space-y-2 text-sm">
            {overview.requests.map((request) => (
              <li key={request.id} className="flex items-center gap-2">
                {request.icon ? (
                  <img
                    src={`/icons/${request.icon}.webp`}
                    alt=""
                    width={24}
                    height={24}
                    loading="lazy"
                    className="shrink-0 rounded border border-stone-700 bg-stone-900"
                  />
                ) : (
                  <span className="size-6 shrink-0 rounded border border-stone-700 bg-stone-900" />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-stone-100">
                    {request.quantity > 1 && `${request.quantity}× `}
                    {request.name}
                  </span>
                  <span className="block truncate text-xs text-stone-400">
                    {request.profession} · for {request.requester}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {overview.openRequests > overview.requests.length && (
          <p className="mt-2 text-xs text-stone-500">
            and {overview.openRequests - overview.requests.length} more
          </p>
        )}
      </Card>
    </div>
  )
}
