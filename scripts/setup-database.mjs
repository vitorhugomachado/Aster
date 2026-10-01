import postgres from 'postgres';
import { readFile } from 'node:fs/promises';

if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL no .env.local.');
const sql = postgres(process.env.DATABASE_URL, { max: 1, max_pipeline: 1, prepare: false,
  ssl: 'require', connect_timeout: 15 });
try {
  const migration = await readFile(new URL('../supabase/migrations/202610010001_aster.sql', import.meta.url), 'utf8');
  await sql.begin(async (tx) => {
    await tx`SET LOCAL search_path TO public`;
    await tx`SELECT pg_advisory_xact_lock(194782301)`;
    await tx.unsafe(migration);
  });
  const rows = await sql`SELECT count(*)::int AS count FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'aster_%'`;
  console.log(`Supabase preparado: ${rows[0].count} tabelas Aster, migração aplicada.`);
} catch (error) {
  console.error('Não foi possível preparar o banco:', error.code || error.name);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

