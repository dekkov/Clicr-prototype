/**
 * Run migration SQL files against Supabase using the pg module.
 * Usage: node scripts/run-migrations.mjs
 *
 * Requires DATABASE_URL or will construct from SUPABASE project ref.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'apgussgbygxxnpvbssxs';

// Supabase database direct connection URL
// Password needs to be set - we'll use the pooler connection
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || `https://${PROJECT_REF}.supabase.co`;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
    // Try to read from .env.local
    try {
        const envContent = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf-8');
        const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);
        if (match) {
            process.env.SUPABASE_SERVICE_ROLE_KEY = match[1];
        }
    } catch (e) {
        console.error('Could not read .env.local');
    }
}

const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Migration files in order
const MIGRATION_FILES = [
    'migrations/001_schema.sql',
    'migrations/002_indexes.sql',
    'migrations/003_rpcs.sql',
    'migrations/004_rls.sql',
];

async function runSQL(sql, label) {
    console.log(`\n▶ Running: ${label}...`);

    const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        method: 'POST',
        headers: {
            'apikey': svcKey,
            'Authorization': `Bearer ${svcKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
        },
        body: JSON.stringify({}),
    });

    // The REST API can't run DDL. Let's use the SQL endpoint instead.
    // Supabase exposes a /pg endpoint for direct SQL execution
    const pgResponse = await fetch(`https://${PROJECT_REF}.supabase.co/pg/query`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${svcKey}`,
        },
        body: JSON.stringify({ query: sql }),
    });

    if (!pgResponse.ok) {
        const errText = await pgResponse.text();
        console.error(`  ✗ Failed: ${pgResponse.status} - ${errText}`);
        return false;
    }

    const result = await pgResponse.json();
    console.log(`  ✓ Success`);
    return true;
}

async function main() {
    console.log('CLICR V4 — Supabase Migration Runner');
    console.log('=====================================');
    console.log(`Project: ${PROJECT_REF}`);

    for (const file of MIGRATION_FILES) {
        const fullPath = resolve(__dirname, '..', file);
        const sql = readFileSync(fullPath, 'utf-8');
        const success = await runSQL(sql, file);
        if (!success) {
            console.error(`\n✗ Migration failed at ${file}. Stopping.`);
            process.exit(1);
        }
    }

    console.log('\n✓ All migrations complete!');
}

main().catch(console.error);
