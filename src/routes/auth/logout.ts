import { createFileRoute } from '@tanstack/react-router'

import { endSession } from '#/server/session.server'

export const Route = createFileRoute('/auth/logout')({
  server: {
    handlers: {
      GET: () => {
        endSession()
        return new Response(null, { status: 302, headers: { Location: '/' } })
      },
    },
  },
})
