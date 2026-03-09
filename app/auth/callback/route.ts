
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolvePostAuthRoute } from '@/lib/auth-helpers'

function sanitizeRedirectPath(path: string | null): string | null {
    if (!path) return null;
    // Must start with / and must not contain protocol or double-slash (open redirect)
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) {
        return null;
    }
    return path;
}

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next')
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type')

    const supabase = await createClient()

    if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
            const { data: { user } } = await supabase.auth.getUser()

            if (user) {
                await linkInvitedMemberships(user.id, user.email);
            }

            const isInviteAcceptance = user?.user_metadata?.invited_business_id
                && !user?.user_metadata?.password_set;

            const safeNext = sanitizeRedirectPath(next);
            const destination = isInviteAcceptance
                ? '/auth/set-password'
                : (safeNext ?? (user ? await resolvePostAuthRoute(user.id) : '/dashboard'));

            return NextResponse.redirect(`${origin}${destination}`)
        }
    } else if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash, type: type as any })
        if (!error) {
            const { data: { user } } = await supabase.auth.getUser()

            if (user) {
                await linkInvitedMemberships(user.id, user.email);
            }

            const isInviteAcceptance = user?.user_metadata?.invited_business_id
                && !user?.user_metadata?.password_set;

            const safeNext = sanitizeRedirectPath(next);
            const destination = isInviteAcceptance
                ? '/auth/set-password'
                : (safeNext ?? (user ? await resolvePostAuthRoute(user.id) : '/dashboard'));

            return NextResponse.redirect(`${origin}${destination}`)
        }
    }

    return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}

async function linkInvitedMemberships(userId: string, email: string | undefined) {
    if (!email) return;
    try {
        const { data: pending } = await supabaseAdmin
            .from('business_members')
            .select('id, business_id')
            .eq('invited_email', email)
            .neq('user_id', userId);

        if (pending && pending.length > 0) {
            for (const row of pending) {
                await supabaseAdmin
                    .from('business_members')
                    .update({ user_id: userId })
                    .eq('id', row.id);
            }
        }
    } catch (e) {
        console.error('[auth/callback] linkInvitedMemberships error:', e);
    }
}
