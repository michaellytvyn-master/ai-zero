import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { databaseConfig } from '../config'
import * as schema from './schema'

type Database = ReturnType<typeof drizzle<typeof schema>>

// Next.js recreates modules on every hot reload; without this each edit would
// leak a fresh connection pool.
const globalForDb = globalThis as unknown as { zcaPool?: Pool; zcaDb?: Database }

export function db(): Database {
  if (globalForDb.zcaDb === undefined) {
    globalForDb.zcaPool ??= new Pool({ connectionString: databaseConfig().DATABASE_URL, max: 5 })
    globalForDb.zcaDb = drizzle(globalForDb.zcaPool, { schema })
  }
  return globalForDb.zcaDb
}

export { schema }
