/**
 * Spark compositing modes (Photoshop-style layer math):
 * replace = snap to the sampled texel; lighten = photon model, only brightens;
 * screen/dodge/add = increasingly glowy; dodge amplifies the underlying color.
 */
export type SparkBlendMode = 'replace' | 'lighten' | 'screen' | 'dodge' | 'overlay' | 'add';

/** Tunable parameters for the sparkle effect. */
export interface SparkleParams {
  /** Expected spark events per pixel per second (at weight 1). */
  density: number;
  /** Seconds for a fired pixel to fade halfway back to the base image. */
  halfLife: number;
  /** 0 = uniform sparkle, 1 = fully edge-weighted. */
  edgeInfluence: number;
  /** Contrast curve applied to the detail map. */
  edgeGamma: number;
  /** Photon model: how much brighter areas emit more sparks (0 = ignore light). */
  lightInfluence: number;
  /** Levels on the light map: input black point (luminance mapped to 0). */
  lightLow: number;
  /** Levels on the light map: input white point (luminance mapped to 1). */
  lightHigh: number;
  /** Levels on the light map: input midpoint (this luminance maps to 0.5). */
  lightMid: number;
  /** Chance a spark takes the brightest of 4 candidate texels instead of a random one. */
  highlightBias: number;
  /** How a spark composites onto the decayed pixel. */
  blendMode: SparkBlendMode;
  /** Radius (in source texels) sparks may sample from around their footprint. */
  jitterRadius: number;
  /** Ocular drift: bound of the coherent sub-texel wander, in source texels. */
  driftAmplitude: number;
  /** Ocular drift: waypoint changes per second. */
  driftSpeed: number;
  /** Unsharp-mask amount applied to the bilinear base image. */
  sharpen: number;
  /** How far a firing pixel moves toward the sampled texel: 1 = full snap. */
  sparkStrength: number;
  /** Master blend: 0 = plain base image, 1 = full effect. */
  intensity: number;
}

export const defaultParams: SparkleParams = {
  density: 8,
  halfLife: 0.15,
  edgeInfluence: 0.85,
  edgeGamma: 1.5,
  lightInfluence: 0.6,
  lightLow: 0,
  lightHigh: 1,
  lightMid: 0.5,
  highlightBias: 0.6,
  blendMode: 'lighten',
  jitterRadius: 4,
  driftAmplitude: 0.6,
  driftSpeed: 8,
  sharpen: 0.3,
  sparkStrength: 1,
  intensity: 1,
};

/**
 * Probability that a pixel fires this frame, given a Poisson event rate.
 * Rate-based so 60Hz and 120Hz displays integrate to the same event density.
 * Mirrored in SPARKLE_FRAG.
 */
export function fireProbability(ratePerSecond: number, weight: number, dt: number): number {
  return 1 - Math.exp(-ratePerSecond * weight * dt);
}

/**
 * Per-frame retention factor for exponential decay toward the base image.
 * After `halfLifeSeconds` of accumulated frames, a spark has faded 50%.
 * Mirrored in SPARKLE_FRAG.
 */
export function decayFactor(halfLifeSeconds: number, dt: number): number {
  if (halfLifeSeconds <= 0) return 0;
  return Math.exp((-Math.LN2 * dt) / halfLifeSeconds);
}

/**
 * Photoshop-style Levels midpoint → gamma exponent: pow(t, gamma) maps the
 * midpoint luminance to 0.5. mid 0.5 → 1 (identity); lower mid brightens.
 * Mirrored in SPARKLE_FRAG/BLIT_FRAG via the u_lightGamma uniform.
 */
export function lightLevelsGamma(mid: number): number {
  const clamped = Math.min(Math.max(mid, 0.01), 0.99);
  return Math.log(0.5) / Math.log(clamped);
}
