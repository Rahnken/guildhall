import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'

import emblem from '../data/emblem.json'
import { themeCss } from '../lib/theme'
import { getSite } from '../server/guild.functions'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  // Runs on every navigation, so pages can rely on context.site.viewer.
  beforeLoad: async () => ({ site: await getSite() }),
  head: ({ match }) => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: match.context.site.name },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' },
    ],
  }),
  component: RootComponent,
  notFoundComponent: () => (
    <p className="p-8 text-stone-400">Page not found.</p>
  ),
})

const link = 'rounded px-3 py-1.5 text-sm text-stone-300 hover:bg-stone-800'
const activeLink = { className: `${link} bg-stone-800 !text-sky-300` }

function RootComponent() {
  const { site } = Route.useRouteContext()
  const viewer = site.viewer

  return (
    <RootDocument theme={themeCss(site.colors)}>
      <header className="border-b border-t-4 border-stone-800 border-t-(--tabard-background) bg-stone-950/80">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-3">
          <Link
            to="/"
            className="mr-4 flex items-center gap-2 font-semibold tracking-wide text-sky-300"
          >
            {/* The guild tabard's emblem once `npm run emblem:build` has made one. */}
            <img src={emblem.file || '/logo.svg'} alt="" className="size-7" />
            {site.name}
          </Link>
          {viewer && (
            <>
              <Link to="/roster" className={link} activeProps={activeLink}>
                Roster
              </Link>
              <Link to="/crafting" className={link} activeProps={activeLink}>
                Crafting
              </Link>
              <Link to="/requests" className={link} activeProps={activeLink}>
                Requests
              </Link>
              <Link to="/bank" className={link} activeProps={activeLink}>
                Bank
              </Link>
              {viewer.officer && (
                <>
                  <Link to="/sync" className={link} activeProps={activeLink}>
                    Sync
                  </Link>
                  <Link
                    to="/settings"
                    className={link}
                    activeProps={activeLink}
                  >
                    Settings
                  </Link>
                </>
              )}
            </>
          )}
          <span className="ml-auto flex items-center gap-3 text-sm">
            {viewer ? (
              <>
                <span className="text-stone-400">{viewer.name}</span>
                <a href="/auth/logout" className={link}>
                  Sign out
                </a>
              </>
            ) : (
              <a href="/auth/discord" className={link}>
                Member sign in
              </a>
            )}
          </span>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </RootDocument>
  )
}

function RootDocument({
  children,
  theme,
}: Readonly<{
  children: ReactNode
  /** Replaces the site's colours with the guild tabard's; "" for none. */
  theme: string
}>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-stone-900 text-stone-100 antialiased">
        {/* In the body so it comes after the stylesheet it overrides. Only
            ever "#rrggbb" values the server has checked. */}
        {theme && <style dangerouslySetInnerHTML={{ __html: theme }} />}
        {children}
        <Scripts />
      </body>
    </html>
  )
}
