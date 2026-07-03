/** Fullscreen-triangle vertex shader; v_uv covers [0,1]² over the target. */
export const VERT_SRC = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = pos;
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}
`;

/**
 * Bilinear downsample of the source with an unsharp mask at output scale.
 * u_phase (uv units) is the coherent ocular-drift offset; re-rendered every
 * frame so the whole image resamples at a wandering sub-texel phase.
 */
export const BASE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform vec2 u_outputSize;
uniform float u_sharpen;
uniform vec2 u_phase;
in vec2 v_uv;
out vec4 outColor;
void main() {
  // Image textures are uploaded top-row-first; render targets are bottom-up.
  vec2 suv = vec2(v_uv.x, 1.0 - v_uv.y) + u_phase;
  vec2 px = 1.0 / u_outputSize;
  vec3 center = texture(u_source, suv).rgb;
  vec3 blur = (
    texture(u_source, suv + vec2(px.x, 0.0)).rgb +
    texture(u_source, suv - vec2(px.x, 0.0)).rgb +
    texture(u_source, suv + vec2(0.0, px.y)).rgb +
    texture(u_source, suv - vec2(0.0, px.y)).rgb
  ) * 0.25;
  outColor = vec4(clamp(center + u_sharpen * (center - blur), 0.0, 1.0), 1.0);
}
`;

/**
 * Spark-emission weight map: Sobel edge magnitude on source luminance,
 * sampled at source-texel spacing, clamped to [0,1].
 */
export const DETAIL_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform vec2 u_sourceSize;
in vec2 v_uv;
out vec4 outColor;
float lum(vec2 uv) {
  return dot(texture(u_source, uv).rgb, vec3(0.2126, 0.7152, 0.0722));
}
void main() {
  // Image textures are uploaded top-row-first; render targets are bottom-up.
  vec2 suv = vec2(v_uv.x, 1.0 - v_uv.y);
  vec2 t = 1.0 / u_sourceSize;
  float tl = lum(suv + vec2(-t.x,  t.y));
  float tc = lum(suv + vec2( 0.0,  t.y));
  float tr = lum(suv + vec2( t.x,  t.y));
  float ml = lum(suv + vec2(-t.x,  0.0));
  float mr = lum(suv + vec2( t.x,  0.0));
  float bl = lum(suv + vec2(-t.x, -t.y));
  float bc = lum(suv + vec2( 0.0, -t.y));
  float br = lum(suv + vec2( t.x, -t.y));
  float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
  float gy = (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br);
  float mag = clamp(length(vec2(gx, gy)), 0.0, 1.0);
  outColor = vec4(vec3(mag), 1.0);
}
`;

/**
 * The spark system. Per pixel per frame:
 *  - decay previous state toward the base image (exp, half-life form)
 *  - roll a PCG-hash die; fire probability = 1 - exp(-density·weight·dt)
 *  - on fire, snap to one random source texel within the jitter radius
 * Formulas mirror fireProbability/decayFactor in params.ts.
 */
export const SPARKLE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_prev;
uniform sampler2D u_base;
uniform sampler2D u_detail;
uniform sampler2D u_source;
uniform vec2 u_sourceSize;
uniform float u_dt;
uniform float u_density;
uniform float u_halfLife;
uniform float u_edgeInfluence;
uniform float u_edgeGamma;
uniform float u_jitterRadius;
uniform float u_sparkStrength;
uniform float u_lightInfluence;
uniform float u_lightLow;
uniform float u_lightHigh;
uniform float u_lightGamma;
uniform float u_highlightBias;
uniform float u_baseBrightness; // darkens the visible baseline, not emission
uniform int u_blendMode; // 0 replace, 1 lighten, 2 screen, 3 dodge, 4 overlay, 5 add
uniform vec2 u_drift; // coherent drift offset, in source texels
uniform float u_burstGate; // temporal burst envelope gating the fire rate
uniform uint u_frame;
in vec2 v_uv;
out vec4 outColor;

// Photoshop-style layer blends; a = underlying (decayed) pixel, b = spark.
vec3 blendSpark(vec3 a, vec3 b) {
  if (u_blendMode == 1) return max(a, b);
  if (u_blendMode == 2) return 1.0 - (1.0 - a) * (1.0 - b);
  if (u_blendMode == 3) return min(a / max(1.0 - b, vec3(1e-3)), vec3(1.0));
  if (u_blendMode == 4) {
    return mix(2.0 * a * b, 1.0 - 2.0 * (1.0 - a) * (1.0 - b), step(0.5, a));
  }
  if (u_blendMode == 5) return min(a + b, vec3(1.0));
  return b;
}

uint pcg(uint v) {
  v = v * 747796405u + 2891336453u;
  v = ((v >> ((v >> 28u) + 4u)) ^ v) * 277803737u;
  return (v >> 22u) ^ v;
}
float rand(uint x, uint y, uint frame, uint salt) {
  return float(pcg(x ^ pcg(y ^ pcg(frame ^ salt)))) / 4294967295.0;
}
float lum(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}
// Levels (low/high/midpoint-gamma) on the light map, like Photoshop Levels.
float lightLevels(float v) {
  float t = clamp((v - u_lightLow) / max(u_lightHigh - u_lightLow, 1e-3), 0.0, 1.0);
  return pow(t, u_lightGamma);
}

void main() {
  vec3 prev = texture(u_prev, v_uv).rgb;
  vec3 base = texture(u_base, v_uv).rgb;
  float detail = texture(u_detail, v_uv).r;

  // Photon model: emission is a balance between the edge and light maps.
  // The influences are relative weights, so lowering one and raising the
  // other shifts dominance instead of just stacking (edge=0 → pure light).
  float edgeC = u_edgeInfluence * pow(detail, u_edgeGamma);
  float lightC = u_lightInfluence * lightLevels(lum(base));
  float infl = u_edgeInfluence + u_lightInfluence;
  float weight = infl > 0.0 ? (edgeC + lightC) / infl : 0.0;
  float p = 1.0 - exp(-u_density * weight * u_burstGate * u_dt);

  // Darkened baseline: sparks decay toward and composite against this, but
  // emission (lum(base) above) still reads the full-brightness base.
  vec3 dark = base * u_baseBrightness;

  uint x = uint(gl_FragCoord.x);
  uint y = uint(gl_FragCoord.y);
  float roll = rand(x, y, u_frame, 0u);

  float keep = u_halfLife <= 0.0 ? 0.0 : exp(-0.69314718 * u_dt / u_halfLife);
  vec3 decayed = mix(dark, prev, keep);

  if (roll < p) {
    // Image textures are uploaded top-row-first; render targets are bottom-up.
    vec2 suv = vec2(v_uv.x, 1.0 - v_uv.y);
    // Draw 4 candidate photons from the footprint; u_highlightBias is the
    // chance we keep the brightest one (bright texels emit more photons).
    vec3 first = vec3(0.0);
    vec3 brightest = vec3(0.0);
    float bestLum = -1.0;
    for (int i = 0; i < 4; i++) {
      uint s = 3u + uint(i) * 2u;
      vec2 jitter = (vec2(rand(x, y, u_frame, s), rand(x, y, u_frame, s + 1u)) - 0.5)
        * 2.0 * u_jitterRadius;
      ivec2 texel = ivec2(clamp(suv * u_sourceSize + u_drift + jitter, vec2(0.0), u_sourceSize - 1.0));
      vec3 c = texelFetch(u_source, texel, 0).rgb;
      if (i == 0) first = c;
      float l = lum(c);
      if (l > bestLum) {
        bestLum = l;
        brightest = c;
      }
    }
    vec3 spark = rand(x, y, u_frame, 12u) < u_highlightBias ? brightest : first;
    outColor = vec4(mix(decayed, blendSpark(decayed, spark), u_sparkStrength), 1.0);
  } else {
    outColor = vec4(decayed, 1.0);
  }
}
`;

