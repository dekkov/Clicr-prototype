import { supabaseAdmin } from '@/lib/supabase-admin';

export async function resolvePostAuthRoute(userId: string): Promise<string> {
    try {
        const { data: memberships, error } = await supabaseAdmin
            .from('business_members')
            .select('business_id, role')
            .eq('user_id', userId);

        if (error) {
            console.error('[resolvePostAuthRoute] Query error:', error);
            // Don't redirect to onboarding on DB errors — default to dashboard
            return '/dashboard';
        }

        if (!memberships || memberships.length === 0) {
            return '/onboarding/setup';
        }
        // STAFF: areas + clicrs only — redirect to /areas
        const role = memberships[0]?.role as string | undefined;
        if (role === 'STAFF') return '/areas';
    } catch (e) {
        console.error('[resolvePostAuthRoute] Failed to check memberships:', e);
    }

    return '/dashboard';
}
