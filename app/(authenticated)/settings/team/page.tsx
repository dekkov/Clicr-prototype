"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Shield, Plus, Mail, MoreHorizontal, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/lib/store';

// Mock Roles for Simulation (Schema matches Supabase 'user_role')
type UserRole = 'OWNER' | 'MANAGER' | 'STAFF' | 'VIEWER';

const ROLE_DEFINITIONS: Record<UserRole, { label: string; description: string; color: string }> = {
    OWNER: { label: 'Owner', description: 'Full access to billing, business settings, and data.', color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
    MANAGER: { label: 'Manager', description: 'Can manage venues, staff, bans, and overrides.', color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
    STAFF: { label: 'Door Staff', description: 'Can run scans, counts, and view simple stats.', color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
    VIEWER: { label: 'Viewer', description: 'Read-only access to reports and dashboards.', color: 'text-slate-400 bg-slate-400/10 border-slate-400/20' }
};

export default function TeamSettingsPage() {
    const { users, addUser, removeUser } = useApp();

    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<UserRole>('STAFF');

    const handleInvite = (e: React.FormEvent) => {
        e.preventDefault();
        const newUser = {
            id: `usr_${Date.now()}`,
            name: '',
            email: inviteEmail,
            role: inviteRole as UserRole,
            assigned_venue_ids: [],
            assigned_area_ids: [],
            assigned_clicr_ids: [],
        };
        addUser(newUser);
        setShowInviteModal(false);
        setInviteEmail('');
    };

    const handleRemoveUser = (userId: string) => {
        if (confirm('Are you sure you want to remove this user?')) {
            removeUser(userId);
        }
    };

    return (
        <div className="p-6 space-y-6 max-w-5xl mx-auto">

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
                        <Users className="w-8 h-8 text-primary" />
                        Team & Permissions
                    </h1>
                    <p className="text-slate-400 max-w-2xl">
                        Manage who has access to your business. Assign roles to control viewing sensitive data, banning guests, and changing venue capacity.
                    </p>
                </div>
                <button
                    onClick={() => setShowInviteModal(true)}
                    className="flex items-center gap-2 px-6 py-3 bg-primary text-black font-bold rounded-xl hover:bg-emerald-400 transition-colors shadow-lg shadow-primary/20"
                >
                    <Plus className="w-5 h-5" />
                    Invite Member
                </button>
            </div>

            {/* Roles Explanation (Optional / Collapsible) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {Object.entries(ROLE_DEFINITIONS).map(([key, def]) => (
                    <div key={key} className={cn("p-4 rounded-xl border flex flex-col gap-2", def.color.replace('text-', 'border-opacity-30 border-'))}>
                        <span className={cn("text-xs font-bold uppercase tracking-widest px-2 py-1 rounded inline-block w-fit", def.color)}>
                            {def.label}
                        </span>
                        <p className="text-xs text-slate-400 leading-relaxed">
                            {def.description}
                        </p>
                    </div>
                ))}
            </div>

            {/* Users List */}
            <div className="bg-[#1e2330]/50 border border-white/5 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-sm">
                <div className="grid grid-cols-[2fr,1.5fr,1fr,0.5fr] gap-4 p-4 border-b border-white/5 text-xs font-bold text-slate-500 uppercase tracking-widest">
                    <div>User</div>
                    <div>Role</div>
                    <div>Status</div>
                    <div></div>
                </div>

                <div className="divide-y divide-white/5">
                    {users.map(user => (
                        <div key={user.id} className="grid grid-cols-[2fr,1.5fr,1fr,0.5fr] gap-4 p-4 items-center hover:bg-white/5 transition-colors group">

                            {/* User Info */}
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-white/10 flex items-center justify-center font-bold text-white">
                                    {user.name ? user.name.charAt(0) : user.email.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex flex-col">
                                    {user.name && <span className="font-bold text-white">{user.name}</span>}
                                    <span className="text-sm text-slate-400 font-mono">{user.email}</span>
                                </div>
                            </div>

                            {/* Role Badge */}
                            <div>
                                <span className={cn(
                                    "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide",
                                    ROLE_DEFINITIONS[user.role as UserRole]?.color ?? 'text-slate-400'
                                )}>
                                    {ROLE_DEFINITIONS[user.role as UserRole]?.label ?? user.role}
                                </span>
                            </div>

                            {/* Status */}
                            <div>
                                <span className="flex items-center gap-2 text-emerald-500 text-xs font-bold uppercase tracking-widest">
                                    <CheckCircle2 className="w-4 h-4" /> Active
                                </span>
                            </div>

                            {/* Actions */}
                            <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => handleRemoveUser(user.id)}
                                    className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* INVITE MODAL */}
            <AnimatePresence>
                {showInviteModal && (
                    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-6">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-[#1e2330] border border-slate-700 rounded-3xl w-full max-w-md p-8 shadow-2xl relative"
                        >
                            <button
                                onClick={() => setShowInviteModal(false)}
                                className="absolute top-6 right-6 text-slate-500 hover:text-white"
                            >
                                <XCircle className="w-6 h-6" />
                            </button>

                            <h2 className="text-2xl font-bold text-white mb-6">Invite Team Member</h2>

                            <form onSubmit={handleInvite} className="space-y-6">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Email Address</label>
                                    <input
                                        autoFocus
                                        type="email"
                                        required
                                        value={inviteEmail}
                                        onChange={(e) => setInviteEmail(e.target.value)}
                                        placeholder="colleague@example.com"
                                        className="w-full bg-black/50 border border-slate-700 rounded-xl p-4 text-white placeholder:text-slate-600 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary mt-2"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Assign Role</label>
                                    <div className="grid grid-cols-1 gap-3 mt-2">
                                        {(['MANAGER', 'STAFF', 'VIEWER'] as UserRole[]).map(role => (
                                            <button
                                                key={role}
                                                type="button"
                                                onClick={() => setInviteRole(role)}
                                                className={cn(
                                                    "flex items-center justify-between p-4 rounded-xl border text-left transition-all",
                                                    inviteRole === role
                                                        ? "bg-primary/10 border-primary"
                                                        : "bg-slate-800 border-white/5 hover:bg-slate-700"
                                                )}
                                            >
                                                <div>
                                                    <div className={cn("font-bold text-sm", inviteRole === role ? "text-primary" : "text-white")}>
                                                        {ROLE_DEFINITIONS[role].label}
                                                    </div>
                                                    <div className="text-xs text-slate-500 mt-1">{ROLE_DEFINITIONS[role].description}</div>
                                                </div>
                                                {inviteRole === role && <CheckCircle2 className="w-5 h-5 text-primary" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    className="w-full py-4 bg-primary text-black font-bold rounded-xl hover:bg-emerald-400 transition-colors shadow-lg shadow-primary/20"
                                >
                                    Send Invite
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
