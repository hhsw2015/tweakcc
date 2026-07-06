import { describe, expect, it } from 'vitest';
import { writeDisableTelemetry } from './specialPatches';

const G_ORIG =
  'function G(e,t){let n=pdn;if(n.sink===null){n.eventQueue.push({eventName:e,metadata:t,async:!1});return}n.sink.logEvent(e,t)}';
const I_ORIG =
  'async function I_(e,t){let n=pdn;if(n.sink===null){n.eventQueue.push({eventName:e,metadata:t,async:!0});return}await n.sink.logEventAsync(e,t)}';
const PTO_ORIG =
  'function pto(e){if(!Fj())return;if(!qre||xje("firstParty"))return;let t=Hj(),{accountUuid:n,organizationUuid:r}=Vlt(!0),o={event_type:"GrowthbookExperimentEvent",event_id:cto.randomUUID(),experiment_id:e.experimentId,variation_id:e.variationId,...t&&{device_id:t},...n&&{account_uuid:n},...r&&{organization_uuid:r},...e.userAttributes&&{session_id:e.userAttributes.sessionId,user_attributes:De({appVersion:e.userAttributes.appVersion})},...e.experimentMetadata&&{experiment_metadata:De(e.experimentMetadata)},environment:vzd()},s=new Date;qre.emit({timestamp:s,observedTimestamp:s,body:"growthbook_experiment",attributes:o})}';

const wrap = (inner: string): string => `xxx head ${inner} yyy tail`;

describe('csp #27: disableTelemetry (G / I_ / pto, all-or-nothing)', () => {
  it('neutralizes all three when present, equal length', () => {
    const input = `pre ${G_ORIG} mid ${I_ORIG} mid2 ${PTO_ORIG} end`;
    const output = writeDisableTelemetry(input);
    expect(output).not.toBeNull();
    expect(output!.length).toBe(input.length);
    expect(output).toContain('function G(){');
    expect(output).toContain('async function I_(){');
    expect(output).toContain('function pto(){');
    expect(output).not.toContain('n.sink.logEvent');
    expect(output).not.toContain('logEventAsync');
    expect(output).not.toContain('GrowthbookExperimentEvent');
    expect(output).not.toContain('qre.emit');
  });

  it('is idempotent (already-patched → null)', () => {
    const input = `pre ${G_ORIG} mid ${I_ORIG} mid2 ${PTO_ORIG} end`;
    const once = writeDisableTelemetry(input)!;
    const twice = writeDisableTelemetry(once);
    expect(twice).toBeNull();
  });

  it('returns null when no target present', () => {
    expect(writeDisableTelemetry('random content')).toBeNull();
  });

  it('partial (only G present) → null, refuse to leave telemetry leaks', () => {
    const input = wrap(G_ORIG);
    const output = writeDisableTelemetry(input);
    expect(output).toBeNull();
  });

  it('partial (only I_ + pto, no G) → null', () => {
    const input = `pre ${I_ORIG} mid ${PTO_ORIG} end`;
    const output = writeDisableTelemetry(input);
    expect(output).toBeNull();
  });

  it('accepts renamed minifier identifiers (all three renamed)', () => {
    // 模拟 rebundle: G→a1, I_→a2, pto→a3, pdn→b1, Fj→c1, qre→c2, xje→c3, Hj→c4, Vlt→c5, cto→c6, De→c7, vzd→c8
    const alt =
      `${G_ORIG.replace(/function G\(/, 'function a1(').replace(/n=pdn/, 'n=b1')} ` +
      `${I_ORIG.replace(/function I_\(/, 'function a2(').replace(/n=pdn/, 'n=b1')} ` +
      `${PTO_ORIG
        .replace(/function pto\(/, 'function a3(')
        .replace(/!Fj\(\)/, '!c1()')
        .replace(/!qre\|\|xje/g, '!c2||c3')
        .replace(/,Hj\(\),/, ',c4(),')
        .replace(/=Vlt\(/g, '=c5(')
        .replace(/cto\.randomUUID/g, 'c6.randomUUID')
        .replace(/De\(/g, 'c7(')
        .replace(/environment:vzd\(\)/g, 'environment:c8()')
        .replace(/qre\.emit/g, 'c2.emit')}`;
    const output = writeDisableTelemetry(alt);
    expect(output).not.toBeNull();
    expect(output!.length).toBe(alt.length);
    expect(output).toContain('function a1(){');
    expect(output).toContain('async function a2(){');
    expect(output).toContain('function a3(){');
  });
});
