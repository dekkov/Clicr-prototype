describe('generateIdentityHash', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV, ID_HASH_SALT: 'test-salt-abc123' };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  const loadModule = async () => {
    const mod = await import('@/lib/identity-hash');
    return mod.generateIdentityHash;
  };

  test('returns a hex string', async () => {
    const generateIdentityHash = await loadModule();
    const hash = generateIdentityHash('CA', 'D1234567', '19900115');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test('same inputs produce same hash (deterministic)', async () => {
    const generateIdentityHash = await loadModule();
    const hash1 = generateIdentityHash('CA', 'D1234567', '19900115');
    const hash2 = generateIdentityHash('CA', 'D1234567', '19900115');
    expect(hash1).toBe(hash2);
  });

  test('different inputs produce different hashes', async () => {
    const generateIdentityHash = await loadModule();
    const hash1 = generateIdentityHash('CA', 'D1234567', '19900115');
    const hash2 = generateIdentityHash('TX', 'D1234567', '19900115');
    expect(hash1).not.toBe(hash2);
  });

  test('normalizes state to uppercase', async () => {
    const generateIdentityHash = await loadModule();
    const hash1 = generateIdentityHash('ca', 'D1234567', '19900115');
    const hash2 = generateIdentityHash('CA', 'D1234567', '19900115');
    expect(hash1).toBe(hash2);
  });

  test('normalizes ID number to uppercase', async () => {
    const generateIdentityHash = await loadModule();
    const hash1 = generateIdentityHash('CA', 'd1234567', '19900115');
    const hash2 = generateIdentityHash('CA', 'D1234567', '19900115');
    expect(hash1).toBe(hash2);
  });

  test('strips non-numeric chars from DOB', async () => {
    const generateIdentityHash = await loadModule();
    const hash1 = generateIdentityHash('CA', 'D1234567', '1990-01-15');
    const hash2 = generateIdentityHash('CA', 'D1234567', '19900115');
    expect(hash1).toBe(hash2);
  });

  test('trims whitespace from inputs', async () => {
    const generateIdentityHash = await loadModule();
    const hash1 = generateIdentityHash(' CA ', ' D1234567 ', '19900115');
    const hash2 = generateIdentityHash('CA', 'D1234567', '19900115');
    expect(hash1).toBe(hash2);
  });

  test('handles empty/null-ish inputs gracefully', async () => {
    const generateIdentityHash = await loadModule();
    const hash = generateIdentityHash('', '', '');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test('throws when ID_HASH_SALT is missing', async () => {
    delete process.env.ID_HASH_SALT;
    const generateIdentityHash = await loadModule();
    expect(() => generateIdentityHash('CA', 'D123', '19900115')).toThrow('ID_HASH_SALT');
  });
});
