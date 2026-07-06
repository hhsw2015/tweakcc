import { describe, expect, it } from 'vitest';
import { writeDisableTelemetry } from './specialPatches';

const G_ORIG =
  'function G(e,t){let n=pdn;if(n.sink===null){n.eventQueue.push({eventName:e,metadata:t,async:!1});return}n.sink.logEvent(e,t)}';
const I_ORIG =
  'async function I_(e,t){let n=pdn;if(n.sink===null){n.eventQueue.push({eventName:e,metadata:t,async:!0});return}await n.sink.logEventAsync(e,t)}';
const PTO_ORIG =
  'function pto(e){if(!Fj())return;if(!qre||xje("firstParty"))return;let t=Hj(),{accountUuid:n,organizationUuid:r}=Vlt(!0),o={event_type:"GrowthbookExperimentEvent",event_id:cto.randomUUID(),experiment_id:e.experimentId,variation_id:e.variationId,...t&&{device_id:t},...n&&{account_uuid:n},...r&&{organization_uuid:r},...e.userAttributes&&{session_id:e.userAttributes.sessionId,user_attributes:De({appVersion:e.userAttributes.appVersion})},...e.experimentMetadata&&{experiment_metadata:De(e.experimentMetadata)},environment:vzd()},s=new Date;qre.emit({timestamp:s,observedTimestamp:s,body:"growthbook_experiment",attributes:o})}';

const wrap = (inner: string): string => `xxx head ${inner} yyy tail`;

describe('csp #27: disableTelemetry (G / I_ / pto)', () => {
  it('neutralizes G() equal length, no-op body', () => {
    const input = wrap(G_ORIG);
    const output = writeDisableTelemetry(input);
    expect(output).not.toBeNull();
    expect(output!.length).toBe(input.length);
    expect(output).toContain('function G(){');
    expect(output).not.toContain('n.sink.logEvent');
    expect(output).not.toContain('eventQueue.push');
  });

  it('neutralizes I_() equal length, no-op body', () => {
    const input = wrap(I_ORIG);
    const output = writeDisableTelemetry(input);
    expect(output).not.toBeNull();
    expect(output!.length).toBe(input.length);
    expect(output).toContain('async function I_(){');
    expect(output).not.toContain('logEventAsync');
  });

  it('neutralizes pto() equal length, no-op body', () => {
    const input = wrap(PTO_ORIG);
    const output = writeDisableTelemetry(input);
    expect(output).not.toBeNull();
    expect(output!.length).toBe(input.length);
    expect(output).toContain('function pto(){');
    expect(output).not.toContain('GrowthbookExperimentEvent');
    expect(output).not.toContain('qre.emit');
  });

  it('handles all three at once', () => {
    const input = `pre ${G_ORIG} mid ${I_ORIG} mid2 ${PTO_ORIG} end`;
    const output = writeDisableTelemetry(input);
    expect(output).not.toBeNull();
    expect(output!.length).toBe(input.length);
    expect(output).toContain('function G(){');
    expect(output).toContain('async function I_(){');
    expect(output).toContain('function pto(){');
  });

  it('is idempotent (already-patched → null)', () => {
    const input = wrap(G_ORIG);
    const once = writeDisableTelemetry(input)!;
    const twice = writeDisableTelemetry(once);
    expect(twice).toBeNull();
  });

  it('returns null when no target present', () => {
    expect(writeDisableTelemetry('random content')).toBeNull();
  });

  it('partial: only G present → applies G, returns modified', () => {
    const input = wrap(G_ORIG);
    const output = writeDisableTelemetry(input);
    expect(output).not.toBeNull();
    expect(output).toContain('function G(){');
  });
});
