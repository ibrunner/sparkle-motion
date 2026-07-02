/**
 * Ocular-drift model for frame-coherent sub-texel jitter: the sampling phase
 * of the whole image wanders smoothly, like the eye's fixational drift.
 * Coherent phase motion is what lets the visual system integrate sub-pixel
 * detail across frames — per-pixel random jitter only reads as noise.
 */
export interface DriftState {
  offsetX: number;
  offsetY: number;
  targetX: number;
  targetY: number;
  timeToNext: number;
}

export const initialDrift: DriftState = {
  offsetX: 0,
  offsetY: 0,
  targetX: 0,
  targetY: 0,
  timeToNext: 0,
};

/**
 * Advance the drift by one frame. `amplitude` bounds the wander (in source
 * texels); `speed` is how many times per second a new waypoint is chosen.
 * The offset eases exponentially toward the current waypoint.
 */
export function stepDrift(
  state: DriftState,
  dt: number,
  amplitude: number,
  speed: number,
  rand: () => number = Math.random,
): DriftState {
  if (amplitude <= 0 || speed <= 0) return { ...initialDrift };
  let { offsetX, offsetY, targetX, targetY, timeToNext } = state;
  timeToNext -= dt;
  if (timeToNext <= 0) {
    targetX = (rand() * 2 - 1) * amplitude;
    targetY = (rand() * 2 - 1) * amplitude;
    timeToNext = 1 / speed;
  }
  const approach = 1 - Math.exp(-3 * speed * dt);
  offsetX += (targetX - offsetX) * approach;
  offsetY += (targetY - offsetY) * approach;
  return { offsetX, offsetY, targetX, targetY, timeToNext };
}
