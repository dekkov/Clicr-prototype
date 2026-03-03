'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { SupportTicket } from '@/lib/types';
import { Resend } from 'resend';

const getResend = () => {
    const key = process.env.RESEND_API_KEY;
    if (!key) return null;
    return new Resend(key);
}

export type TicketFormData = {
    subject: string;
    description: string;
    category: 'TECHNICAL' | 'BILLING' | 'FEATURE_REQUEST' | 'OTHER' | 'COMPLIANCE';
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    userId: string;
    businessId: string;
};

export async function submitSupportTicket(data: TicketFormData) {
    console.log(`[SUPPORT] Processing ticket from ${data.userId}`);

    const ticketId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const now = new Date().toISOString();

    const { error } = await supabaseAdmin.from('support_tickets').insert({
        id: ticketId,
        business_id: data.businessId,
        user_id: data.userId,
        subject: data.subject,
        status: 'OPEN',
        priority: data.priority,
        category: data.category,
        messages: [
            {
                id: messageId,
                ticket_id: ticketId,
                sender_id: data.userId,
                message_text: data.description,
                timestamp: now,
                is_internal: false
            }
        ],
        created_at: now,
        updated_at: now,
    });

    if (error) {
        console.error('[SUPPORT] Insert failed:', error);
        throw new Error('Failed to create support ticket');
    }

    const newTicket: SupportTicket = {
        id: ticketId,
        business_id: data.businessId,
        user_id: data.userId,
        subject: data.subject,
        status: 'OPEN',
        priority: data.priority,
        category: data.category,
        created_at: now,
        updated_at: now,
        messages: [
            {
                id: messageId,
                ticket_id: ticketId,
                sender_id: data.userId,
                message_text: data.description,
                timestamp: now,
                is_internal: false
            }
        ]
    };

    await sendEmailNotification(newTicket);

    return { success: true, ticketId };
}

export async function getUserTickets(userId: string) {
    const { data, error } = await supabaseAdmin
        .from('support_tickets')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[SUPPORT] Fetch tickets failed:', error);
        return [];
    }
    return (data || []) as SupportTicket[];
}

async function sendEmailNotification(ticket: SupportTicket) {
    const resend = getResend();

    // 1. Simulation Mode (No API Key)
    if (!resend) {
        console.log('--- [SIMULATION EMAIL] ---');
        console.log(`To: harrison@clicrapp.com`);
        console.log(`Subject: New Ticket: ${ticket.subject}`);
        console.log(`Message: ${ticket.messages[0].message_text}`);
        await new Promise(resolve => setTimeout(resolve, 500));
        return;
    }

    // 2. Real Email Mode (Resend)
    try {
        const { data, error } = await resend.emails.send({
            from: 'CLICR Support <onboarding@resend.dev>', // Use this for testing until you verify domain
            to: ['harrison@clicrapp.com'],
            subject: `[${ticket.priority}] ${ticket.subject}`,
            html: `
                <h1>New Support Ticket</h1>
                <p><strong>Category:</strong> ${ticket.category}</p>
                <p><strong>User:</strong> ${ticket.user_id} (${ticket.business_id})</p>
                <hr />
                <h2>${ticket.subject}</h2>
                <p style="white-space: pre-wrap;">${ticket.messages[0].message_text}</p>
                <hr />
                <p><a href="https://clicrapp.com/admin/tickets/${ticket.id}">View in Admin Dashboard</a></p>
            `
        });

        if (error) {
            console.error('Resend API Error:', error);
            throw new Error(error.message);
        }

        console.log(`[RESEND] Email sent successfully: ${data?.id}`);
    } catch (err) {
        console.error('Failed to send email via Resend:', err);
    }
}
