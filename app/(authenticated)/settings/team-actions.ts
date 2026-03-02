'use server';

import { createClient } from '@/utils/supabase/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { headers } from 'next/headers';
import type { Role } from '@/lib/types';

export type InviteResult = { success: true } | { success: false; error: string };

const INVITABLE_ROLES: Role[] = ['ADMIN', 'MANAGER', 'STAFF', 'ANALYST'];

export async function inviteTeamMember(
    email: string,
    role: Role,
    businessId: string,
    options?: { assignedVenueIds?: string[]; assignedAreaIds?: string[] }
): Promise<InviteResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    if (!INVITABLE_ROLES.includes(role)) {
        return { success: false, error: 'Invalid role for invitation' };
    }

    const { data: callerMembership } = await supabaseAdmin
        .from('business_members')
        .select('role')
        .eq('business_id', businessId)
        .eq('user_id', user.id)
        .single();

    if (!callerMembership || !['OWNER', 'ADMIN'].includes(callerMembership.role)) {
        return { success: false, error: 'Only owners and admins can invite members' };
    }

    try {
        const hdrs = await headers();
        const host = hdrs.get('host') || 'localhost:3000';
        const proto = hdrs.get('x-forwarded-proto') || 'http';
        const origin = `${proto}://${host}`;

        const { data: invitedUser, error: inviteError } = await supabaseAdmin.auth.admin
            .inviteUserByEmail(email, {
                data: { invited_business_id: businessId, invited_role: role },
                redirectTo: `${origin}/auth/accept-invite`,
            });

        if (inviteError) throw inviteError;

        if (invitedUser?.user?.id) {
            const payload: Record<string, unknown> = {
                business_id: businessId,
                user_id: invitedUser.user.id,
                role,
                invited_email: email,
            };
            if (options?.assignedVenueIds?.length) {
                payload.assigned_venue_ids = options.assignedVenueIds;
            }
            if (options?.assignedAreaIds?.length) {
                payload.assigned_area_ids = options.assignedAreaIds;
            }
            const { error: memberError } = await supabaseAdmin
                .from('business_members')
                .upsert(payload, { onConflict: 'business_id,user_id' });

            if (memberError) throw memberError;
        }

        return { success: true };
    } catch (e: any) {
        console.error('[team] inviteTeamMember error:', e);
        return { success: false, error: e.message || 'Failed to invite user' };
    }
}

export async function removeTeamMember(
    userId: string,
    businessId: string
): Promise<InviteResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    if (userId === user.id) {
        return { success: false, error: 'Cannot remove yourself' };
    }

    const { data: callerMembership } = await supabaseAdmin
        .from('business_members')
        .select('role')
        .eq('business_id', businessId)
        .eq('user_id', user.id)
        .single();

    if (!callerMembership || !['OWNER', 'ADMIN'].includes(callerMembership.role)) {
        return { success: false, error: 'Only owners and admins can remove members' };
    }

    try {
        const { error } = await supabaseAdmin
            .from('business_members')
            .delete()
            .eq('business_id', businessId)
            .eq('user_id', userId);

        if (error) throw error;
        return { success: true };
    } catch (e: any) {
        console.error('[team] removeTeamMember error:', e);
        return { success: false, error: e.message || 'Failed to remove user' };
    }
}

export async function updateMemberRole(
    userId: string,
    businessId: string,
    newRole: Role
): Promise<InviteResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    if (!['ADMIN', 'MANAGER', 'STAFF', 'ANALYST'].includes(newRole)) {
        return { success: false, error: 'Invalid role' };
    }

    const { data: callerMembership } = await supabaseAdmin
        .from('business_members')
        .select('role')
        .eq('business_id', businessId)
        .eq('user_id', user.id)
        .single();

    if (!callerMembership || !['OWNER', 'ADMIN'].includes(callerMembership.role)) {
        return { success: false, error: 'Only owners and admins can change roles' };
    }

    const { data: targetMembership } = await supabaseAdmin
        .from('business_members')
        .select('role')
        .eq('business_id', businessId)
        .eq('user_id', userId)
        .single();

    if (!targetMembership || targetMembership.role === 'OWNER') {
        return { success: false, error: 'Cannot change owner role' };
    }

    try {
        const { error } = await supabaseAdmin
            .from('business_members')
            .update({ role: newRole })
            .eq('business_id', businessId)
            .eq('user_id', userId);

        if (error) throw error;
        return { success: true };
    } catch (e: any) {
        console.error('[team] updateMemberRole error:', e);
        return { success: false, error: e.message || 'Failed to update role' };
    }
}

export async function updateMemberAssignments(
    userId: string,
    businessId: string,
    options: { assignedVenueIds?: string[]; assignedAreaIds?: string[] }
): Promise<InviteResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data: callerMembership } = await supabaseAdmin
        .from('business_members')
        .select('role')
        .eq('business_id', businessId)
        .eq('user_id', user.id)
        .single();

    if (!callerMembership || !['OWNER', 'ADMIN'].includes(callerMembership.role)) {
        return { success: false, error: 'Only owners and admins can update assignments' };
    }

    const { data: targetMembership } = await supabaseAdmin
        .from('business_members')
        .select('role')
        .eq('business_id', businessId)
        .eq('user_id', userId)
        .single();

    if (!targetMembership || targetMembership.role === 'OWNER') {
        return { success: false, error: 'Cannot update owner assignments' };
    }

    try {
        const payload: Record<string, unknown> = {};
        if (options.assignedVenueIds !== undefined) payload.assigned_venue_ids = options.assignedVenueIds;
        if (options.assignedAreaIds !== undefined) payload.assigned_area_ids = options.assignedAreaIds;

        if (Object.keys(payload).length === 0) {
            return { success: true };
        }

        const { error } = await supabaseAdmin
            .from('business_members')
            .update(payload)
            .eq('business_id', businessId)
            .eq('user_id', userId);

        if (error) throw error;
        return { success: true };
    } catch (e: any) {
        console.error('[team] updateMemberAssignments error:', e);
        return { success: false, error: e.message || 'Failed to update assignments' };
    }
}

export async function getTeamMembers(businessId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: members, error } = await supabaseAdmin
        .from('business_members')
        .select('user_id, role, invited_email, joined_at, assigned_venue_ids, assigned_area_ids')
        .eq('business_id', businessId)
        .order('joined_at', { ascending: true });

    if (error || !members) return [];

    const enriched = await Promise.all(
        members.map(async (m) => {
            const { data: { user: memberUser } } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
            return {
                id: m.user_id,
                email: memberUser?.email || m.invited_email || 'Unknown',
                name: memberUser?.user_metadata?.full_name || memberUser?.user_metadata?.name || '',
                role: m.role as Role,
                joinedAt: m.joined_at,
                isConfirmed: !!memberUser?.email_confirmed_at,
                assignedVenueIds: (m.assigned_venue_ids as string[] | null) ?? [],
                assignedAreaIds: (m.assigned_area_ids as string[] | null) ?? [],
            };
        })
    );

    return enriched;
}
