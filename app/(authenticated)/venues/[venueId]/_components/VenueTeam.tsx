"use client";

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import { User, Role } from '@/lib/types';
import { Users, Plus, Trash2, Mail, Shield, User as UserIcon, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const ROLE_LABELS: Record<Role, string> = {
    OWNER: 'Org Owner', ADMIN: 'GM / Ops Admin', MANAGER: 'Door Manager',
    STAFF: 'Door Staff', ANALYST: 'Analyst',
};
const ROLE_DEFINITIONS = Object.fromEntries(
    Object.entries(ROLE_LABELS).map(([k, v]) => [k, { label: v }])
) as Record<Role, { label: string }>;

export default function VenueTeam({ venueId }: { venueId: string }) {
    const { users, addUser, updateUser, removeUser, business } = useApp(); // Assuming updateUser/removeUser will be added
    const [isInviting, setIsInviting] = useState(false);
    const [newItem, setNewItem] = useState({ name: '', email: '', role: 'STAFF' as Role });

    const venueUsers = users.filter(u =>
        (u.assigned_venue_ids && u.assigned_venue_ids.includes(venueId)) ||
        u.role === 'OWNER' ||
        u.role === 'ADMIN'
    );

    const handleInvite = async () => {
        if (!newItem.name || !newItem.email) return;

        const newUser: User = {
            id: `usr_${Math.random().toString(36).substr(2, 9)}`,
            name: newItem.name,
            email: newItem.email,
            role: newItem.role,
            assigned_venue_ids: [venueId],
            assigned_area_ids: [],
            assigned_clicr_ids: []
        };

        // If addUser is defined (it is)
        if (addUser) {
            await addUser(newUser);
        }

        setIsInviting(false);
        setNewItem({ name: '', email: '', role: 'STAFF' });
    };

    const handleRemove = async (userId: string) => {
        if (confirm("Are you sure you want to remove this user from the venue?")) {
            // Check if removeUser exists on store, if not implemented yet we will console log TODO
            if ((window as any).removeUser) {
                // Implement later in store
            } else {
                console.log("Remove user not yet implemented in store");
            }
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-white">Team Members</h2>
                    <p className="text-sm text-slate-400">Manage who has access to this venue.</p>
                </div>
                <button
                    onClick={() => setIsInviting(!isInviting)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors text-sm font-medium"
                >
                    <Plus className="w-4 h-4" />
                    Invite Member
                </button>
            </div>

            {isInviting && (
                <div className="bg-slate-900/50 border border-slate-700 p-4 rounded-xl flex flex-col md:flex-row gap-4 items-end animate-in fade-in slide-in-from-top-2">
                    <div className="w-full md:w-1/3">
                        <label className="text-xs text-slate-400 mb-1 block">Name</label>
                        <input
                            type="text"
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-primary outline-none"
                            placeholder="Jane Doe"
                            value={newItem.name}
                            onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                        />
                    </div>
                    <div className="w-full md:w-1/3">
                        <label className="text-xs text-slate-400 mb-1 block">Email</label>
                        <input
                            type="email"
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-primary outline-none"
                            placeholder="jane@example.com"
                            value={newItem.email}
                            onChange={e => setNewItem({ ...newItem, email: e.target.value })}
                        />
                    </div>
                    <div className="w-full md:w-1/4">
                        <label className="text-xs text-slate-400 mb-1 block">Role</label>
                        <select
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-primary outline-none"
                            value={newItem.role}
                            onChange={e => setNewItem({ ...newItem, role: e.target.value as Role })}
                        >
                            <option value="STAFF">Door Staff</option>
                            <option value="MANAGER">Door Manager</option>
                            <option value="ADMIN">GM / Ops Admin</option>
                            <option value="ANALYST">Analyst</option>
                        </select>
                    </div>
                    <button
                        onClick={handleInvite}
                        disabled={!newItem.name || !newItem.email}
                        className="p-2.5 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <Check className="w-5 h-5" />
                    </button>
                </div>
            )}

            <div className="grid gap-4">
                {venueUsers.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 bg-slate-900/30 rounded-xl border border-dashed border-slate-800">
                        <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>No team members assigned.</p>
                    </div>
                ) : (
                    venueUsers.map(user => (
                        <div key={user.id} className="flex items-center justify-between p-4 bg-slate-900/50 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors group">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-primary font-bold">
                                    {user.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <div className="font-medium text-white flex items-center gap-2">
                                        {user.name}
                                        {user.role === 'OWNER' && <span className="text-[10px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/20">OWNER</span>}
                                        {user.role === 'ADMIN' && <span className="text-[10px] bg-purple-500/10 text-purple-500 px-1.5 py-0.5 rounded border border-purple-500/20">ADMIN</span>}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-slate-400">
                                        <Mail className="w-3 h-3" /> {user.email}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-6">
                                <div className="text-sm text-slate-400 hidden md:block">
                                    {ROLE_DEFINITIONS[user.role as Role]?.label ?? user.role}
                                </div>
                                {user.role !== 'OWNER' && (
                                    <button
                                        className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                        title="Remove from venue"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
