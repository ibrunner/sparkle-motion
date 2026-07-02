import { describe, expect, it } from 'vitest';
import { initialDrift, stepDrift } from './drift';

describe('stepDrift', () => {
  it('returns zero offsets when amplitude is 0', () => {
    const moving = { offsetX: 1, offsetY: -1, targetX: 2, targetY: 2, timeToNext: 0.5 };
    const next = stepDrift(moving, 1 / 60, 0, 8, () => 0.9);
    expect(next.offsetX).toBe(0);
    expect(next.offsetY).toBe(0);
  });

  it('picks targets bounded by the amplitude', () => {
    const next = stepDrift(initialDrift, 1 / 60, 0.5, 8, () => 1);
    expect(next.targetX).toBeCloseTo(0.5, 6);
    expect(next.targetY).toBeCloseTo(0.5, 6);
    const low = stepDrift(initialDrift, 1 / 60, 0.5, 8, () => 0);
    expect(low.targetX).toBeCloseTo(-0.5, 6);
  });

  it('moves the offset toward the target each step', () => {
    let state = stepDrift(initialDrift, 1 / 60, 1, 4, () => 1); // target (1,1)
    const gapBefore = Math.abs(state.targetX - state.offsetX);
    state = stepDrift(state, 1 / 60, 1, 4, () => 1);
    const gapAfter = Math.abs(state.targetX - state.offsetX);
    expect(gapAfter).toBeLessThan(gapBefore);
    expect(state.offsetX).toBeGreaterThan(0);
  });

  it('re-rolls the target after the wander interval', () => {
    let state = stepDrift(initialDrift, 1 / 60, 1, 10, () => 1); // interval 0.1s, target 1
    state = stepDrift(state, 0.2, 1, 10, () => 0); // past interval, re-roll to -1
    expect(state.targetX).toBeCloseTo(-1, 6);
  });
});
