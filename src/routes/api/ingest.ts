import { timingSafeEqual } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'

import { config } from '#/server/config.server'
import { IngestRefused, ingest, summarize } from '#/server/ingest.server'

const same = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Where the sync script posts a snapshot: `Authorization: Bearer <token>`. */
export const Route = createFileRoute('/api/ingest')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const given = request.headers
          .get('authorization')
          ?.replace(/^Bearer /, '')
        const uploader =
          given && config.ingestTokens.find((t) => same(t.token, given))
        if (!uploader)
          return Response.json(
            { error: 'Unknown upload token' },
            { status: 401 },
          )

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Body is not JSON' }, { status: 400 })
        }
        try {
          const result = await ingest(body, uploader.name)
          return Response.json({ ...result, summary: summarize(result) })
        } catch (error) {
          if (error instanceof IngestRefused)
            return Response.json({ error: error.message }, { status: 422 })
          throw error
        }
      },
    },
  },
})
