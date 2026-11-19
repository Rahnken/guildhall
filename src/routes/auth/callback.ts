import { createFileRoute } from '@tanstack/react-router'
import { deleteCookie, getCookie } from '@tanstack/react-start/server'

import { signIn } from '#/server/discord.server'
import { startSession } from '#/server/session.server'

const redirectTo = (location: string) =>
  new Response(null, { status: 302, headers: { Location: location } })

export const Route = createFileRoute('/auth/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        const expected = getCookie('guildhall_oauth')
        deleteCookie('guildhall_oauth', { path: '/auth' })
        if (!code || !state || state !== expected)
          return redirectTo('/?error=failed')

        const result = await signIn(code)
        if (!result.ok) return redirectTo(`/?error=${result.reason}`)
        startSession(result.viewer)
        return redirectTo('/')
      },
    },
  },
})
