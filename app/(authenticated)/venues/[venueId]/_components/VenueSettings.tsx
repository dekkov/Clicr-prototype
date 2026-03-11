"use client";

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import { Venue } from '@/lib/types';

export default function VenueSettings({ venueId }: { venueId: string }) {
    const { venues, updateVenue } = useApp();
    const venue = venues.find(v => v.id === venueId);

    const [formData, setFormData] = useState<Partial<Venue>>(venue || {});

    if (!venue) return null;

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        await updateVenue({ ...venue, ...formData } as Venue);
        alert("Settings saved!");
    };

    return (
        <div className="max-w-2xl space-y-6">
            <h2 className="text-xl font-bold">Venue Settings</h2>

            <form onSubmit={handleSave} className="space-y-6">
                {/* General Info */}
                <div className="bg-card border border-border p-6 rounded-2xl space-y-4">
                    <h3 className="text-lg font-semibold text-foreground">General Information</h3>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Venue Name</label>
                        <input
                            type="text"
                            value={formData.name || ''}
                            onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Timezone</label>
                        <select
                            value={formData.timezone || 'America/New_York'}
                            onChange={e => setFormData(prev => ({ ...prev, timezone: e.target.value }))}
                            className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground"
                        >
                            <option value="America/New_York">Eastern Time (US & Canada)</option>
                            <option value="America/Chicago">Central Time (US & Canada)</option>
                            <option value="America/Denver">Mountain Time (US & Canada)</option>
                            <option value="America/Los_Angeles">Pacific Time (US & Canada)</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">City</label>
                            <input
                                type="text"
                                value={formData.city || ''}
                                onChange={e => setFormData(prev => ({ ...prev, city: e.target.value }))}
                                className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">State</label>
                            <input
                                type="text"
                                value={formData.state || ''}
                                onChange={e => setFormData(prev => ({ ...prev, state: e.target.value }))}
                                className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground"
                            />
                        </div>
                    </div>
                </div>

                {/* Status Toggle */}
                <div className="bg-card border border-border p-6 rounded-2xl flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-foreground">Venue Status</h3>
                        <p className="text-sm text-muted-foreground">Inactive venues are hidden from standard reports.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, status: prev.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }))}
                        className={`px-4 py-2 rounded-lg font-bold transition-colors ${formData.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-muted text-muted-foreground'}`}
                    >
                        {formData.status}
                    </button>
                </div>

                <div className="flex justify-end">
                    <button
                        type="submit"
                        className="px-8 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-bold transition-all shadow-lg shadow-primary/20"
                    >
                        Save Changes
                    </button>
                </div>
            </form>
        </div>
    );
}
