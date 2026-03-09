import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser } from '@/lib/api-auth';

export async function POST(request: Request) {
    const body = await request.json();
    const user = await getAuthenticatedUser();
    // Allow unauthenticated error logging but use session for user ID
    const userId = user?.id ?? null;
    const { message, context, payload } = body;

    try {
        await supabaseAdmin.from('app_errors').insert({
            user_id: userId || null,
            error_message: message,
            context: context || 'client_reported',
            payload: payload
        });
        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("[log-error] Failed to persist error:", e instanceof Error ? e.message : "Unknown error");
        return NextResponse.json({ success: false }, { status: 500 });
    }
}
