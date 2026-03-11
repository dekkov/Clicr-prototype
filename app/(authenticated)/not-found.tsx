import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function NotFound() {
    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
            <div className="text-center max-w-md">
                <h1 className="text-4xl font-bold text-foreground mb-2">404</h1>
                <p className="text-muted-foreground mb-6">You don&apos;t have access to this page.</p>
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-purple-500 text-white font-semibold rounded-xl transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Dashboard
                </Link>
            </div>
        </div>
    );
}
