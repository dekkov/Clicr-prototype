'use server';

import { createClient } from '@/utils/supabase/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { revalidatePath } from 'next/cache';

export type SetupResult = { success: true; businessId?: string } | { success: false; error: string };

export async function createInitialBusiness(formData: FormData): Promise<SetupResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const businessName = (formData.get('businessName') as string)?.trim();
    if (!businessName) return { success: false, error: 'Business name is required' };

    const timezone = (formData.get('timezone') as string)?.trim() || 'America/New_York';
    const logoUrl = (formData.get('logoUrl') as string)?.trim() || null;

    try {
        const { data: business, error: busError } = await supabaseAdmin
            .from('businesses')
            .insert({
                name: businessName,
                timezone,
                ...(logoUrl ? { logo_url: logoUrl } : {}),
            })
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
        const businessId = business.id;

        revalidatePath('/dashboard');
        return { success: true, businessId };
    } catch (e: any) {
        console.error('[setup] createInitialBusiness error:', e);
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

export type OnboardingBatchInput = {
    businessName: string;
    timezone: string;
    logoUrl?: string;
    venue: { name: string; city?: string; state?: string; capacity?: number };
    areas: { name: string; capacity?: number; area_type?: string }[];
};

export type OnboardingBatchResult =
    | { success: true; businessId: string; venueId: string; areaIds: string[] }
    | { success: false; error: string };

export async function createBusinessVenueAndAreas(input: OnboardingBatchInput): Promise<OnboardingBatchResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const businessName = input.businessName?.trim();
    if (!businessName) return { success: false, error: 'Business name is required' };
    const venueName = input.venue?.name?.trim();
    if (!venueName) return { success: false, error: 'Venue name is required' };
    // 0 areas is fine — user can add areas later

    const timezone = input.timezone?.trim() || 'America/New_York';
    const logoUrl = input.logoUrl?.trim() || null;
    const capacity = input.venue.capacity != null && !isNaN(input.venue.capacity) && input.venue.capacity > 0
        ? input.venue.capacity
        : null;

    try {
        const { data: business, error: busError } = await supabaseAdmin
            .from('businesses')
            .insert({
                name: businessName,
                timezone,
                ...(logoUrl ? { logo_url: logoUrl } : {}),
            })
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

        const venueId = crypto.randomUUID();
        const { error: venueError } = await supabaseAdmin
            .from('venues')
            .insert({
                id: venueId,
                business_id: business.id,
                name: venueName,
                city: input.venue.city || null,
                state: input.venue.state || null,
                capacity_max: capacity,
                timezone,
            });
        if (venueError) throw venueError;

        const areaIds: string[] = [];
        for (const a of input.areas) {
            const areaId = crypto.randomUUID();
            const areaCap = a.capacity != null && !isNaN(a.capacity) && a.capacity > 0 ? a.capacity : null;
            const { error: areaError } = await supabaseAdmin
                .from('areas')
                .insert({
                    id: areaId,
                    venue_id: venueId,
                    business_id: business.id,
                    name: a.name.trim(),
                    capacity_max: areaCap,
                    area_type: a.area_type || 'MAIN',
                    counting_mode: 'BOTH',
                    is_active: true,
                });
            if (areaError) throw areaError;
            areaIds.push(areaId);
        }

        revalidatePath('/dashboard');
        return { success: true, businessId: business.id, venueId, areaIds };
    } catch (e: any) {
        console.error('[setup] createBusinessVenueAndAreas error:', e);
        return { success: false, error: e.message || 'Failed to create business, venue, and areas' };
    }
}

export async function updateBusinessSettings(
    businessId: string,
    newSettings: Record<string, unknown>
): Promise<SetupResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    try {
        const { data: existing } = await supabaseAdmin
            .from('businesses')
            .select('settings')
            .eq('id', businessId)
            .single();

        const merged = { ...(existing?.settings || {}), ...newSettings };

        const { error } = await supabaseAdmin
            .from('businesses')
            .update({ settings: merged })
            .eq('id', businessId);

        if (error) throw error;
        return { success: true };
    } catch (e: any) {
        console.error('[setup] updateBusinessSettings error:', e);
        return { success: false, error: e.message || 'Failed to update settings' };
    }
}

export async function deleteBusiness(businessId: string): Promise<SetupResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    // Server-side OWNER check — never trust client role
    const { data: membership, error: memberError } = await supabaseAdmin
        .from('business_members')
        .select('role')
        .eq('business_id', businessId)
        .eq('user_id', user.id)
        .single();

    if (memberError || !membership) {
        if (memberError) console.error('[setup] deleteBusiness membership check error:', memberError);
        return { success: false, error: 'Business not found or access denied' };
    }
    if (membership.role !== 'OWNER') {
        return { success: false, error: 'Only the business owner can delete the business' };
    }

    try {
        const { error } = await supabaseAdmin
            .from('businesses')
            .delete()
            .eq('id', businessId);

        if (error) throw error;

        revalidatePath('/dashboard');
        return { success: true };
    } catch (e: any) {
        console.error('[setup] deleteBusiness error:', e);
        return { success: false, error: e.message || 'Failed to delete business' };
    }
}
