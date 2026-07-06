import { describe, expect, it } from 'vitest';
import { CYBER_VERIFY_KEYWORDS } from './verify';

describe('csp: verify', () => {
  it('exports 8 canonical CYBER refusal keywords', () => {
    expect(CYBER_VERIFY_KEYWORDS).toHaveLength(8);
    expect(CYBER_VERIFY_KEYWORDS).toContain('Refuse requests');
    expect(CYBER_VERIFY_KEYWORDS).toContain('IMPORTANT: Assist with authorized');
  });

  // 不测 ccglassLiveVerify 本身: 它需要真实的 ccglass CLI + claude session,
  // 是 integration test 而非 unit test. 手动运行 `tweakcc csp-verify` 验证.
});
