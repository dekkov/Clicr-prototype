
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Must use service key to create user/biz bypass RLS setup

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase credentials in .env.local");
    process.exit(1);
}

const sbAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function runTest() {
    console.log("🧪 STARTING NUCLEAR CORE LOGIC TEST...");

    // 1. Setup Test Data
    const testId = Math.random().toString(36).substring(7);
    const email = `test_nuclear_${testId}@example.com`;
    const password = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);

    // Create User (Auth)
    const { data: authUser, error: authError } = await sbAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true
    });
    if (authError) throw authError;
    const userId = authUser.user.id;
    console.log(`✅ Created Test User: ${userId}`);

    // Create Business
    const { data: biz, error: bizError } = await sbAdmin
        .from('businesses')
        .insert({ name: `Nuclear Test Biz ${testId}` })
        .select()
        .single();
    if (bizError) throw bizError;
    const businessId = biz.id;
    console.log(`✅ Created Business: ${businessId}`);

    // Add Member (Required for RLS)
    const { error: memberError } = await sbAdmin
        .from('business_members')
        .insert({ business_id: businessId, user_id: userId, role: 'OWNER' });
    if (memberError) throw memberError;
    console.log(`✅ Added Member to Business`);

    // Create Venue & Area
    const { data: venue, error: venueError } = await sbAdmin
        .from('venues')
        .insert({ business_id: businessId, name: 'Test Venue', address: '123 Test St' })
        .select()
        .single();
    if (venueError) throw venueError;

    const { data: area, error: areaError } = await sbAdmin
        .from('areas')
        .insert({ venue_id: venue.id, name: 'Test Area', capacity: 100 })
        .select()
        .single();
    if (areaError) throw areaError;

    console.log(`✅ Created Venue/Area: ${venue.id} / ${area.id}`);

    // 2. Test Atomic Increment (RPC: apply_occupancy_delta) (SIMULATE USER CLIENT via RLS)
    // We need a client authenticated as the user to test RLS properly
    const { data: signInData } = await sbAdmin.auth.signInWithPassword({ email, password });
    // Actually, simple way is create client with access token, but here we can use sbAdmin for RPC calls IF we impersonate or if RPC handles it.
    // Our RPC uses `auth.uid()`, so we MUST use an authenticated client.

    // Create Auth Client
    const sbUser = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        global: { headers: { Authorization: `Bearer ${signInData.session?.access_token}` } }
    });

    console.log("\n🔄 Testing Standard Increment (+10)...");
    const { data: incData, error: incError } = await sbUser.rpc('apply_occupancy_delta', {
        p_business_id: businessId,
        p_venue_id: venue.id,
        p_area_id: area.id,
        p_delta: 10,
        p_source: 'test_script'
    });

    if (incError) throw new Error(`Increment Failed: ${incError.message}`);
    const newOcc = incData[0].new_occupancy;
    if (newOcc !== 10) throw new Error(`Expected 10 occupancy, got ${newOcc}`);
    console.log(`✅ Increment Success. New Occupancy: ${newOcc}`);


    // 3. Test Totals (RPC: get_traffic_totals)
    console.log("\n🔄 Testing Traffic Totals...");
    const { data: totals, error: totalsError } = await sbUser.rpc('get_traffic_totals', {
        p_business_id: businessId,
        p_venue_id: venue.id
    });
    if (totalsError) throw new Error(`Totals Failed: ${totalsError.message}`);
    const t = totals[0];
    if (t.total_in !== 10 || t.net_delta !== 10 || t.event_count !== 1) {
        throw new Error(`Totals Mismatch: ${JSON.stringify(t)}`);
    }
    console.log(`✅ Totals Verified: IN=${t.total_in} OUT=${t.total_out} NET=${t.net_delta}`);

    // 4. Test Decrement
    console.log("\n🔄 Testing Decrement (-5)...");
    await sbUser.rpc('apply_occupancy_delta', {
        p_business_id: businessId,
        p_venue_id: venue.id,
        p_area_id: area.id,
        p_delta: -5,
        p_source: 'test_script'
    });

    // Check Snapshot
    const { data: snap } = await sbUser.from('occupancy_snapshots').select('current_occupancy').eq('area_id', area.id).single();
    if (snap?.current_occupancy !== 5) throw new Error(`Snapshot Mismatch: expected 5, got ${snap?.current_occupancy}`);
    console.log(`✅ Decrement Snapshot Verified: ${snap.current_occupancy}`);

    // Check Totals Again
    const { data: totals2 } = await sbUser.rpc('get_traffic_totals', { p_business_id: businessId });
    const t2 = totals2[0];
    // IN=10, OUT=5, NET=5, Count=2
    if (t2.total_in !== 10 || t2.total_out !== 5 || t2.net_delta !== 5) {
        throw new Error(`Totals2 Mismatch: ${JSON.stringify(t2)}`);
    }
    console.log(`✅ Totals2 Verified: IN=${t2.total_in} OUT=${t2.total_out} NET=${t2.net_delta}`);


    // 5. Test Reset (RPC: reset_counts)
    console.log("\n💥 Testing RESET COUNTS (Nuclear)...");
    const { data: resetResult, error: resetError } = await sbUser.rpc('reset_counts', {
        p_scope: 'VENUE',
        p_business_id: businessId,
        p_venue_id: venue.id
    });
    if (resetError) throw new Error(`Reset Failed: ${resetError.message}`);

    console.log("Reset Result:", resetResult);

    // Verify Snapshot is 0
    const { data: snapReset } = await sbUser.from('occupancy_snapshots').select('current_occupancy').eq('area_id', area.id).single();
    if (snapReset?.current_occupancy !== 0) throw new Error(`Reset Failed: Snapshot is ${snapReset?.current_occupancy}`);
    console.log(`✅ Snapshot Reset to 0`);

    // Verify Totals (Should show huge OUT event now?) NO.
    // Reset creates a "RESET" event with negative delta equal to current occupancy.
    // Current was 5. So it added -5.
    // Total IN should be 10. Total OUT should be 5 + 5 = 10. Net = 0.

    const { data: totals3 } = await sbUser.rpc('get_traffic_totals', { p_business_id: businessId });
    const t3 = totals3[0];
    if (t3.net_delta !== 0) throw new Error(`Reset Totals Mismatch: Net delta is ${t3.net_delta} (Expected 0)`);
    console.log(`✅ Reset Totals Logic Verified: IN=${t3.total_in} OUT=${t3.total_out} NET=${t3.net_delta}`);


    // 6. Test Soft Delete
    console.log("\n🗑️ Testing Soft Delete Device...");
    // Create Device
    const { data: dev, error: devError } = await sbAdmin.from('devices').insert({
        business_id: businessId,
        device_type: 'COUNTER',
        name: 'Test Device'
    }).select().single();
    if (devError) throw new Error(`Device Creation Failed: ${devError.message}`);
    const { data: delResult, error: delError } = await sbUser.rpc('soft_delete_device', { p_business_id: businessId, p_device_id: dev.id });
    if (delError) throw new Error(`Soft Delete RPC Failed: ${delError.message}`);
    console.log("Soft Delete Result:", delResult);

    // Admin Check
    const { data: adminDev } = await sbAdmin.from('devices').select('*').eq('id', dev.id).single();
    console.log("Admin View of Device:", adminDev);

    // Check if invisible to user
    const { data: devCheck } = await sbUser.from('devices').select('*').eq('id', dev.id);
    if (devCheck && devCheck.length > 0) throw new Error("Soft deleted device still visible to user!");
    console.log(`✅ Device Soft Deleted successfully (Hidden from RLS Select)`);

    // CLEANUP
    console.log("\n🧹 Cleaning up...");
    await sbAdmin.auth.admin.deleteUser(userId);
    // Cascade should kill business/venues but confirm db constraints. 
    // Usually Supabase doesn't cascade auth delete to public tables automatically unless trigger exists, 
    // but for test data it's fine to leave or use admin delete on business.
    // await sbAdmin.from('businesses').delete().eq('id', businessId); // Might fail due to FKs if no cascade

    console.log("🎉 ALL TESTS PASSED!");
}

runTest().catch(e => {
    console.error("❌ TEST FAILED:", e);
    process.exit(1);
});
