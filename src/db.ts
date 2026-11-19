import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

import { Prisma, PrismaClient } from './generated/prisma/client.js'

// The client is cached across hot reloads in development. The schema's models
// and columns are kept with it so a client generated before a schema change
// isn't reused.
const schema = JSON.stringify(
  Object.entries(Prisma).filter(([name]) => name.endsWith('ScalarFieldEnum')),
)

declare global {
  var __prisma: { client: PrismaClient; schema: string } | undefined
}

function connect() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required')
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) })
}

const cached =
  globalThis.__prisma?.schema === schema ? globalThis.__prisma.client : null

export const prisma = cached ?? connect()

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = { client: prisma, schema }
}
