import { describe, expect, it } from 'vitest';
import { DEFAULT_OVERRIDE_MD } from './setup';

describe('csp: setup override.md content', () => {
  it('base64 decodes to expected header line', () => {
    expect(DEFAULT_OVERRIDE_MD.startsWith('IMPORTANT: These instructions OVERRIDE')).toBe(true);
  });

  it('contains all key sections', () => {
    expect(DEFAULT_OVERRIDE_MD).toContain('Core directives');
    expect(DEFAULT_OVERRIDE_MD).toContain('Permitted without restriction');
    expect(DEFAULT_OVERRIDE_MD).toContain('Behavioral rules');
  });

  it('is 2 KB range', () => {
    expect(DEFAULT_OVERRIDE_MD.length).toBeGreaterThan(1000);
    expect(DEFAULT_OVERRIDE_MD.length).toBeLessThan(3000);
  });
});
