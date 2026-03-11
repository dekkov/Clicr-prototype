"use client";

import { useState, useRef, useCallback } from "react";
import { Building2, Upload, Loader2, X } from "lucide-react";

interface LogoUploaderProps {
    currentUrl?: string | null;
    businessId: string;
    onUpload: (url: string) => void;
    /** Demo mode: skip API, convert to base64 */
    demoMode?: boolean;
}

export function LogoUploader({ currentUrl, businessId, onUpload, demoMode }: LogoUploaderProps) {
    const [preview, setPreview] = useState<string | null>(currentUrl || null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFile = useCallback(async (file: File) => {
        setError(null);

        const allowed = ["image/png", "image/jpeg", "image/webp"];
        if (!allowed.includes(file.type)) {
            setError("PNG, JPG, or WEBP only");
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            setError("Max 2MB");
            return;
        }

        const objectUrl = URL.createObjectURL(file);
        setPreview(objectUrl);
        setUploading(true);

        try {
            if (demoMode) {
                const reader = new FileReader();
                const base64 = await new Promise<string>((resolve, reject) => {
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
                onUpload(base64);
            } else {
                const formData = new FormData();
                formData.append("file", file);
                formData.append("business_id", businessId);

                const res = await fetch("/api/upload/logo", {
                    method: "POST",
                    body: formData,
                });

                if (!res.ok) {
                    const body = await res.json();
                    throw new Error(body.error || "Upload failed");
                }

                const { logo_url } = await res.json();
                setPreview(logo_url);
                onUpload(logo_url);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Upload failed");
            setPreview(currentUrl || null);
        } finally {
            setUploading(false);
        }
    }, [businessId, currentUrl, demoMode, onUpload]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const handleRemove = useCallback(() => {
        setPreview(null);
        onUpload("");
        if (inputRef.current) inputRef.current.value = "";
    }, [onUpload]);

    return (
        <div className="flex flex-col items-center gap-3">
            <div
                onClick={() => inputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="relative w-24 h-24 rounded-full border-2 border-dashed border-slate-700 hover:border-primary/50 flex items-center justify-center cursor-pointer overflow-hidden transition-colors bg-slate-900/50"
            >
                {uploading ? (
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                ) : preview ? (
                    <>
                        <img src={preview} alt="Logo" className="w-full h-full object-cover" />
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleRemove(); }}
                            className="absolute top-0 right-0 p-1 bg-black/60 rounded-full"
                        >
                            <X className="w-3 h-3 text-white" />
                        </button>
                    </>
                ) : (
                    <div className="flex flex-col items-center gap-1">
                        <Building2 className="w-8 h-8 text-slate-600" />
                        <Upload className="w-3 h-3 text-slate-600" />
                    </div>
                )}
            </div>

            <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                }}
            />

            {error && <p className="text-xs text-red-400">{error}</p>}
            <p className="text-xs text-slate-500">PNG, JPG, or WEBP. Max 2MB.</p>
        </div>
    );
}
