'use server';

import { createClient } from '@/utils/supabase/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { BoardView } from '@/lib/types';

export type BoardResult = { success: true; boardView?: BoardView } | { success: false; error: string };

export async function createBoardView(
    name: string,
    deviceIds: string[],
    labels: Record<string, string>,
    businessId: string
): Promise<BoardResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    try {
        const { data, error } = await supabaseAdmin
            .from('board_views')
            .insert({
                business_id: businessId,
                name,
                device_ids: deviceIds,
                labels,
                created_by: user.id,
            })
            .select()
            .single();

        if (error) throw error;
        return { success: true, boardView: data as BoardView };
    } catch (e: unknown) {
        console.error('[board] createBoardView error:', e);
        return { success: false, error: e instanceof Error ? e.message : 'Failed to create board view' };
    }
}

export async function listBoardViews(businessId: string): Promise<BoardView[]> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabaseAdmin
        .from('board_views')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });

    if (error) return [];
    return (data || []) as BoardView[];
}

export async function getBoardView(boardId: string): Promise<BoardView | null> {
    const { data, error } = await supabaseAdmin
        .from('board_views')
        .select('*')
        .eq('id', boardId)
        .single();

    if (error || !data) return null;
    return data as BoardView;
}

export async function deleteBoardView(boardId: string, businessId: string): Promise<BoardResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    try {
        const { error } = await supabaseAdmin
            .from('board_views')
            .delete()
            .eq('id', boardId)
            .eq('business_id', businessId);

        if (error) throw error;
        return { success: true };
    } catch (e: unknown) {
        console.error('[board] deleteBoardView error:', e);
        return { success: false, error: e instanceof Error ? e.message : 'Failed to delete board view' };
    }
}

export async function updateBoardView(
    boardId: string,
    businessId: string,
    updates: { name?: string; device_ids?: string[]; labels?: Record<string, string> }
): Promise<BoardResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    try {
        const { data, error } = await supabaseAdmin
            .from('board_views')
            .update(updates)
            .eq('id', boardId)
            .eq('business_id', businessId)
            .select()
            .single();

        if (error) throw error;
        return { success: true, boardView: data as BoardView };
    } catch (e: unknown) {
        console.error('[board] updateBoardView error:', e);
        return { success: false, error: e instanceof Error ? e.message : 'Failed to update board view' };
    }
}
