import { createFileRoute } from '@tanstack/react-router'

import { prisma } from '#/db'

/** Fly's health check: the server is up and the database file opens. */
export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        await prisma.guild.count()
        return Response.json({ ok: true })
      },
    },
  },
})
