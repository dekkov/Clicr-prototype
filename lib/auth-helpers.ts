import { supabaseAdmin } from '@/lib/supabase-admin';

export async function resolvePostAuthRoute(userId: string): Promise<string> {
    try {
        const { data: memberships } = await supabaseAdmin
            .from('business_members')
            .select('business_id')
            .eq('user_id', userId)
            .limit(1);

        if (!memberships || memberships.length === 0) {
            return '/onboarding/setup';
        }
    } catch (e) {
        console.error('[resolvePostAuthRoute] Failed to check memberships:', e);
    }

    return '/dashboard';
}
