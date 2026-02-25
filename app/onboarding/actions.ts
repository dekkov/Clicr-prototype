
'use server';

import { createClient } from '@/utils/supabase/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { redirect } from 'next/navigation';

async function logError(userId: string | undefined, context: string, error: any) {
    console.error(`[${context}] Error:`, error);
    try {
        const supabase = await createClient();
        if (userId) {
            await supabase.from('app_errors').insert({
                user_id: userId,
                context,
                error_message: error.message || JSON.stringify(error),
                stack: error.stack
            });
        }
    } catch (e) {
        console.error('Failed to log error to DB', e);
    }
}

export async function signup(formData: FormData) {
    const supabase = await createClient();
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (password !== confirmPassword) {
        return redirect('/onboarding/signup?error=Passwords do not match');
    }

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { role: 'owner' } }
    });

    if (error) {
        console.error('Signup error:', error);
        return redirect(`/onboarding/signup?error=${encodeURIComponent(error.message)}`);
    }

    // Case 1: Session exists — create profile row and go directly to dashboard
    if (data.session) {
        await supabaseAdmin.from('profiles').upsert({
            id: data.user!.id,
            email,
            role: 'OWNER',
        });
        return redirect('/dashboard');
    }

    // Case 2: Email confirmation required
    if (data.user && !data.session) {
        return redirect('/onboarding/verify-email');
    }

    return redirect('/onboarding/signup?error=Something went wrong');
}

