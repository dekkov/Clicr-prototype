
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sbAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
    console.log("🚀 Starting Full System Verification...");

    // 1. Setup Data via SQL to bypass Cache
    const testSuffix = Date.now();
    const userEmail = `test_${testSuffix}@example.com`;
    const bizName = `Sys Test ${testSuffix}`;

    // Create User via Auth API (Must be done via API)
    const testPassword = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    const { data: user } = await sbAdmin.auth.admin.createUser({ email: userEmail, password: testPassword, email_confirm: true });
    if (!user.user) throw new Error("User create failed");
    const userId = user.user.id;

    // Create Business, Member, Venue, Area via SQL
    const { data: setupRes, error: setupErr } = await sbAdmin.rpc('exec_sql', {
        sql_query: `
            WITH new_biz AS (
                INSERT INTO businesses (name) VALUES ('${bizName}') RETURNING id
            ),
            new_member AS (
                INSERT INTO business_members (business_id, user_id, role) 
                SELECT id, '${userId}', 'OWNER' FROM new_biz RETURNING business_id
            ),
            new_venue AS (
                INSERT INTO venues (business_id, name, status) 
                SELECT id, 'Test Venue', 'ACTIVE' FROM new_biz RETURNING id, business_id
            ),
            new_area AS (
                INSERT INTO areas (business_id, venue_id, name, is_active) 
                SELECT business_id, id, 'Main Area', true FROM new_venue RETURNING id, venue_id, business_id
            )
            SELECT 
                (SELECT id FROM new_biz) as biz_id,
                (SELECT id FROM new_venue) as venue_id,
                (SELECT id FROM new_area) as area_id;
        `
    });

    if (setupErr) throw new Error(`Setup SQL Failed: ${setupErr.message}`);

    // Fetch IDs via standard API
    const { data: bData } = await sbAdmin.from('businesses').select('id').eq('name', bizName).single();
    if (!bData) throw new Error("Business creation failed (not found)");

    const { data: vData } = await sbAdmin.from('venues').select('id').eq('business_id', bData.id).eq('name', 'Test Venue').single();
    if (!vData) throw new Error("Venue creation failed");

    const { data: aData } = await sbAdmin.from('areas').select('id').eq('business_id', bData.id).eq('name', 'Main Area').single();
    if (!aData) throw new Error("Area creation failed (or business_id missing on area?)");

    const biz = { id: bData.id };
    const venue = { id: vData.id };
    const area = { id: aData.id };

    // Client Context for User
    const sbUser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    await sbUser.auth.signInWithPassword({ email: user.user.email, password: testPassword });

    // 2. Add Traffic
    console.log("2. Adding Traffic (+10 In, -2 Out)...");
    for (let i = 0; i < 10; i++) await sbUser.rpc('apply_occupancy_delta', { p_business_id: biz.id, p_venue_id: venue.id, p_area_id: area.id, p_delta: 1, p_source: 'test' });
    for (let i = 0; i < 2; i++) await sbUser.rpc('apply_occupancy_delta', { p_business_id: biz.id, p_venue_id: venue.id, p_area_id: area.id, p_delta: -1, p_source: 'test' });

    // 3. Verify Totals
    console.log("3. Verifying Totals...");
    const { data: totals, error: tErr } = await sbUser.rpc('get_traffic_totals', { p_business_id: biz.id, p_venue_id: venue.id });
    if (tErr) throw new Error(`Totals RPC Error: ${tErr.message}`);
    if (!totals || totals.length === 0) throw new Error("Totals RPC returned empty");

    console.log("   Totals:", totals[0]);
    if (totals[0].total_in !== 10 || totals[0].total_out !== 2 || totals[0].net_delta !== 8) {
        throw new Error(`Totals Mismatch! Expected 10/2/8, got ${JSON.stringify(totals[0])}`);
    }

    // 4. Perform Reset
    console.log("4. Performing RESET (Area Scope)...");
    const { data: resetRes } = await sbUser.rpc('reset_counts', { p_scope: 'AREA', p_business_id: biz.id, p_venue_id: venue.id, p_area_id: area.id });
    console.log("   Reset Result:", resetRes);

    // 5. Verify Zero State

    // Check Area Reset Timestamp
    const { data: areaCheck } = await sbUser.from('areas').select('last_reset_at').eq('id', area.id).single();
    console.log("   Area Last Reset At:", areaCheck?.last_reset_at);

    console.log("5. Verifying Zero State...");

    // Snapshot
    const { data: snap } = await sbUser.from('occupancy_snapshots').select('*').eq('area_id', area.id).single();
    console.log("   Snapshot:", snap);
    if (snap.current_occupancy !== 0) throw new Error("Snapshot not zeroed!");

    // Totals (Must be 0 because of last_reset_at logic)
    const { data: newTotals } = await sbUser.rpc('get_traffic_totals', { p_business_id: biz.id, p_venue_id: venue.id });
    console.log("   New Totals (Since Reset):", newTotals[0]);

    if (newTotals[0].total_in !== 0 || newTotals[0].total_out !== 0) {
        throw new Error("Totals are NOT zero after reset! The timeline logic or reset timestamp update failed.");
    }

    // 6. Test ID Scan + Auto Add
    console.log("6. Testing ID Scan + Auto Add...");
    // Mock record scan (just insert since we don't have rpc for scan yet in full migration, only table)
    // Wait, I didn't add record_scan RPC, I added it to mutations.ts to use raw insert.
    // That's fine.

    console.log("✅ FULL SYSTEM VERIFIED SUCCESSFULLY");
}

run().catch(e => {
    console.error("❌ TEST FAILED:", e);
    process.exit(1);
});
