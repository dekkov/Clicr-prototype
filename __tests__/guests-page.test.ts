import { filterGuests } from '@/lib/guest-utils';
import type { IDScanEvent } from '@/lib/types';

const mockScans: Partial<IDScanEvent>[] = [
  { id: '1', first_name: 'John', last_name: 'Doe', age: 25, id_number_last4: '4521', issuing_state: 'TX', scan_result: 'ACCEPTED', timestamp: Date.now() },
  { id: '2', first_name: 'Jane', last_name: 'Smith', age: 22, id_number_last4: '7890', issuing_state: 'CA', scan_result: 'DENIED', timestamp: Date.now() },
  { id: '3', first_name: 'Bob', last_name: 'Jones', age: 30, id_number_last4: '1234', issuing_state: 'TX', scan_result: 'ACCEPTED', timestamp: Date.now() },
];

describe('filterGuests', () => {
  test('returns all scans when no filters', () => {
    const result = filterGuests(mockScans as IDScanEvent[], '', 'ALL');
    expect(result).toHaveLength(3);
  });
  test('filters by name (case-insensitive)', () => {
    const result = filterGuests(mockScans as IDScanEvent[], 'john', 'ALL');
    expect(result).toHaveLength(1);
    expect(result[0].first_name).toBe('John');
  });
  test('filters by last 4 digits', () => {
    const result = filterGuests(mockScans as IDScanEvent[], '7890', 'ALL');
    expect(result).toHaveLength(1);
    expect(result[0].last_name).toBe('Smith');
  });
  test('filters by state', () => {
    const result = filterGuests(mockScans as IDScanEvent[], '', 'TX');
    expect(result).toHaveLength(2);
  });
  test('combines search and state filter', () => {
    const result = filterGuests(mockScans as IDScanEvent[], 'doe', 'TX');
    expect(result).toHaveLength(1);
  });
});
