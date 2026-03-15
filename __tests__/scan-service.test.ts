import { findMatchingBan, evaluateScan, getAgeBand } from '@/lib/scan-service';
import type { ParsedID } from '@/lib/aamva';
import type { BannedPerson, PatronBan } from '@/lib/types';

const makeParsedID = (overrides: Partial<ParsedID> = {}): ParsedID => ({
  firstName: 'JOHN',
  lastName: 'DOE',
  dateOfBirth: '19900115',
  sex: 'M',
  postalCode: '90210',
  expirationDate: '20280101',
  age: 34,
  isExpired: false,
  addressStreet: '123 Main',
  city: 'LA',
  state: 'CA',
  eyeColor: null,
  hairColor: null,
  height: null,
  weight: null,
  idNumber: 'D1234567',
  ...overrides,
});

const makePatron = (overrides: Partial<BannedPerson> = {}): BannedPerson => ({
  id: 'patron-1',
  business_id: 'biz-1',
  first_name: 'JOHN',
  last_name: 'DOE',
  date_of_birth: '19900115',
  id_type: 'DRIVERS_LICENSE',
  id_number_last4: '4567',
  id_number_full: 'D1234567',
  issuing_state_or_country: 'CA',
  aliases: [],
  notes_private: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
} as BannedPerson);

const makeBan = (overrides: Partial<PatronBan> = {}): PatronBan => ({
  id: 'ban-1',
  banned_person_id: 'patron-1',
  business_id: 'biz-1',
  status: 'ACTIVE',
  ban_type: 'PERMANENT',
  start_datetime: new Date().toISOString(),
  end_datetime: null,
  reason_category: 'Violence',
  reason_notes: null,
  incident_report_number: null,
  applies_to_all_locations: true,
  location_ids: [],
  created_by_user_id: 'user-1',
  removed_by_user_id: null,
  removed_reason: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
} as PatronBan);

describe('findMatchingBan', () => {
  test('finds ban by strict ID match (idNumber + state)', () => {
    const patron = makePatron();
    const ban = makeBan();
    const result = findMatchingBan(makeParsedID(), [patron], [ban], 'venue-1');
    expect(result.patron).toBe(patron);
    expect(result.ban).toBe(ban);
  });

  test('falls back to fuzzy match (name + DOB)', () => {
    const patron = makePatron({ id_number_full: 'DIFFERENT' });
    const ban = makeBan();
    const parsedId = makeParsedID({ idNumber: 'X9999999' });
    const result = findMatchingBan(parsedId, [patron], [ban], 'venue-1');
    expect(result.patron).toBe(patron);
    expect(result.ban).toBe(ban);
  });

  test('returns empty when no match found', () => {
    const patron = makePatron({
      first_name: 'JANE',
      id_number_full: 'DIFFERENT',
      date_of_birth: '20000101',
    });
    const ban = makeBan();
    const result = findMatchingBan(makeParsedID(), [patron], [ban], 'venue-1');
    expect(result.patron).toBeUndefined();
    expect(result.ban).toBeUndefined();
  });

  test('respects venue-scoped bans', () => {
    const patron = makePatron();
    const ban = makeBan({
      applies_to_all_locations: false,
      location_ids: ['venue-2'],
    });
    const result = findMatchingBan(makeParsedID(), [patron], [ban], 'venue-1');
    expect(result.ban).toBeUndefined();
  });

  test('matches venue-scoped ban when venue matches', () => {
    const patron = makePatron();
    const ban = makeBan({
      applies_to_all_locations: false,
      location_ids: ['venue-1'],
    });
    const result = findMatchingBan(makeParsedID(), [patron], [ban], 'venue-1');
    expect(result.ban).toBe(ban);
  });

  test('ignores inactive bans', () => {
    const patron = makePatron();
    const ban = makeBan({ status: 'REMOVED' });
    const result = findMatchingBan(makeParsedID(), [patron], [ban], 'venue-1');
    expect(result.ban).toBeUndefined();
  });

  test('case-insensitive name matching in fuzzy mode', () => {
    const patron = makePatron({ id_number_full: 'NOMATCH', first_name: 'john', last_name: 'doe' });
    const ban = makeBan();
    const parsedId = makeParsedID({ idNumber: null, firstName: 'JOHN', lastName: 'DOE' });
    const result = findMatchingBan(parsedId, [patron], [ban], 'venue-1');
    expect(result.patron).toBe(patron);
  });
});

describe('evaluateScan', () => {
  test('returns ERROR when age is null', () => {
    const result = evaluateScan(makeParsedID({ age: null }), [], [], 'venue-1');
    expect(result.status).toBe('ERROR');
    expect(result.message).toBe('READ ERROR');
  });

  test('denies underage patrons', () => {
    const result = evaluateScan(makeParsedID({ age: 19 }), [], [], 'venue-1');
    expect(result.status).toBe('DENIED');
    expect(result.message).toContain('UNDERAGE');
    expect(result.message).toContain('19');
  });

  test('denies expired IDs', () => {
    const result = evaluateScan(makeParsedID({ isExpired: true }), [], [], 'venue-1');
    expect(result.status).toBe('DENIED');
    expect(result.message).toBe('EXPIRED ID');
  });

  test('denies banned patrons', () => {
    const patron = makePatron();
    const ban = makeBan({ reason_category: 'Theft' });
    const result = evaluateScan(makeParsedID(), [patron], [ban], 'venue-1');
    expect(result.status).toBe('DENIED');
    expect(result.message).toContain('BANNED');
    expect(result.message).toContain('Theft');
    expect(result.patron).toBe(patron);
    expect(result.activeBan).toBe(ban);
  });

  test('accepts valid ID with no bans', () => {
    const result = evaluateScan(makeParsedID(), [], [], 'venue-1');
    expect(result.status).toBe('ACCEPTED');
    expect(result.message).toBe('Entry Allowed');
    expect(result.age).toBe(34);
  });

  test('checks age before expiration before bans (priority order)', () => {
    const patron = makePatron();
    const ban = makeBan();
    // Age < 21 should trigger BEFORE expired check
    const result = evaluateScan(
      makeParsedID({ age: 18, isExpired: true }),
      [patron], [ban], 'venue-1'
    );
    expect(result.status).toBe('DENIED');
    expect(result.message).toContain('UNDERAGE');
  });

  test('exactly 21 is accepted', () => {
    const result = evaluateScan(makeParsedID({ age: 21 }), [], [], 'venue-1');
    expect(result.status).toBe('ACCEPTED');
  });
});

describe('getAgeBand', () => {
  test.each([
    [15, 'Under 18'],
    [17, 'Under 18'],
    [18, '18-20'],
    [20, '18-20'],
    [21, '21-24'],
    [24, '21-24'],
    [25, '25-29'],
    [29, '25-29'],
    [30, '30-39'],
    [39, '30-39'],
    [40, '40+'],
    [65, '40+'],
  ])('age %i → %s', (age, expected) => {
    expect(getAgeBand(age)).toBe(expected);
  });
});
