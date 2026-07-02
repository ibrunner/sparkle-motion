import { decayFactor, fireProbability } from './params';

/**
 * Temporal burst model: spark emission arrives in pops rather than a steady
 * drizzle. A pop snaps the envelope to 1; it fades with a half-life, and the
 * envelope gates the global fire rate — so density reads as sparkles per pop.
 */
export interface BurstState {
  envelope: number;
}

export const initialBurst: BurstState = { envelope: 0 };

export function stepBurst(
  state: BurstState,
  dt: number,
  popsPerSecond: number,
  halfLifeSeconds: number,
  rand: () => number = Math.random,
): BurstState {
  let envelope = state.envelope * decayFactor(halfLifeSeconds, dt);
  if (popsPerSecond > 0 && rand() < fireProbability(popsPerSecond, 1, dt)) {
    envelope = 1;
  }
  return { envelope };
}

/** Gate multiplying the global fire rate; wide open when bursting is off. */
export function burstGate(state: BurstState, popsPerSecond: number): number {
  return popsPerSecond > 0 ? state.envelope : 1;
}
