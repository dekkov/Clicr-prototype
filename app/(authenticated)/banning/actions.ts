'use server';

import { createClient } from '@/utils/supabase/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { hasMinRole } from '@/lib/permissions';

export async function revokeBan(
    banId: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: 'Unauthorized' };

        const { data: member } = await supabaseAdmin
            .from('business_members')
            .select('role')
            .eq('user_id', user.id)
            .limit(1)
            .single();
        if (!member || !hasMinRole(member.role, 'MANAGER')) {
            return { success: false, error: 'Insufficient permissions — Manager or above required.' };
        }

        const { error } = await supabaseAdmin
            .from('patron_bans')
            .update({
                status: 'REMOVED',
                removed_by_user_id: user.id,
                removed_reason: reason || 'Manually revoked',
                updated_at: new Date().toISOString(),
            })
            .eq('id', banId);

        if (error) return { success: false, error: error.message };

        await supabaseAdmin.from('ban_audit_logs').insert({
            ban_id: banId,
            action: 'REMOVED',
            performed_by_user_id: user.id,
            details_json: { reason },
        });

        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

export async function getBanById(banId: string) {
    const { data } = await supabaseAdmin
        .from('patron_bans')
        .select('id, status, reason_category, reason_notes, ban_type, applies_to_all_locations, banned_persons(first_name, last_name)')
        .eq('id', banId)
        .single();
    return data;
}
