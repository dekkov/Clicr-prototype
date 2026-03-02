import type { Role } from './types';

const ROLE_RANK: Record<Role, number> = {
    OWNER: 5,
    ADMIN: 4,
    MANAGER: 3,
    STAFF: 2,
    ANALYST: 1,
};

export type NavItemDef = { label: string; href: string; icon: any };

export function hasMinRole(userRole: Role | undefined, minRole: Role): boolean {
    if (!userRole) return false;
    return ROLE_RANK[userRole] >= ROLE_RANK[minRole];
}

export function getVisibleNavItems(role: Role | undefined, allItems: NavItemDef[]): NavItemDef[] {
    if (!role) return [];
    if (role === 'ANALYST') return allItems.filter(i => i.label === 'Reports');
    if (role === 'STAFF') return allItems.filter(i => ['Areas', 'Clicrs'].includes(i.label));
    if (role === 'MANAGER') return allItems.filter(i => i.label !== 'Settings');
    return allItems;
}

export function getScopeSelectorType(role: Role | undefined, assignedVenueCount: number): 'business' | 'venue' | 'none' {
    if (!role) return 'none';
    if (role === 'MANAGER' && assignedVenueCount > 0) return 'venue';
    if (['OWNER', 'ADMIN', 'ANALYST'].includes(role)) return 'business';
    return 'none';
}

export function canManageSettings(role: Role | undefined): boolean {
    return hasMinRole(role, 'ADMIN');
}

export function canManageTeam(role: Role | undefined): boolean {
    return hasMinRole(role, 'ADMIN');
}

export function canEditVenuesAndAreas(role: Role | undefined): boolean {
    return hasMinRole(role, 'MANAGER');
}

export function canManageBans(role: Role | undefined): boolean {
    return hasMinRole(role, 'MANAGER');
}

export function canStartShift(role: Role | undefined): boolean {
    return hasMinRole(role, 'MANAGER');
}

/** Staff cannot add Clicrs; Manager, Admin, Owner can. */
export function canAddClicr(role: Role | undefined): boolean {
    return hasMinRole(role, 'MANAGER');
}

/** Manager cannot add venues; only Admin and Owner can. */
export function canAddVenue(role: Role | undefined): boolean {
    return hasMinRole(role, 'ADMIN');
}
