import postgres from 'postgres';

const names = ['DATABASE_URL', 'ASTER_BOOTSTRAP_TOKEN', 'GROQ_API_KEY', 'GROQ_MODEL', 'GEOAPIFY_API_KEY', 'GOOGLE_MAPS_BROWSER_KEY', 'GOOGLE_MAPS_GEOCODING_KEY', 'GOOGLE_MAPS_ADDRESS_VALIDATION_KEY', 'GOOGLE_MAPS_ROUTES_KEY', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'APP_URL'];
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente.');
const sql = postgres(process.env.DATABASE_URL, { max: 1, max_pipeline: 1, prepare: false, ssl: 'require', connect_timeout: 15 });
try {
  await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(194782302)`;
    const available = await tx`SELECT to_regprocedure('vault.create_secret(text,text,text,uuid)') IS NOT NULL AS enabled`;
    if (!available[0]?.enabled) throw Object.assign(new Error('Vault indisponível'), { code: 'VAULT_UNAVAILABLE' });
    const access = await tx`SELECT has_table_privilege('anon', 'vault.decrypted_secrets', 'SELECT') OR has_table_privilege('authenticated', 'vault.decrypted_secrets', 'SELECT') AS exposed`;
    if (access[0]?.exposed) throw Object.assign(new Error('Vault público'), { code: 'VAULT_PUBLIC_ACCESS' });
    let count = 0;
    for (const name of names) {
      const value = process.env[name];
      if (!value) continue;
      const vaultName = `aster/${name}`;
      const existing = await tx`SELECT id FROM vault.secrets WHERE name = ${vaultName}`;
      if (existing.length) await tx`SELECT vault.update_secret(${existing[0].id}::uuid, ${value}, ${vaultName}, 'Aster: backup da configuração')`;
      else await tx`SELECT vault.create_secret(${value}, ${vaultName}, 'Aster: backup da configuração')`;
      const verified = await tx`SELECT decrypted_secret = ${value} AS matches FROM vault.decrypted_secrets WHERE name = ${vaultName}`;
      if (!verified[0]?.matches) throw Object.assign(new Error('Verificação falhou'), { code: 'VAULT_VERIFY_FAILED' });
      count++;
    }
    console.log(`${count} configurações salvas e verificadas no Supabase Vault. Valores não exibidos.`);
  });
} catch (error) {
  console.error('Backup não concluído:', error.code || error.name);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

