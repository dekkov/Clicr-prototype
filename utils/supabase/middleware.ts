
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        request.cookies.set(name, value)
                    });
                    supabaseResponse = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    const {
        data: { user },
    } = await supabase.auth.getUser()

    const path = request.nextUrl.pathname;

    // --- 1. UNAUTHENTICATED USERS ---
    const isProtectedRoute =
        path.startsWith('/dashboard') ||
        path.startsWith('/venues') ||
        path.startsWith('/banning') ||
        path.startsWith('/reports') ||
        path.startsWith('/settings') ||
        path.startsWith('/onboarding/setup');

    if (!user) {
        if (isProtectedRoute) {
            const url = request.nextUrl.clone()
            url.pathname = '/login'
            return NextResponse.redirect(url)
        }
        return supabaseResponse;
    }

    // --- 2. AUTHENTICATED USERS ---
    // Allow API, static, and debug routes through
    if (
        path.startsWith('/api') ||
        path.startsWith('/_next') ||
        path.includes('.') ||
        path.startsWith('/debug')
    ) {
        return supabaseResponse;
    }

    // Redirect away from auth/login/signup pages (already logged in)
    // Exception: /auth/set-password must remain accessible for invited users
    const isAuthRoute =
        path === '/' ||
        path === '/login' ||
        path === '/signup' ||
        (path.startsWith('/auth') && path !== '/auth/set-password' && path !== '/auth/accept-invite');

    // Redirect away from the old onboarding wizard root.
    // /onboarding/signup and /onboarding/verify-email remain accessible.
    const isWizardRoute =
        path === '/onboarding' ||
        path === '/onboarding/' ||
        (path.startsWith('/onboarding') &&
            !path.startsWith('/onboarding/signup') &&
            !path.startsWith('/onboarding/verify-email') &&
            !path.startsWith('/onboarding/setup'));

    if (isAuthRoute || isWizardRoute) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
    }

    return supabaseResponse
}
