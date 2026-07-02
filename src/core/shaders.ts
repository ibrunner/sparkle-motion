/** Fullscreen-triangle vertex shader; v_uv covers [0,1]² over the target. */
export const VERT_SRC = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = pos;
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}
`;

/** Bilinear downsample of the source with an unsharp mask at output scale. */
export const BASE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform vec2 u_outputSize;
uniform float u_sharpen;
in vec2 v_uv;
out vec4 outColor;
void main() {
  // Image textures are uploaded top-row-first; render targets are bottom-up.
  vec2 suv = vec2(v_uv.x, 1.0 - v_uv.y);
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
uniform uint u_frame;
in vec2 v_uv;
out vec4 outColor;

uint pcg(uint v) {
  v = v * 747796405u + 2891336453u;
  v = ((v >> ((v >> 28u) + 4u)) ^ v) * 277803737u;
  return (v >> 22u) ^ v;
}
float rand(uint x, uint y, uint frame, uint salt) {
  return float(pcg(x ^ pcg(y ^ pcg(frame ^ salt)))) / 4294967295.0;
}

void main() {
  vec3 prev = texture(u_prev, v_uv).rgb;
  vec3 base = texture(u_base, v_uv).rgb;
  float detail = texture(u_detail, v_uv).r;

  float weight = mix(1.0, pow(detail, u_edgeGamma), u_edgeInfluence);
  float p = 1.0 - exp(-u_density * weight * u_dt);

  uint x = uint(gl_FragCoord.x);
  uint y = uint(gl_FragCoord.y);
  float roll = rand(x, y, u_frame, 0u);

  float keep = u_halfLife <= 0.0 ? 0.0 : exp(-0.69314718 * u_dt / u_halfLife);
  vec3 decayed = mix(base, prev, keep);

  if (roll < p) {
    // Image textures are uploaded top-row-first; render targets are bottom-up.
    vec2 suv = vec2(v_uv.x, 1.0 - v_uv.y);
    vec2 jitter = (vec2(rand(x, y, u_frame, 1u), rand(x, y, u_frame, 2u)) - 0.5)
      * 2.0 * u_jitterRadius;
    ivec2 texel = ivec2(clamp(suv * u_sourceSize + jitter, vec2(0.0), u_sourceSize - 1.0));
    vec3 spark = texelFetch(u_source, texel, 0).rgb;
    outColor = vec4(mix(decayed, spark, u_sparkStrength), 1.0);
  } else {
    outColor = vec4(decayed, 1.0);
  }
}
`;

/** Final composite: effect blend, or debug views (base-only A/B, detail map). */
export const BLIT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform sampler2D u_base;
uniform sampler2D u_detail;
uniform float u_intensity;
uniform int u_mode; // 0 = effect, 1 = base only, 2 = detail map
in vec2 v_uv;
out vec4 outColor;
void main() {
  if (u_mode == 1) {
    outColor = vec4(texture(u_base, v_uv).rgb, 1.0);
  } else if (u_mode == 2) {
    outColor = vec4(texture(u_detail, v_uv).rgb, 1.0);
  } else {
    vec3 base = texture(u_base, v_uv).rgb;
    vec3 state = texture(u_state, v_uv).rgb;
    outColor = vec4(mix(base, state, u_intensity), 1.0);
  }
}
`;
