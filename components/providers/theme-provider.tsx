"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
    theme: Theme;
    resolvedTheme: "light" | "dark";
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "clicr-theme";

function getSystemTheme(): "light" | "dark" {
    if (typeof window === "undefined") return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(theme: Theme): "light" | "dark" {
    return theme === "system" ? getSystemTheme() : theme;
}

function applyTheme(resolved: "light" | "dark") {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolved);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<Theme>("system");
    const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("dark");

    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
        const initial = stored || "system";
        setThemeState(initial);
        const resolved = resolveTheme(initial);
        setResolvedTheme(resolved);
        applyTheme(resolved);
    }, []);

    useEffect(() => {
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const handler = () => {
            if (theme === "system") {
                const resolved = getSystemTheme();
                setResolvedTheme(resolved);
                applyTheme(resolved);
            }
        };
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, [theme]);

    const setTheme = useCallback((newTheme: Theme) => {
        setThemeState(newTheme);
        localStorage.setItem(STORAGE_KEY, newTheme);
        const resolved = resolveTheme(newTheme);
        setResolvedTheme(resolved);
        applyTheme(resolved);
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
    return ctx;
}
