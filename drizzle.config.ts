import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Don't drop the existing app_data table during the relational migration —
  // it remains the source of truth until Phase 1 backfills the new tables.
  tablesFilter: ['!app_data', '!api_keys'],
} satisfies Config;
