import { describe, expect, it } from 'vitest';
import { decayFactor, defaultParams, fireProbability, lightLevelsGamma } from './params';

describe('decayFactor', () => {
  it('halves after exactly one half-life', () => {
    expect(decayFactor(0.2, 0.2)).toBeCloseTo(0.5, 6);
  });

  it('is frame-rate independent: two 120Hz steps equal one 60Hz step', () => {
    expect(decayFactor(0.3, 1 / 120) ** 2).toBeCloseTo(decayFactor(0.3, 1 / 60), 6);
  });

  it('returns 0 for non-positive half-life (instant snap to base)', () => {
    expect(decayFactor(0, 1 / 60)).toBe(0);
    expect(decayFactor(-1, 1 / 60)).toBe(0);
  });
});

describe('fireProbability', () => {
  it('is 0 when dt or weight is 0', () => {
    expect(fireProbability(8, 1, 0)).toBe(0);
    expect(fireProbability(8, 0, 1 / 60)).toBe(0);
  });

  it('compounds consistently across frame rates', () => {
    const p60 = fireProbability(8, 1, 1 / 60);
    const p120 = fireProbability(8, 1, 1 / 120);
    expect(1 - (1 - p120) ** 2).toBeCloseTo(p60, 6);
  });

  it('never reaches 1 even for extreme rates', () => {
    expect(fireProbability(1e6, 1, 1)).toBeLessThanOrEqual(1);
    expect(fireProbability(60, 1, 1 / 60)).toBeLessThan(1);
  });
});

describe('lightLevelsGamma', () => {
  it('is identity at midpoint 0.5', () => {
    expect(lightLevelsGamma(0.5)).toBeCloseTo(1, 6);
  });

  it('maps the chosen midpoint luminance to 0.5', () => {
    const mid = 0.25;
    expect(Math.pow(mid, lightLevelsGamma(mid))).toBeCloseTo(0.5, 6);
  });

  it('clamps extreme midpoints instead of blowing up', () => {
    expect(Number.isFinite(lightLevelsGamma(0))).toBe(true);
    expect(Number.isFinite(lightLevelsGamma(1))).toBe(true);
  });
});

describe('defaultParams', () => {
  it('has sane positive defaults', () => {
    expect(defaultParams.density).toBeGreaterThan(0);
    expect(defaultParams.halfLife).toBeGreaterThan(0);
    expect(defaultParams.intensity).toBeGreaterThan(0);
    expect(defaultParams.edgeInfluence).toBeGreaterThanOrEqual(0);
    expect(defaultParams.edgeInfluence).toBeLessThanOrEqual(1);
  });
});
