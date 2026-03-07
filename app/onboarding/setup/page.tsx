"use client";

import BusinessSetupWizard from '@/components/wizards/BusinessSetupWizard';

export default function OnboardingSetupPage() {
    return (
        <div className="min-h-screen bg-slate-950 flex items-start justify-center px-4 py-12">
            <div className="w-full max-w-xl space-y-8">
                <BusinessSetupWizard />
            </div>
        </div>
    );
}
