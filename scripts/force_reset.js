/**
 * Reset occupancy counts via Supabase.
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(url, key);

async function reset() {
    const { data: areas, error: areasErr } = await supabase.from('areas').select('id, current_occupancy, venue_id');
    if (areasErr) {
        console.error('Failed to fetch areas:', areasErr);
        process.exit(1);
    }

    for (const a of areas || []) {
        if (a.current_occupancy !== 0) {
            await supabase.from('areas')
                .update({ current_occupancy: 0, last_reset_at: new Date().toISOString() })
                .eq('id', a.id);
        }
    }

    console.log(`Reset ${(areas || []).length} areas. Counts zeroed.`);
}

reset().catch(e => {
    console.error(e);
    process.exit(1);
});
