import { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";

type SubscriptionCallbacks = {
    onSnapshot: (payload: any) => void;
    onEvent: (payload: any) => void;
    onStatusChange: (status: string) => void;
};

export class RealtimeManager {
    private channel: RealtimeChannel | null = null;
    private currentBusinessId: string | null = null;
    private supabase: SupabaseClient;

    constructor() {
        this.supabase = createClient();
    }

    public subscribe(businessId: string, callbacks: SubscriptionCallbacks) {
        // Prevent dupes
        if (this.currentBusinessId === businessId && this.channel) {
            console.log("[Realtime] Already subscribed to", businessId);
            return;
        }

        this.unsubscribe();

        this.currentBusinessId = businessId;
        console.log(`[Realtime] Initializing subscription for BusID: ${businessId}`);

        // Channel Name: occupancy_stream_BUSINESSID
        this.channel = this.supabase.channel(`occupancy_stream_${businessId}`)
            // 1. Listen for Area Updates (Live Occupancy Source of Truth — current_occupancy on areas)
            .on(
                'postgres_changes',
                {
                    event: '*', // INSERT/UPDATE/DELETE
                    schema: 'public',
                    table: 'areas',
                    filter: `business_id=eq.${businessId}`
                },
                (payload) => {
                    // console.log('[Realtime] Area update:', payload.eventType);
                    callbacks.onSnapshot(payload);
                }
            )
            // 2. Listen for Events (Traffic Totals Source)
            // Only need INSERTS to trigger refresh
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'occupancy_events',
                    filter: `business_id=eq.${businessId}`
                },
                (payload) => {
                    // console.log('[Realtime] Event Insert:', payload.new);
                    callbacks.onEvent(payload);
                }
            )
            .subscribe((status) => {
                callbacks.onStatusChange(status);
            });
    }

    public unsubscribe() {
        if (this.channel) {
            console.log("[Realtime] Cleaning up channel...");
            this.supabase.removeChannel(this.channel);
            this.channel = null;
            this.currentBusinessId = null;
        }
    }
}
