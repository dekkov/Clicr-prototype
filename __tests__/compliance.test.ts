import { ComplianceEngine } from '@/lib/compliance';

describe('ComplianceEngine', () => {
  describe('getRule', () => {
    test('returns CA rule with strict privacy', () => {
      const rule = ComplianceEngine.getRule('CA');
      expect(rule.stateCode).toBe('CA');
      expect(rule.retentionDays).toBe(0);
      expect(rule.storePII).toBe(false);
      expect(rule.storeImage).toBe(false);
      expect(rule.maskDLNumber).toBe(true);
      expect(rule.ageVerificationOnDeviceOnly).toBe(true);
    });

    test('returns TX rule with moderate storage', () => {
      const rule = ComplianceEngine.getRule('TX');
      expect(rule.retentionDays).toBe(7);
      expect(rule.storePII).toBe(true);
      expect(rule.ageVerificationOnDeviceOnly).toBe(false);
    });

    test('returns NY rule with masking', () => {
      const rule = ComplianceEngine.getRule('NY');
      expect(rule.retentionDays).toBe(1);
      expect(rule.maskDLNumber).toBe(true);
      expect(rule.ageVerificationOnDeviceOnly).toBe(true);
    });

    test('returns FL rule with image storage', () => {
      const rule = ComplianceEngine.getRule('FL');
      expect(rule.retentionDays).toBe(90);
      expect(rule.storeImage).toBe(true);
      expect(rule.storePII).toBe(true);
    });

    test('returns default rule for unknown state', () => {
      const rule = ComplianceEngine.getRule('ZZ');
      expect(rule.stateCode).toBe('ZZ');
      expect(rule.retentionDays).toBe(30);
      expect(rule.storePII).toBe(true);
    });
  });

  describe('isScanCompliant', () => {
    test('CA scan (0-day retention) is immediately non-compliant', () => {
      const yesterday = new Date(Date.now() - 86400000);
      expect(ComplianceEngine.isScanCompliant(yesterday, 'CA')).toBe(false);
    });

    test('TX scan within 7 days is compliant', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 86400000);
      expect(ComplianceEngine.isScanCompliant(threeDaysAgo, 'TX')).toBe(true);
    });

    test('TX scan after 7 days is non-compliant', () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 86400000);
      expect(ComplianceEngine.isScanCompliant(tenDaysAgo, 'TX')).toBe(false);
    });

    test('FL scan within 90 days is compliant', () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
      expect(ComplianceEngine.isScanCompliant(thirtyDaysAgo, 'FL')).toBe(true);
    });

    test('FL scan after 90 days is non-compliant', () => {
      const hundredDaysAgo = new Date(Date.now() - 100 * 86400000);
      expect(ComplianceEngine.isScanCompliant(hundredDaysAgo, 'FL')).toBe(false);
    });
  });

  describe('sanitizeForStorage', () => {
    const fullScanData = {
      timestamp: '2026-01-01T00:00:00Z',
      is_valid: true,
      age_valid: true,
      venue_id: 'v1',
      first_name: 'John',
      last_name: 'Doe',
      address: '123 Main St',
      dob: '1990-01-15',
      license_number: 'D1234567',
      image_data: 'base64...',
    };

    test('CA: strips everything except boolean result', () => {
      const result = ComplianceEngine.sanitizeForStorage(fullScanData, 'CA');
      expect(result.timestamp).toBe(fullScanData.timestamp);
      expect(result.is_valid).toBe(true);
      expect(result.age_valid).toBe(true);
      expect(result.venue_id).toBe('v1');
      expect(result.first_name).toBeUndefined();
      expect(result.last_name).toBeUndefined();
      expect(result.license_number).toBeUndefined();
      expect(result.image_data).toBeUndefined();
    });

    test('NY: strips PII and masks DL number', () => {
      const result = ComplianceEngine.sanitizeForStorage(fullScanData, 'NY');
      // NY has ageVerificationOnDeviceOnly = true, so same as CA
      expect(result.first_name).toBeUndefined();
      expect(result.license_number).toBeUndefined();
    });

    test('FL: keeps PII and images', () => {
      const result = ComplianceEngine.sanitizeForStorage(fullScanData, 'FL');
      expect(result.first_name).toBe('John');
      expect(result.last_name).toBe('Doe');
      expect(result.license_number).toBe('D1234567');
      expect(result.image_data).toBe('base64...');
    });

    test('TX: keeps PII but strips images', () => {
      const result = ComplianceEngine.sanitizeForStorage(fullScanData, 'TX');
      expect(result.first_name).toBe('John');
      expect(result.license_number).toBe('D1234567');
      expect(result.image_data).toBeUndefined();
    });

    test('unknown state with maskDLNumber masking', () => {
      // Default rule: storePII=true, maskDLNumber=false, storeImage=false
      const result = ComplianceEngine.sanitizeForStorage(fullScanData, 'ZZ');
      expect(result.first_name).toBe('John');
      expect(result.license_number).toBe('D1234567'); // not masked by default
      expect(result.image_data).toBeUndefined();
    });
  });

  describe('getRestrictionReason', () => {
    test('CA returns device-only restriction', () => {
      const reason = ComplianceEngine.getRestrictionReason('CA');
      expect(reason).toContain('CA');
      expect(reason).toContain('privacy');
    });

    test('NY returns PII restriction', () => {
      const reason = ComplianceEngine.getRestrictionReason('NY');
      expect(reason).toContain('NY');
    });

    test('TX returns null (no restrictions)', () => {
      expect(ComplianceEngine.getRestrictionReason('TX')).toBeNull();
    });

    test('FL returns null (no restrictions)', () => {
      expect(ComplianceEngine.getRestrictionReason('FL')).toBeNull();
    });
  });
});
