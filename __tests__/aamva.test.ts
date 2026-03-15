import { parseAAMVA, type ParsedID } from '@/lib/aamva';

describe('parseAAMVA', () => {
  const buildBarcode = (fields: Record<string, string>): string =>
    Object.entries(fields).map(([code, val]) => `${code}${val}`).join('\n');

  test('parses standard AAMVA barcode with all fields', () => {
    const data = buildBarcode({
      'DCS': 'SMITH',
      'DAC': 'JOHN',
      'DBB': '19900115',
      'DBC': '1',
      'DAK': '90210',
      'DBA': '20280101',
      'DAG': '123 Main St',
      'DAI': 'Los Angeles',
      'DAJ': 'CA',
      'DAY': 'BRN',
      'DAZ': 'BLK',
      'DAU': '510',
      'DAW': '180',
      'DAQ': 'D1234567',
    });

    const result = parseAAMVA(data);
    expect(result.firstName).toBe('JOHN');
    expect(result.lastName).toBe('SMITH');
    expect(result.dateOfBirth).toBe('19900115');
    expect(result.sex).toBe('M');
    expect(result.postalCode).toBe('90210');
    expect(result.expirationDate).toBe('20280101');
    expect(result.isExpired).toBe(false);
    expect(result.addressStreet).toBe('123 Main St');
    expect(result.city).toBe('Los Angeles');
    expect(result.state).toBe('CA');
    expect(result.eyeColor).toBe('BRN');
    expect(result.hairColor).toBe('BLK');
    expect(result.height).toBe('510');
    expect(result.weight).toBe('180');
    expect(result.idNumber).toBe('D1234567');
  });

  test('handles MMDDYYYY date format for DOB', () => {
    const data = buildBarcode({
      'DCS': 'DOE',
      'DAC': 'JANE',
      'DBB': '01151990',  // MMDDYYYY
      'DBC': '2',
    });

    const result = parseAAMVA(data);
    expect(result.dateOfBirth).toBe('19900115');
    expect(result.sex).toBe('F');
  });

  test('handles MMDDYYYY expiration date format', () => {
    const data = buildBarcode({
      'DCS': 'DOE',
      'DAC': 'JANE',
      'DBB': '19900115',
      'DBA': '01012028',  // MMDDYYYY
    });

    const result = parseAAMVA(data);
    expect(result.expirationDate).toBe('20280101');
    expect(result.isExpired).toBe(false);
  });

  test('detects expired IDs', () => {
    const data = buildBarcode({
      'DCS': 'EXPIRED',
      'DAC': 'USER',
      'DBB': '19900115',
      'DBA': '20200101', // Past date
    });

    const result = parseAAMVA(data);
    expect(result.isExpired).toBe(true);
  });

  test('uses fallback field codes (DCT, DAB, DBL)', () => {
    const data = buildBarcode({
      'DAB': 'JOHNSON',  // Fallback for last name
      'DCT': 'BOB',      // Fallback for first name
      'DBL': '19850310', // Fallback for DOB
    });

    const result = parseAAMVA(data);
    expect(result.firstName).toBe('BOB');
    expect(result.lastName).toBe('JOHNSON');
    expect(result.dateOfBirth).toBe('19850310');
  });

  test('calculates age correctly', () => {
    const now = new Date();
    const yearAgo = new Date(now.getFullYear() - 25, now.getMonth(), now.getDate());
    const dob = `${yearAgo.getFullYear()}${String(yearAgo.getMonth() + 1).padStart(2, '0')}${String(yearAgo.getDate()).padStart(2, '0')}`;

    const data = buildBarcode({ 'DBB': dob, 'DCS': 'TEST', 'DAC': 'AGE' });
    const result = parseAAMVA(data);
    expect(result.age).toBe(25);
  });

  test('returns null fields for missing data', () => {
    const result = parseAAMVA('');
    expect(result.firstName).toBeNull();
    expect(result.lastName).toBeNull();
    expect(result.dateOfBirth).toBeNull();
    expect(result.sex).toBeNull();
    expect(result.age).toBeNull();
    expect(result.idNumber).toBeNull();
    expect(result.isExpired).toBe(false);
  });

  test('truncates postal code to 5 digits', () => {
    const data = buildBarcode({ 'DAK': '902100000' });
    const result = parseAAMVA(data);
    expect(result.postalCode).toBe('90210');
  });

  test('strips non-numeric characters from DOB', () => {
    const data = buildBarcode({ 'DBB': '1990-01-15', 'DCS': 'T', 'DAC': 'T' });
    const result = parseAAMVA(data);
    expect(result.dateOfBirth).toBe('19900115');
  });

  test('sex code M maps to M', () => {
    const data = buildBarcode({ 'DBC': 'M' });
    expect(parseAAMVA(data).sex).toBe('M');
  });

  test('sex code F maps to F', () => {
    const data = buildBarcode({ 'DBC': 'F' });
    expect(parseAAMVA(data).sex).toBe('F');
  });

  test('unknown sex code returns null', () => {
    const data = buildBarcode({ 'DBC': '9' });
    expect(parseAAMVA(data).sex).toBeNull();
  });
});
