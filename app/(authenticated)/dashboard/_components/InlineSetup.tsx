'use client';

import { useState, useEffect } from 'react';
import { Building2, MapPin, Users, ArrowRight, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { createInitialBusiness, createInitialVenue } from '@/app/onboarding/setup-actions';

type Phase = 'BUSINESS' | 'VENUE' | 'DONE';

interface InlineSetupProps {
    hasBusiness: boolean;
}

export function InlineSetup({ hasBusiness }: InlineSetupProps) {
    const [phase, setPhase] = useState<Phase>(hasBusiness ? 'VENUE' : 'BUSINESS');
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (phase === 'DONE') {
            // Hard reload so the store reinitializes with the new business + venue data
            window.location.reload();
        }
    }, [phase]);

    const handleSubmit = async (
        e: React.FormEvent<HTMLFormElement>,
        action: typeof createInitialBusiness,
        onSuccess: () => void
    ) => {
        e.preventDefault();
        setError(null);
        setIsPending(true);
        const result = await action(new FormData(e.currentTarget));
        setIsPending(false);
        if (result.success) {
            onSuccess();
        } else {
            setError(result.error);
        }
    };

    if (phase === 'DONE') {
        return (
            <div className="bg-card/50 border border-emerald-200 dark:border-emerald-500/20 rounded-3xl p-10 flex flex-col items-center gap-4 max-w-xl mx-auto mt-8">
                <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                <p className="text-foreground font-bold text-lg">You&apos;re all set!</p>
                <p className="text-muted-foreground text-sm">Loading your dashboard&hellip;</p>
            </div>
        );
    }

    return (
        <div className="bg-card/50 border border-white/5 rounded-3xl p-10 md:p-12 flex flex-col items-center space-y-8 max-w-xl mx-auto mt-8">
            {/* Logo */}
            <div className="w-20 h-20 bg-primary/20 text-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/10">
                <img src="/clicr-logo-white.png" alt="Clicr" className="w-14 h-14 object-contain" />
            </div>

            {phase === 'BUSINESS' ? (
                <>
                    <div className="text-center">
                        <h2 className="text-2xl font-bold text-foreground mb-2">Welcome to Clicr</h2>
                        <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                            Let&apos;s get your account set up. Start by naming your business.
                        </p>
                    </div>

                    {error && <ErrorBanner message={error} />}

                    <form
                        onSubmit={(e) => handleSubmit(e, createInitialBusiness, () => { setPhase('VENUE'); })}
                        className="w-full space-y-4"
                    >
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">
                                Business Name
                            </label>
                            <div className="relative">
                                <Building2 className="absolute left-4 top-3.5 w-5 h-5 text-muted-foreground" />
                                <input
                                    name="businessName"
                                    type="text"
                                    required
                                    placeholder="e.g. Nightlife Group LLC"
                                    className="w-full bg-background/40 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => window.history.back()}
                                className="flex-1 py-3 border border-border text-muted-foreground hover:text-foreground rounded-xl font-medium transition-all flex items-center justify-center gap-2"
                            >
                                <ArrowLeft className="w-4 h-4" /> Back
                            </button>
                            <div className="flex-1">
                                <SubmitButton isPending={isPending} label="Continue" />
                            </div>
                        </div>
                    </form>
                </>
            ) : (
                <>
                    <div className="text-center">
                        <h2 className="text-2xl font-bold text-foreground mb-2">Add your first venue</h2>
                        <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                            Create a location to start tracking occupancy in real time.
                        </p>
                    </div>

                    {error && <ErrorBanner message={error} />}

                    <form
                        onSubmit={(e) => handleSubmit(e, createInitialVenue, () => { setPhase('DONE'); })}
                        className="w-full space-y-4"
                    >
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">
                                Venue Name
                            </label>
                            <div className="relative">
                                <MapPin className="absolute left-4 top-3.5 w-5 h-5 text-muted-foreground" />
                                <input
                                    name="venueName"
                                    type="text"
                                    required
                                    placeholder="e.g. Downtown Club"
                                    className="w-full bg-background/40 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">
                                Max Capacity <span className="text-muted-foreground/60 normal-case font-normal">(optional)</span>
                            </label>
                            <div className="relative">
                                <Users className="absolute left-4 top-3.5 w-5 h-5 text-muted-foreground" />
                                <input
                                    name="capacity"
                                    type="number"
                                    min="1"
                                    placeholder="500"
                                    className="w-full bg-background/40 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setPhase('BUSINESS')}
                                className="flex-1 py-3 border border-border text-muted-foreground hover:text-foreground rounded-xl font-medium transition-all flex items-center justify-center gap-2"
                            >
                                <ArrowLeft className="w-4 h-4" /> Back
                            </button>
                            <div className="flex-1">
                                <SubmitButton isPending={isPending} label="Go to Dashboard" />
                            </div>
                        </div>
                    </form>
                </>
            )}

            {/* Step indicator */}
            <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full transition-colors ${phase === 'BUSINESS' ? 'bg-primary' : 'bg-emerald-500'}`} />
                <div className={`w-2 h-2 rounded-full transition-colors ${phase === 'VENUE' ? 'bg-primary' : 'bg-muted'}`} />
            </div>
        </div>
    );
}

function ErrorBanner({ message }: { message: string }) {
    return (
        <div className="w-full p-3 bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-400 text-sm text-center">
            {message}
        </div>
    );
}

function SubmitButton({ isPending, label }: { isPending: boolean; label: string }) {
    return (
        <button
            type="submit"
            disabled={isPending}
            className="w-full bg-primary text-foreground font-bold py-4 rounded-xl hover:bg-indigo-500 shadow-lg shadow-primary/25 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
            {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
                <>{label} <ArrowRight className="w-4 h-4" /></>
            )}
        </button>
    );
}
