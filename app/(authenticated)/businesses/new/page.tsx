"use client";

import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import BusinessSetupWizard from '@/components/wizards/BusinessSetupWizard';

export default function NewBusinessPage() {
    const router = useRouter();
    return (
        <div className="max-w-xl mx-auto px-4 py-8 space-y-8">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-white">Add New Business</h1>
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors"
                >
                    <X className="w-4 h-4" /> Cancel
                </button>
            </div>
            <BusinessSetupWizard onComplete={() => router.push('/dashboard')} />
        </div>
    );
}
