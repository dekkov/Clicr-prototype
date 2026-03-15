import { canAccessRoute, getVisibleNavItems, hasMinRole } from '@/lib/permissions';

const ALL_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF', 'ANALYST'] as const;

describe('Guest Directory permissions', () => {
  test.each(ALL_ROLES)('%s can access /guests route', (role) => {
    expect(canAccessRoute(role, '/guests')).toBe(true);
  });

  test.each(ALL_ROLES)('%s sees Guests in nav items', (role) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NAV_ITEMS } = require('@/components/layout/AppLayout');
    const visible = getVisibleNavItems(role, NAV_ITEMS);
    const labels = visible.map((item: { label: string }) => item.label);
    expect(labels).toContain('Guests');
  });
});
