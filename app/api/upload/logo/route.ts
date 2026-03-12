import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const BUCKET = "business-logos";

export async function POST(request: Request) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const businessId = formData.get("business_id") as string | null;

        if (!file || !businessId) {
            return NextResponse.json(
                { error: "file and business_id required" },
                { status: 400 }
            );
        }

        // Verify OWNER or ADMIN role
        const { data: membership } = await supabaseAdmin
            .from("business_members")
            .select("role")
            .eq("user_id", user.id)
            .eq("business_id", businessId)
            .limit(1)
            .single();

        if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
            return NextResponse.json({ error: "Forbidden: ADMIN role required" }, { status: 403 });
        }

        if (!ALLOWED_TYPES.includes(file.type)) {
            return NextResponse.json({ error: "Invalid file type. Allowed: PNG, JPG, WEBP" }, { status: 400 });
        }

        if (file.size > MAX_SIZE) {
            return NextResponse.json({ error: "File too large. Max 2MB" }, { status: 400 });
        }

        const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
        const path = `${businessId}/logo.${ext}`;

        // Ensure bucket exists (creates on first upload if missing)
        const { error: bucketError } = await supabaseAdmin.storage.createBucket(BUCKET, {
            public: true,
            allowedMimeTypes: ALLOWED_TYPES,
            fileSizeLimit: MAX_SIZE,
        });
        // Ignore "already exists" error
        if (bucketError && !bucketError.message.includes("already exists")) {
            console.error("[upload] Failed to ensure bucket:", bucketError.message);
            return NextResponse.json({ error: "Storage not configured" }, { status: 500 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const { error: uploadError } = await supabaseAdmin.storage
            .from(BUCKET)
            .upload(path, buffer, { contentType: file.type, upsert: true });

        if (uploadError) {
            console.error("[upload] Storage upload error:", uploadError.message);
            return NextResponse.json({ error: uploadError.message }, { status: 500 });
        }

        const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
        const logoUrl = urlData.publicUrl;

        const { error: updateError } = await supabaseAdmin
            .from("businesses")
            .update({ logo_url: logoUrl })
            .eq("id", businessId);

        if (updateError) {
            return NextResponse.json({ error: "Failed to save logo URL" }, { status: 500 });
        }

        return NextResponse.json({ logo_url: logoUrl });
    } catch (e) {
        console.error("[upload] Error:", e instanceof Error ? e.message : "Unknown");
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
}
