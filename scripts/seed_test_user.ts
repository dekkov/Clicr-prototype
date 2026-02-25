
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing env vars');
    process.exit(1);
}

console.log(`Service Key Prefix: ${supabaseServiceKey.substring(0, 10)}... (Check if matches .env.local)`);

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function seed() {
    const email = process.env.SEED_USER_EMAIL;
    const password = process.env.SEED_USER_PASSWORD;

    if (!email || !password) {
        console.error('Missing SEED_USER_EMAIL or SEED_USER_PASSWORD env vars');
        process.exit(1);
    }

    // 1. Create User
    const { data: { user }, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
    });

    let userId = user?.id;

    if (error) {
        if (error.status === 422 || error.code === 'email_exists' || error.message.includes('already has been registered')) {
            console.log('User already exists, finding ID...');
            // API might not support searching by email reliably in all versions, but listUsers does using cache?
            // Actually, we can just signIn to get ID if we know password
            const { data: signin } = await supabase.auth.signInWithPassword({ email, password });
            if (signin.user) {
                userId = signin.user.id;
                console.log('Found existing user via login:', userId);
            }
        } else {
            console.error('Failed to create user:', error);
            process.exit(1);
        }
    } else {
        console.log('Created test user:', userId);
    }

    if (!userId) process.exit(1);

    // 2. Ensure Business Exists
    const { data: business } = await supabase
        .from('businesses')
        .insert({ name: 'Test Business', settings: { onboarding_completed_at: new Date().toISOString() } })
        .select()
        .single();

    // OR find existing
    let bizId = business?.id;
    if (!business) {
        // Try to find a business that HAS venues
        const { data: existingBiz } = await supabase.from('businesses').select('*, venues(id)').limit(10);
        const candidate = existingBiz?.find((b: any) => b.venues && b.venues.length > 0);

        if (candidate) {
            bizId = candidate.id;
            console.log("Using existing business with venues:", bizId);
        } else if (existingBiz && existingBiz.length > 0) {
            // Fallback to any business
            bizId = existingBiz[0].id;
        }
    }

    if (!bizId) {
        const { data: newBiz } = await supabase.from('businesses').insert({ name: 'Fallback Biz', settings: { onboarding_completed_at: new Date().toISOString() } }).select().single();
        bizId = newBiz.id;
    }

    // 3. Link Membership
    await supabase.from('business_members').upsert({
        business_id: bizId,
        user_id: userId,
        role: 'OWNER',
        is_default: true
    });

    // Authenticate as user to perform inserts if Service Role is flaky or RLS is strict
    const { data: signin } = await supabase.auth.signInWithPassword({ email, password });
    if (!signin.session) {
        console.error("Failed to sign in for seeding");
        return;
    }

    const userClient = createClient(supabaseUrl, supabaseServiceKey, { // Using URL as key? NO. Use Anon key for client side sim, or Service Key works too if we pass session.
        // Actually, just set the session on the main client or create new one with Access Token
        global: {
            headers: {
                Authorization: `Bearer ${signin.session.access_token}`
            }
        }
    });
    // But wait, createClient 2nd arg is key.
    // If I use Service Key + Bearer Token, does it work?
    // It's cleaner to use the session.

    // 4. Ensure Venue Exists (actions as User)
    const { data: venue, error: venueError } = await userClient
        .from('venues')
        .insert({
            business_id: bizId,
            name: 'Test Venue',
            status: 'ACTIVE'
        })
        .select()
        .single();

    if (venueError) console.error("Venue Create Error:", venueError);

    if (!venue) {
        // Log potential error if we can access it (Client doesn't return error in destructure if not requested)
        // Re-run with error capture
        const { error: vErr } = await supabase.from('venues').insert({ business_id: bizId, name: 'Retry Venue', address: '123', city: 'C', state: 'S', zip: '000' });
        if (vErr) console.error("Venue Create Error:", vErr);
    }

    let venueId = venue?.id;
    if (!venue) {
        const { data: v } = await supabase.from('venues').select('*').eq('business_id', bizId).limit(1).single();
        venueId = v?.id;
    }

    if (venueId) {
        // 5. Ensure Area Exists
        const { data: area } = await supabase
            .from('areas')
            .insert({
                venue_id: venueId,
                name: 'General Admission',
                capacity: 100
            })
            .select()
            .single();

        let areaId = area?.id;
        if (!area) {
            const { data: a } = await supabase.from('areas').select('*').eq('venue_id', venueId).limit(1).single();
            areaId = a?.id;
        }

        console.log(`Seeding Complete. Biz: ${bizId}, Venue: ${venueId}, Area: ${areaId}`);
    } else {
        console.log(`Seeding Partial. Biz: ${bizId} (No Venue Created)`);
    }

}

seed();
