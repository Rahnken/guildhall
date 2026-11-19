import { randomBytes } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { setCookie } from '@tanstack/react-start/server'

import { config } from '#/server/config.server'
import { authorizeUrl } from '#/server/discord.server'
import { startSession } from '#/server/session.server'

const redirectTo = (location: string) =>
  new Response(null, { status: 302, headers: { Location: location } })

export const Route = createFileRoute('/auth/discord')({
  server: {
    handlers: {
      GET: () => {
        if (config.devLogin) {
          startSession({ id: 'dev', name: 'Dev officer', officer: true })
          return redirectTo('/')
        }
        // Sent to Discord and checked on the way back, so a sign-in can only
        // finish in the browser that started it.
        const state = randomBytes(16).toString('hex')
        setCookie('guildhall_oauth', state, {
          httpOnly: true,
          sameSite: 'lax',
          secure: config.publicUrl.startsWith('https://'),
          path: '/auth',
          maxAge: 600,
        })
        return redirectTo(authorizeUrl(state))
      },
    },
  },
})
