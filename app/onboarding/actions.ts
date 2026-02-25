
'use server';

import { createClient } from '@/utils/supabase/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { redirect } from 'next/navigation';

async function logError(userId: string | undefined, context: string, error: any) {
    console.error(`[${context}] Error:`, error);
    try {
        const supabase = await createClient();
        if (userId) {
            await supabase.from('app_errors').insert({
                user_id: userId,
                context,
                error_message: error.message || JSON.stringify(error),
                stack: error.stack
            });
        }
    } catch (e) {
        console.error('Failed to log error to DB', e);
    }
}

export async function signup(formData: FormData) {
    const supabase = await createClient();
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (password !== confirmPassword) {
        return redirect('/onboarding/signup?error=Passwords do not match');
    }

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { role: 'owner' } }
    });

    if (error) {
        console.error('Signup error:', error);
        return redirect(`/onboarding/signup?error=${encodeURIComponent(error.message)}`);
    }

    // Case 1: Session exists — initialize progress
    if (data.session) {
        const user = data.user!;

        // FIX: removed `completed: false` — column does not exist in schema
        const { error: progressError } = await supabase.from('onboarding_progress').upsert({
            user_id: user.id,
            current_step: 2
        }, { onConflict: 'user_id' });

        if (progressError) {
            await logError(user.id, 'signup_progress_init', progressError);
        }

        return redirect('/onboarding');
    }

    // Case 2: Email confirmation required
    if (data.user && !data.session) {
        return redirect('/onboarding/verify-email');
    }

    return redirect('/onboarding/signup?error=Something went wrong');
}

