"use client";

import { useEffect, useRef, ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmModalProps {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    children?: ReactNode; // Custom content slot (e.g., date picker)
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmModal({
    open, title, message,
    confirmLabel = "Confirm", cancelLabel = "Cancel",
    destructive = false, children,
    onConfirm, onCancel,
}: ConfirmModalProps) {
    const confirmRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (open) confirmRef.current?.focus();
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [open, onCancel]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative bg-card border border-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl animate-fade-in">
                <button onClick={onCancel} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors">
                    <X className="w-4 h-4" />
                </button>
                <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground mb-4">{message}</p>
                {children && <div className="mb-4">{children}</div>}
                <div className="flex gap-3 justify-end">
                    <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        {cancelLabel}
                    </button>
                    <button ref={confirmRef} onClick={onConfirm} className={cn(
                        "px-4 py-2 rounded-lg text-sm font-bold text-white transition-colors",
                        destructive ? "bg-red-600 hover:bg-red-700" : "bg-primary hover:bg-primary-hover"
                    )}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
