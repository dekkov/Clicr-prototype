'use server';

import { createClient } from '@/utils/supabase/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { revalidatePath } from 'next/cache';

export type SetupResult = { success: true } | { success: false; error: string };

export async function createInitialBusiness(formData: FormData): Promise<SetupResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const businessName = (formData.get('businessName') as string)?.trim();
    if (!businessName) return { success: false, error: 'Business name is required' };

    try {
        // Check if user already has a business membership
        const { data: existingMembership } = await supabase
            .from('business_members')
            .select('business_id')
            .eq('user_id', user.id)
            .maybeSingle();

        if (existingMembership?.business_id) {
            // Update the existing business name
            const { error } = await supabaseAdmin
                .from('businesses')
                .update({ name: businessName })
                .eq('id', existingMembership.business_id);
            if (error) throw error;
        } else {
            // Create new business — supabaseAdmin bypasses RLS (business_members doesn't exist yet)
            const { data: business, error: busError } = await supabaseAdmin
                .from('businesses')
                .insert({ name: businessName })
                .select()
                .single();
            if (busError) throw busError;

            const { error: memberError } = await supabaseAdmin
                .from('business_members')
                .upsert(
                    { business_id: business.id, user_id: user.id, role: 'OWNER' },
                    { onConflict: 'business_id,user_id' }
                );
            if (memberError) throw memberError;
        }

        revalidatePath('/dashboard');
        return { success: true };
    } catch (e: any) {
        console.error('[setup] createInitialBusiness error:', e);
        return { success: false, error: e.message || 'Failed to create business' };
    }
}

export async function createAdditionalBusiness(formData: FormData): Promise<SetupResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const businessName = (formData.get('businessName') as string)?.trim();
    if (!businessName) return { success: false, error: 'Business name is required' };

    try {
        const { data: business, error: busError } = await supabaseAdmin
            .from('businesses')
            .insert({ name: businessName })
            .select()
            .single();
        if (busError) throw busError;

        const { error: memberError } = await supabaseAdmin
            .from('business_members')
            .insert({ business_id: business.id, user_id: user.id, role: 'OWNER' });
        if (memberError) throw memberError;

        revalidatePath('/dashboard');
        return { success: true };
    } catch (e: any) {
        console.error('[setup] createAdditionalBusiness error:', e);
        return { success: false, error: e.message || 'Failed to create business' };
    }
}

export async function createInitialVenue(formData: FormData): Promise<SetupResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const venueName = (formData.get('venueName') as string)?.trim();
    if (!venueName) return { success: false, error: 'Venue name is required' };

    const capacityRaw = formData.get('capacity') as string;
    const capacity = capacityRaw ? parseInt(capacityRaw, 10) : null;

    try {
        // User now has a business_members row — can read business_id
        const { data: membership, error: memberError } = await supabase
            .from('business_members')
            .select('business_id')
            .eq('user_id', user.id)
            .single();
        if (memberError || !membership) throw new Error('No business found for user');

        // supabaseAdmin for venue insert (RLS may require settled membership)
        const { error: venueError } = await supabaseAdmin
            .from('venues')
            .insert({
                business_id: membership.business_id,
                name: venueName,
                capacity_max: capacity !== null && !isNaN(capacity) && capacity > 0 ? capacity : null,
            });
        if (venueError) throw venueError;

        revalidatePath('/dashboard');
        return { success: true };
    } catch (e: any) {
        console.error('[setup] createInitialVenue error:', e);
        return { success: false, error: e.message || 'Failed to create venue' };
    }
}