/**
 * Final composite: effect blend, or debug views.
 * Mode 2 shows the *effective* emission weight (edge map with influence and
 * gamma applied), so the edge sliders visibly reshape it. Mode 3 shows spark
 * activity: |state - base| as white flashes fading with decay, over a faint
 * weight-map background.
 */
export const BLIT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform sampler2D u_base;
uniform sampler2D u_detail;
uniform float u_intensity;
uniform float u_edgeInfluence;
uniform float u_edgeGamma;
uniform float u_lightInfluence;
uniform float u_lightLow;
uniform float u_lightHigh;
uniform float u_lightGamma;
uniform float u_baseBrightness; // darkens the visible baseline, not emission
uniform int u_mode; // 0 = effect, 1 = base only, 2 = emission weights, 3 = spark activity
in vec2 v_uv;
out vec4 outColor;
float lightLevels(float v) {
  float t = clamp((v - u_lightLow) / max(u_lightHigh - u_lightLow, 1e-3), 0.0, 1.0);
  return pow(t, u_lightGamma);
}
void main() {
  vec3 base = texture(u_base, v_uv).rgb;
  vec3 state = texture(u_state, v_uv).rgb;
  float detail = texture(u_detail, v_uv).r;
  float edgeC = u_edgeInfluence * pow(detail, u_edgeGamma);
  float lightC = u_lightInfluence * lightLevels(dot(base, vec3(0.2126, 0.7152, 0.0722)));
  float infl = u_edgeInfluence + u_lightInfluence;
  float weight = infl > 0.0 ? (edgeC + lightC) / infl : 0.0;
  // Darkened baseline for the shown image; weight/emission stays on true base.
  vec3 dark = base * u_baseBrightness;
  if (u_mode == 1) {
    outColor = vec4(dark, 1.0);
  } else if (u_mode == 2) {
    outColor = vec4(vec3(weight), 1.0);
  } else if (u_mode == 3) {
    float activity = clamp(length(state - base) * 2.0, 0.0, 1.0);
    outColor = vec4(max(vec3(activity), vec3(weight * 0.15)), 1.0);
  } else {
    outColor = vec4(mix(dark, state, u_intensity), 1.0);
  }
}
`;
