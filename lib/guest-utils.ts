import type { IDScanEvent } from '@/lib/types';

export function filterGuests(
  scans: IDScanEvent[],
  search: string,
  stateFilter: string
): IDScanEvent[] {
  const q = search.toLowerCase().trim();
  return scans.filter((scan) => {
    if (stateFilter !== 'ALL' && scan.issuing_state !== stateFilter) return false;
    if (q) {
      const nameMatch =
        (scan.first_name?.toLowerCase().includes(q)) ||
        (scan.last_name?.toLowerCase().includes(q));
      const idMatch = scan.id_number_last4?.includes(q);
      if (!nameMatch && !idMatch) return false;
    }
    return true;
  });
}
