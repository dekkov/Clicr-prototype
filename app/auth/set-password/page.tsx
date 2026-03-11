"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Lock, ArrowRight } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { PasswordInput } from '@/components/ui/password-input';

export default function SetPasswordPage() {
    const router = useRouter();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setIsLoading(true);
        try {
            const supabase = createClient();
            const { error: updateError } = await supabase.auth.updateUser({
                password,
                data: { password_set: true },
            });

            if (updateError) throw updateError;

            router.push('/dashboard');
        } catch (err: any) {
            setError(err.message || 'Failed to set password');
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-primary/10 rounded-full blur-3xl opacity-30 -z-10" />

            <div className="w-full max-w-md bg-slate-900/50 border border-white/10 rounded-3xl p-8 shadow-2xl backdrop-blur-xl">
                <div className="text-center mb-8">
                    <div className="flex justify-center mb-6">
                        <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                            <Logo className="w-10 h-10" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight mb-2 text-white">Set your password</h1>
                    <p className="text-slate-400 text-sm">You were invited to join a team. Create a password to complete your account.</p>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">New Password</label>
                        <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 z-10" />
                            <PasswordInput
                                required
                                minLength={8}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="8+ characters"
                                className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-11 pr-10 text-white placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Confirm Password</label>
                        <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 z-10" />
                            <PasswordInput
                                required
                                minLength={8}
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                placeholder="Repeat password"
                                className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-11 pr-10 text-white placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-primary text-white font-bold py-4 rounded-xl hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all mt-4 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isLoading ? 'Setting password...' : 'Set Password & Continue'}
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </form>
            </div>
        </div>
    );
}
