import { execSync } from 'child_process';

describe('SupabaseAdapter cleanup', () => {
  test('no SupabaseAdapter references exist in source code', () => {
    const result = execSync(
      'grep -rl "SupabaseAdapter" --include="*.ts" --include="*.tsx" . ' +
      '--exclude-dir=node_modules --exclude-dir=.next --exclude-dir=__tests__ || true',
      { encoding: 'utf8' }
    ).trim();
    expect(result).toBe('');
  });
});
