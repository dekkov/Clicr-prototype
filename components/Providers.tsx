"use client";

import { AppProvider } from "@/lib/store";
import { ThemeProvider } from "@/components/providers/theme-provider";

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider>
            <AppProvider>
                {children}
            </AppProvider>
        </ThemeProvider>
    );
}
