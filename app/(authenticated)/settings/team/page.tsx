"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
    ArrowLeft,
    Plus,
    CheckCircle2,
    Clock,
    XCircle,
    Loader2,
    MoreVertical,
    Crown,
    User,
    Shield,
    BarChart3,
    Trash2,
    Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/lib/store';
import { Role } from '@/lib/types';
import { inviteTeamMember, removeTeamMember, getTeamMembers, updateMemberRole, updateMemberAssignments } from '../team-actions';

const ROLE_DEFINITIONS: Record<Role, { label: string; icon: React.ElementType; color: string }> = {
    OWNER: { label: 'Owner', icon: Crown, color: 'text-amber-400 bg-amber-400/10 border-amber-400/30' },
    ADMIN: { label: 'GM / Ops Admin', icon: Shield, color: 'text-blue-400 bg-blue-400/10 border-blue-400/30' },
    MANAGER: { label: 'Door Manager', icon: User, color: 'text-amber-400 bg-amber-400/10 border-amber-400/30' },
    STAFF: { label: 'Door Staff', icon: User, color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30' },
    ANALYST: { label: 'Analyst', icon: BarChart3, color: 'text-slate-400 bg-slate-400/10 border-slate-400/30' },
};

type TeamMember = {
    id: string;
    email: string;
    name: string;
    role: Role;
    joinedAt: string;
    isConfirmed: boolean;
    assignedVenueIds?: string[];
    assignedAreaIds?: string[];
};

function getInitials(name: string, email: string): string {
    if (name?.trim()) {
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return parts[0][0].toUpperCase();
    }
    if (email?.trim()) return email[0].toUpperCase();
    return '??';
}

export default function TeamSettingsPage() {
    const { activeBusiness, venues, areas } = useApp();

    const [members, setMembers] = useState<TeamMember[]>([]);
    const [isLoadingMembers, setIsLoadingMembers] = useState(true);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<Role>('STAFF');
    const [inviteVenueIds, setInviteVenueIds] = useState<string[]>([]);
    const [inviteAreaIds, setInviteAreaIds] = useState<string[]>([]);
    const [isInviting, setIsInviting] = useState(false);
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [openKebabId, setOpenKebabId] = useState<string | null>(null);
    const [editMember, setEditMember] = useState<TeamMember | null>(null);
    const [editRole, setEditRole] = useState<Role>('STAFF');
    const [editVenueIds, setEditVenueIds] = useState<string[]>([]);
    const [editAreaIds, setEditAreaIds] = useState<string[]>([]);
    const [isUpdating, setIsUpdating] = useState(false);

    const loadMembers = useCallback(async () => {
        if (!activeBusiness) return;
        setIsLoadingMembers(true);
        const data = await getTeamMembers(activeBusiness.id);
        setMembers(data);
        setIsLoadingMembers(false);
    }, [activeBusiness]);

    useEffect(() => {
        loadMembers();
    }, [loadMembers]);

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeBusiness) return;
        setIsInviting(true);
        setInviteError(null);

        const options =
            inviteRole === 'MANAGER' && inviteVenueIds.length > 0
                ? { assignedVenueIds: inviteVenueIds }
                : inviteRole === 'STAFF' && inviteAreaIds.length > 0
                  ? { assignedAreaIds: inviteAreaIds }
                  : undefined;

        const result = await inviteTeamMember(inviteEmail, inviteRole, activeBusiness.id, options);

        if (!result.success) {
            setInviteError(result.error);
            setIsInviting(false);
            return;
        }

        setShowInviteModal(false);
        setInviteEmail('');
        setInviteRole('STAFF');
        setInviteVenueIds([]);
        setInviteAreaIds([]);
        setIsInviting(false);
        loadMembers();
    };

    const handleRemoveUser = async (userId: string) => {
        if (!activeBusiness) return;
        if (!confirm('Are you sure you want to remove this member?')) return;

        const result = await removeTeamMember(userId, activeBusiness.id);
        if (result.success) {
            setMembers(prev => prev.filter(m => m.id !== userId));
        }
        setOpenKebabId(null);
    };

    if (!activeBusiness) {
        return (
            <div className="p-6 text-center text-slate-400">
                Select a business to manage team members.
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Link
                        href="/settings"
                        className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
                        aria-label="Back to settings"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Team</h1>
                        <p className="text-sm text-slate-400 mt-0.5">Manage team members and access roles.</p>
                    </div>
                </div>
                <button
                    onClick={() => setShowInviteModal(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-90 transition-opacity shrink-0"
                >
                    <Plus className="w-4 h-4" />
                    Add Member
                </button>
            </div>

            {/* Member cards */}
            <div className="space-y-3">
                {isLoadingMembers ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    </div>
                ) : members.length === 0 ? (
                    <div className="p-12 text-center text-slate-500 text-sm rounded-xl border border-border/50 bg-card/30">
                        No team members yet. Invite someone to get started.
                    </div>
                ) : (
                    members.map(member => {
                        const def = ROLE_DEFINITIONS[member.role];
                        const Icon = def?.icon ?? User;
                        const isKebabOpen = openKebabId === member.id;

                        return (
                            <motion.div
                                key={member.id}
                                layout
                                className="flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-card/30 hover:bg-card/50 transition-colors"
                            >
                                {/* Avatar */}
                                <div className="w-12 h-12 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
                                    <span className="text-sm font-bold text-primary">
                                        {getInitials(member.name, member.email)}
                                    </span>
                                </div>

                                {/* Name + email */}
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-white truncate">
                                        {member.name || member.email.split('@')[0]}
                                    </p>
                                    <p className="text-sm text-slate-400 truncate">{member.email}</p>
                                </div>

                                {/* Role badge */}
                                <span
                                    className={cn(
                                        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border shrink-0",
                                        def?.color ?? 'text-slate-400 bg-slate-400/10'
                                    )}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    {def?.label ?? member.role}
                                </span>

                                {/* Status (compact) */}
                                <span className="shrink-0 text-xs text-slate-500">
                                    {member.isConfirmed ? (
                                        <span className="flex items-center gap-1 text-emerald-500">
                                            <CheckCircle2 className="w-3.5 h-3.5" /> Active
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-amber-500">
                                            <Clock className="w-3.5 h-3.5" /> Pending
                                        </span>
                                    )}
                                </span>

                                {/* Kebab menu (non-owners only) */}
                                {member.role !== 'OWNER' && (
                                    <div className="relative shrink-0">
                                        <button
                                            onClick={() => setOpenKebabId(isKebabOpen ? null : member.id)}
                                            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
                                            aria-label="Options"
                                        >
                                            <MoreVertical className="w-4 h-4" />
                                        </button>
                                        <AnimatePresence>
                                            {isKebabOpen && (
                                                <>
                                                    <div
                                                        className="fixed inset-0 z-40"
                                                        onClick={() => setOpenKebabId(null)}
                                                        aria-hidden="true"
                                                    />
                                                    <motion.div
                                                        initial={{ opacity: 0, scale: 0.95 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        exit={{ opacity: 0, scale: 0.95 }}
                                                        className="absolute right-0 top-full mt-1 z-50 w-48 py-1 rounded-lg bg-card border border-border shadow-xl"
                                                    >
                                                        <button
                                                            onClick={() => {
                                                                setOpenKebabId(null);
                                                                setEditMember(member);
                                                                setEditRole(member.role);
                                                                setEditVenueIds(member.assignedVenueIds ?? []);
                                                                setEditAreaIds(member.assignedAreaIds ?? []);
                                                            }}
                                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800/60 hover:text-white"
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                            Edit
                                                        </button>
                                                        <div className="border-t border-border/50 my-1" />
                                                        <button
                                                            onClick={() => handleRemoveUser(member.id)}
                                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                            Remove
                                                        </button>
                                                    </motion.div>
                                                </>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}
                            </motion.div>
                        );
                    })
                )}
            </div>

            {/* Invite modal */}
            <AnimatePresence>
                {showInviteModal && (
                    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-6">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-card border border-border rounded-2xl w-full max-w-md p-8 shadow-2xl relative"
                        >
                            <button
                                onClick={() => { setShowInviteModal(false); setInviteError(null); }}
                                className="absolute top-6 right-6 text-slate-500 hover:text-white"
                            >
                                <XCircle className="w-6 h-6" />
                            </button>

                            <h2 className="text-xl font-bold text-white mb-6">Invite Team Member</h2>

                            {inviteError && (
                                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                                    {inviteError}
                                </div>
                            )}

                            <form onSubmit={handleInvite} className="space-y-6">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Email</label>
                                    <input
                                        autoFocus
                                        type="email"
                                        required
                                        value={inviteEmail}
                                        onChange={(e) => setInviteEmail(e.target.value)}
                                        placeholder="colleague@example.com"
                                        className="w-full bg-background/50 border border-border rounded-xl p-3 text-white placeholder:text-slate-600 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary mt-2"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Role</label>
                                    <div className="grid grid-cols-1 gap-2 mt-2">
                                        {(['ADMIN', 'MANAGER', 'STAFF', 'ANALYST'] as Role[]).map(role => (
                                            <button
                                                key={role}
                                                type="button"
                                                onClick={() => {
                                                    setInviteRole(role);
                                                    if (role !== 'MANAGER') setInviteVenueIds([]);
                                                    if (role !== 'STAFF') setInviteAreaIds([]);
                                                }}
                                                className={cn(
                                                    "flex items-center justify-between p-3 rounded-xl border text-left transition-all",
                                                    inviteRole === role
                                                        ? "bg-primary/10 border-primary"
                                                        : "bg-background/30 border-border hover:bg-slate-800/60"
                                                )}
                                            >
                                                <span className={cn("font-medium text-sm", inviteRole === role ? "text-primary" : "text-white")}>
                                                    {ROLE_DEFINITIONS[role].label}
                                                </span>
                                                {inviteRole === role && <CheckCircle2 className="w-4 h-4 text-primary" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {inviteRole === 'MANAGER' && (
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Assign Venues</label>
                                        <p className="text-xs text-slate-500 mt-1 mb-2">Select which venues this manager can access.</p>
                                        <div className="max-h-40 overflow-y-auto space-y-2 mt-2">
                                            {venues.filter(v => v.business_id === activeBusiness.id).map(venue => (
                                                <label
                                                    key={venue.id}
                                                    className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-slate-800/40 cursor-pointer"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={inviteVenueIds.includes(venue.id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) setInviteVenueIds(prev => [...prev, venue.id]);
                                                            else setInviteVenueIds(prev => prev.filter(id => id !== venue.id));
                                                        }}
                                                        className="rounded border-border"
                                                    />
                                                    <span className="text-sm text-white">{venue.name}</span>
                                                </label>
                                            ))}
                                            {venues.filter(v => v.business_id === activeBusiness.id).length === 0 && (
                                                <p className="text-xs text-slate-500">No venues yet. Add venues in Venues settings first.</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {inviteRole === 'STAFF' && (
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Assign Areas</label>
                                        <p className="text-xs text-slate-500 mt-1 mb-2">Select which areas this staff member can access.</p>
                                        <div className="max-h-40 overflow-y-auto space-y-2 mt-2">
                                            {areas.filter(a => venues.some(v => v.id === a.venue_id && v.business_id === activeBusiness.id)).map(area => (
                                                <label
                                                    key={area.id}
                                                    className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-slate-800/40 cursor-pointer"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={inviteAreaIds.includes(area.id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) setInviteAreaIds(prev => [...prev, area.id]);
                                                            else setInviteAreaIds(prev => prev.filter(id => id !== area.id));
                                                        }}
                                                        className="rounded border-border"
                                                    />
                                                    <span className="text-sm text-white">{area.name}</span>
                                                </label>
                                            ))}
                                            {areas.filter(a => venues.some(v => v.id === a.venue_id && v.business_id === activeBusiness.id)).length === 0 && (
                                                <p className="text-xs text-slate-500">No areas yet. Add venues and areas first.</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isInviting}
                                    className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isInviting ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
                                    ) : (
                                        'Send Invite'
                                    )}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Edit member modal (role + assignments together) */}
            <AnimatePresence>
                {editMember && activeBusiness && editMember.role !== 'OWNER' && (
                    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-6">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-card border border-border rounded-2xl w-full max-w-md p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto"
                        >
                            <button
                                onClick={() => { setEditMember(null); }}
                                className="absolute top-6 right-6 text-slate-500 hover:text-white"
                            >
                                <XCircle className="w-6 h-6" />
                            </button>
                            <h2 className="text-xl font-bold text-white mb-2">Edit member</h2>
                            <p className="text-sm text-slate-400 mb-6">{editMember.name || editMember.email}</p>

                            <div className="space-y-6">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Role</label>
                                    <div className="grid grid-cols-1 gap-2 mt-2">
                                        {(['ADMIN', 'MANAGER', 'STAFF', 'ANALYST'] as Role[]).map(role => (
                                            <button
                                                key={role}
                                                type="button"
                                                onClick={() => {
                                                    setEditRole(role);
                                                    if (role !== 'MANAGER') setEditVenueIds([]);
                                                    if (role !== 'STAFF') setEditAreaIds([]);
                                                }}
                                                className={cn(
                                                    "flex items-center justify-between p-3 rounded-xl border text-left transition-all",
                                                    editRole === role ? "bg-primary/10 border-primary" : "bg-background/30 border-border hover:bg-slate-800/60"
                                                )}
                                            >
                                                <span className={cn("font-medium text-sm", editRole === role ? "text-primary" : "text-white")}>
                                                    {ROLE_DEFINITIONS[role].label}
                                                </span>
                                                {editRole === role && <CheckCircle2 className="w-4 h-4 text-primary" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {editRole === 'MANAGER' && (
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Assign Venues</label>
                                        <p className="text-xs text-slate-500 mt-1 mb-2">Select which venues this manager can access.</p>
                                        <div className="max-h-40 overflow-y-auto space-y-2 mt-2">
                                            {venues.filter(v => v.business_id === activeBusiness.id).map(venue => (
                                                <label key={venue.id} className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-slate-800/40 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={editVenueIds.includes(venue.id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) setEditVenueIds(prev => [...prev, venue.id]);
                                                            else setEditVenueIds(prev => prev.filter(id => id !== venue.id));
                                                        }}
                                                        className="rounded border-border"
                                                    />
                                                    <span className="text-sm text-white">{venue.name}</span>
                                                </label>
                                            ))}
                                            {venues.filter(v => v.business_id === activeBusiness.id).length === 0 && (
                                                <p className="text-xs text-slate-500">No venues yet.</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {editRole === 'STAFF' && (
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Assign Areas</label>
                                        <p className="text-xs text-slate-500 mt-1 mb-2">Select which areas this staff member can access.</p>
                                        <div className="max-h-40 overflow-y-auto space-y-2 mt-2">
                                            {areas.filter(a => venues.some(v => v.id === a.venue_id && v.business_id === activeBusiness.id)).map(area => (
                                                <label key={area.id} className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-slate-800/40 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={editAreaIds.includes(area.id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) setEditAreaIds(prev => [...prev, area.id]);
                                                            else setEditAreaIds(prev => prev.filter(id => id !== area.id));
                                                        }}
                                                        className="rounded border-border"
                                                    />
                                                    <span className="text-sm text-white">{area.name}</span>
                                                </label>
                                            ))}
                                            {areas.filter(a => venues.some(v => v.id === a.venue_id && v.business_id === activeBusiness.id)).length === 0 && (
                                                <p className="text-xs text-slate-500">No areas yet.</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={async () => {
                                        if (!editMember) return;
                                        setIsUpdating(true);
                                        const roleResult = editRole !== editMember.role
                                            ? await updateMemberRole(editMember.id, activeBusiness.id, editRole)
                                            : { success: true };
                                        if (!roleResult.success) {
                                            setIsUpdating(false);
                                            return;
                                        }
                                        const assignOpts =
                                            editRole === 'MANAGER' ? { assignedVenueIds: editVenueIds, assignedAreaIds: [] } :
                                            editRole === 'STAFF' ? { assignedVenueIds: [], assignedAreaIds: editAreaIds } :
                                            { assignedVenueIds: [], assignedAreaIds: [] };
                                        const assignResult = await updateMemberAssignments(editMember.id, activeBusiness.id, assignOpts);
                                        setIsUpdating(false);
                                        if (roleResult.success && assignResult.success) {
                                            setMembers(prev => prev.map(m =>
                                                m.id === editMember.id
                                                    ? { ...m, role: editRole, assignedVenueIds: editVenueIds, assignedAreaIds: editAreaIds }
                                                    : m
                                            ));
                                            setEditMember(null);
                                        }
                                    }}
                                    disabled={isUpdating}
                                    className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isUpdating ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Save changes'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
