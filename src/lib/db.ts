import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const SCHEMA_VERSION = 'v2-user-model'

function createClient() {
  const url = process.env.DATABASE_URL || 'file:db/portfolio.db'
  const adapter = new PrismaBetterSqlite3({ url })
  
  return new PrismaClient({ adapter })
}

export const db =
  (globalForPrisma as Record<string, unknown>)[`prisma_${SCHEMA_VERSION}`] as PrismaClient | undefined ??
  createClient()

if (process.env.NODE_ENV !== 'production') {
  (globalForPrisma as Record<string, unknown>)[`prisma_${SCHEMA_VERSION}`] = db
}