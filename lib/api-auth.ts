import { createClient } from '@/utils/supabase/server';

export type AuthenticatedUser = {
    id: string;
    email: string;
};

/**
 * Extract the authenticated user from the Supabase session cookie.
 * Returns null if no valid session exists.
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user || !user.email) {
        return null;
    }

    return { id: user.id, email: user.email };
}

/**
 * Like getAuthenticatedUser, but throws if no valid session.
 * Use in API routes that require authentication.
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
    const user = await getAuthenticatedUser();
    if (!user) {
        throw new Error('UNAUTHORIZED');
    }
    return user;
}
