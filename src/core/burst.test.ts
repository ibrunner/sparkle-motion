import { describe, expect, it } from 'vitest';
import { burstGate, initialBurst, stepBurst } from './burst';

describe('stepBurst', () => {
  it('starts a pop (envelope 1) when the roll succeeds', () => {
    const next = stepBurst(initialBurst, 1 / 60, 2, 0.15, () => 0);
    expect(next.envelope).toBe(1);
  });

  it('decays the envelope by half-life between pops', () => {
    const popped = { envelope: 1 };
    const next = stepBurst(popped, 0.15, 2, 0.15, () => 0.999999);
    expect(next.envelope).toBeCloseTo(0.5, 5);
  });

  it('never pops when the rate is 0', () => {
    const next = stepBurst(initialBurst, 1 / 60, 0, 0.15, () => 0);
    expect(next.envelope).toBe(0);
  });
});

describe('burstGate', () => {
  it('is fully open (steady emission) when bursting is off', () => {
    expect(burstGate({ envelope: 0 }, 0)).toBe(1);
  });

  it('follows the envelope when bursting is on', () => {
    expect(burstGate({ envelope: 0.25 }, 2)).toBe(0.25);
  });
});