export async function submitStep(formData: FormData) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return redirect('/auth/signin');
    }

    const { data: progress, error: progressFetchError } = await supabase
        .from('onboarding_progress')
        .select('user_id, business_id, current_step')
        .eq('user_id', user.id)
        .single();

    if (progressFetchError || !progress) {
        await logError(user.id, 'progress_fetch_fail', { error: progressFetchError });
        const { error: recoveryError } = await supabase
            .from('onboarding_progress')
            .upsert({ user_id: user.id, current_step: 2 }, { onConflict: 'user_id' });
        if (recoveryError) {
            return redirect(`/onboarding?error=${encodeURIComponent('Failed to initialize progress: ' + recoveryError.message)}`);
        }
        return redirect('/onboarding');
    }

    // FIX: current_step is TEXT in schema — Number() converts '2' → 2 for strict === comparisons
    const step = Number(progress.current_step);

    try {
        /* ============================================================
           STEP 2: BUSINESS SETUP
           ============================================================ */
        if (step === 2) {
            const businessName = formData.get('businessName') as string;
            // FIX: explicit NaN check — parseInt('') returns NaN
            const venueCount = parseInt(formData.get('venueCount') as string, 10);

            if (!businessName || isNaN(venueCount) || venueCount < 1) {
                throw new Error('Missing fields');
            }

            let businessId = progress.business_id;

            // Upsert Business (admin client bypasses RLS)
            if (businessId) {
                const { error: busError } = await supabaseAdmin
                    .from('businesses')
                    .update({ name: businessName })
                    .eq('id', businessId);
                if (busError) throw busError;
            } else {
                const { data: business, error: busError } = await supabaseAdmin
                    .from('businesses')
                    .insert({ name: businessName })
                    .select()
                    .single();
                if (busError) throw busError;
                businessId = business.id;
            }

            // Ensure OWNER membership (admin bypasses bm_insert RLS; idempotent)
            await supabaseAdmin.from('business_members').upsert({
                business_id: businessId,
                user_id: user.id,
                role: 'OWNER'
            }, { onConflict: 'business_id,user_id' });

            // PRE-SEED VENUES so step 3 has rows to update
            const { count } = await supabaseAdmin
                .from('venues')
                .select('*', { count: 'exact', head: true })
                .eq('business_id', businessId);

            if ((count || 0) < venueCount) {
                const needed = venueCount - (count || 0);
                const venuesToInsert = Array.from({ length: needed }).map((_, i) => ({
                    business_id: businessId,
                    name: `Venue ${(count || 0) + i + 1}`,
                    capacity_max: 100
                }));
                const { error: seedError } = await supabaseAdmin.from('venues').insert(venuesToInsert);
                if (seedError) throw seedError;
            }

            // FIX: check error on progress update — silent failure here caused the loop
            const { error: stepError } = await supabase.from('onboarding_progress').update({
                business_id: businessId,
                current_step: 3,
            }).eq('user_id', user.id);
            if (stepError) throw stepError;

        /* ============================================================
           STEP 3: VENUE SETUP (LOOP)
           ============================================================ */
        } else if (step === 3) {
            const venueName = formData.get('venueName') as string;
            const capacity = parseInt(formData.get('capacity') as string, 10);
            const location = formData.get('location') as string;
            const activeIndex = parseInt(formData.get('activeVenueIndex') as string || '0', 10);

            if (!progress.business_id) throw new Error('No business context');

            const { data: venues, error: vFail } = await supabaseAdmin
                .from('venues')
                .select('*')
                .eq('business_id', progress.business_id)
                .order('created_at');
            if (vFail || !venues || venues.length === 0) throw new Error('No venues found for Step 3');

            const venueCount = venues.length;

            if (activeIndex >= venueCount) {
                const { error: stepError } = await supabase.from('onboarding_progress').update({ current_step: 4 }).eq('user_id', user.id);
                if (stepError) throw stepError;
                return redirect('/onboarding');
            }

            const currentVenueId = venues[activeIndex]?.id;

            if (currentVenueId) {
                await supabaseAdmin.from('venues').update({
                    name: venueName,
                    capacity_max: isNaN(capacity) ? null : capacity,
                    city: location || null
                }).eq('id', currentVenueId);
            }

            const nextIndex = activeIndex + 1;

            if (nextIndex < venueCount) {
                return redirect(`/onboarding?idx=${nextIndex}`);
            } else {
                const { error: stepError } = await supabase.from('onboarding_progress').update({ current_step: 4 }).eq('user_id', user.id);
                if (stepError) throw stepError;
                return redirect('/onboarding');
            }

        /* ============================================================
           STEP 4: AREAS SETUP (LOOP via Venues)
           ============================================================ */
        } else if (step === 4) {
            const activeIndex = parseInt(formData.get('activeVenueIndex') as string || '0', 10);
            const areasRaw = formData.get('areas');
            const areas = JSON.parse(areasRaw as string || '[]');

            const { data: venues } = await supabaseAdmin
                .from('venues')
                .select('id')
                .eq('business_id', progress.business_id)
                .order('created_at');
            if (!venues) throw new Error('No venues');

            const currentVenueId = venues[activeIndex]?.id;

            await supabaseAdmin.from('areas').delete().eq('venue_id', currentVenueId);

            for (const area of areas) {
                const { data: areaRow, error: areaError } = await supabaseAdmin
                    .from('areas')
                    .insert({
                        business_id: progress.business_id,
                        venue_id: currentVenueId,
                        name: area.name,
                        capacity_max: area.capacity || null
                    })
                    .select()
                    .single();

                if (areaError) throw areaError;

                await supabaseAdmin.from('occupancy_snapshots').insert({
                    business_id: progress.business_id,
                    venue_id: currentVenueId,
                    area_id: areaRow.id,
                    current_occupancy: 0
                });
            }

            const nextIndex = activeIndex + 1;
            if (nextIndex < venues.length) {
                return redirect(`/onboarding?idx=${nextIndex}`);
            } else {
                const { error: stepError } = await supabase.from('onboarding_progress').update({ current_step: 5 }).eq('user_id', user.id);
                if (stepError) throw stepError;
                return redirect('/onboarding');
            }

        /* ============================================================
           STEP 5: CLICRS SETUP (LOOP via Venues)
           ============================================================ */
        } else if (step === 5) {
            const activeIndex = parseInt(formData.get('activeVenueIndex') as string || '0', 10);
            const devicesRaw = formData.get('devices');
            const devicesMap = JSON.parse(devicesRaw as string || '{}');

            const { data: venues } = await supabaseAdmin
                .from('venues')
                .select('id')
                .eq('business_id', progress.business_id)
                .order('created_at');
            if (!venues) throw new Error('No venues');
            const currentVenueId = venues[activeIndex]?.id;

            await supabaseAdmin.from('devices').delete().eq('venue_id', currentVenueId);

            for (const [areaId, devices] of Object.entries(devicesMap)) {
                const deviceList = devices as any[];
                for (const dev of deviceList) {
                    await supabaseAdmin.from('devices').insert({
                        business_id: progress.business_id,
                        venue_id: currentVenueId,
                        area_id: areaId,
                        name: dev.name,
                        direction_mode: dev.mode
                    });
                }
            }

            const nextIndex = activeIndex + 1;
            if (nextIndex < venues.length) {
                return redirect(`/onboarding?idx=${nextIndex}`);
            } else {
                const { error: stepError } = await supabase.from('onboarding_progress').update({ current_step: 999 }).eq('user_id', user.id);
                if (stepError) throw stepError;
                return redirect('/dashboard');
            }
        }
    } catch (e: any) {
        await logError(user.id, `onboarding_step_${step}`, e);
        return redirect(`/onboarding?error=${encodeURIComponent(e.message || 'Error processing step')}`);
    }

    return redirect('/onboarding');
}
