"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Logo } from '@/components/ui/Logo';
import { Loader2 } from 'lucide-react';

export default function AcceptInvitePage() {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const processInvite = async () => {
            const supabase = createClient();

            const hash = window.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            const accessToken = params.get('access_token');
            const refreshToken = params.get('refresh_token');

            if (!accessToken || !refreshToken) {
                setError('Invalid invite link — missing tokens.');
                return;
            }

            const { data, error: sessionError } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
            });

            if (sessionError) {
                setError(sessionError.message);
                return;
            }

            if (data?.user) {
                const meta = data.user.user_metadata;
                const bizId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('businessId') : null;
                if (bizId) {
                    try { localStorage.setItem('clicr_last_biz_id', bizId); } catch { }
                }
                if (meta?.invited_business_id && !meta?.password_set) {
                    router.push('/auth/set-password');
                } else {
                    router.push('/dashboard');
                }
            } else {
                setError('Could not establish session.');
            }
        };

        processInvite();
    }, [router]);

    return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-md bg-slate-900/50 border border-white/10 rounded-3xl p-8 shadow-2xl backdrop-blur-xl text-center">
                <div className="flex justify-center mb-6">
                    <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                        <Logo className="w-10 h-10" />
                    </div>
                </div>
                {error ? (
                    <>
                        <h1 className="text-xl font-bold text-red-400 mb-2">Something went wrong</h1>
                        <p className="text-slate-400 text-sm">{error}</p>
                    </>
                ) : (
                    <>
                        <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
                        <h1 className="text-xl font-bold text-white mb-2">Accepting invite...</h1>
                        <p className="text-slate-400 text-sm">Setting up your account. This will just take a moment.</p>
                    </>
                )}
            </div>
        </div>
    );
}
