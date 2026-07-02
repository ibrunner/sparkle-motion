# Sparkle Motion Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A WebGL2 web demo where edge-weighted stochastic "spark" events temporally reveal true high-res texels of a downsampled photo, with sliders to tune the effect.

**Architecture:** Library core (`src/core/`) holds pure param math, WebGL helpers, GLSL shaders, and a `SparkleRenderer` class that runs a ping-pong state-texture loop (decay toward a sharpened bilinear base + probabilistic spark fires). Demo (`src/demo/`) is a plain-DOM page with a synthetic high-res test card, drag-drop loading, and a slider panel.

**Tech Stack:** Vite, TypeScript (strict), Vitest, WebGL2 (GLSL ES 3.00). No runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-07-01-sparkle-motion-prototype-design.md`

## Global Constraints

- Yarn 4.2.2, `nodeLinker: node-modules` (PnP off — Vite/Vitest friction).
- No runtime dependencies; devDependencies only (vite, typescript, vitest).
- TypeScript `strict: true`; ESM throughout (`"type": "module"`).
- WebGL2 only; no WebGL1 fallback. Missing WebGL2 → visible page message.
- Shaders live as exported template strings in `src/core/shaders.ts` (no loader config). Deviation from spec's `shaders/` dir noted deliberately; detail-map analysis lives in `DETAIL_FRAG`, so there is no separate `analysis.ts`.
- All dt-dependent math must be rate-based (frame-rate independent): `p = 1 - exp(-rate·weight·dt)`, `decay = exp(-ln2·dt/halfLife)`.

---

### Task 1: Toolchain scaffolding

**Files:**
- Create: `.yarnrc.yml`
- Modify: `package.json`
- Create: `tsconfig.json`
- Delete: `.pnp.cjs` (stale PnP artifact)
- Modify: `.gitignore` (ensure `node_modules/` ignored)

**Interfaces:**
- Consumes: nothing.
- Produces: working `yarn dev` / `yarn test` / `yarn build` toolchain for all later tasks.

- [ ] **Step 1: Write `.yarnrc.yml`**

```yaml
nodeLinker: node-modules
```

- [ ] **Step 2: Replace `package.json`**

```json
{
  "name": "sparkle-motion",
  "packageManager": "yarn@4.2.2",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "vite": "^7.0.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Remove stale PnP file, check .gitignore**

```bash
git rm .pnp.cjs
grep -q '^node_modules' .gitignore || echo 'node_modules/' >> .gitignore
```

- [ ] **Step 5: Install and verify**

Run: `yarn install`
Expected: succeeds, creates `node_modules/`, removes PnP state.
Run: `yarn vite --version`
Expected: prints vite version ≥ 7.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold vite + typescript + vitest toolchain"
```

---

### Task 2: Param math (`params.ts`) — TDD

**Files:**
- Create: `src/core/params.ts`
- Test: `src/core/params.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface SparkleParams { density: number; halfLife: number; edgeInfluence: number; edgeGamma: number; jitterRadius: number; sharpen: number; intensity: number }`
  - `const defaultParams: SparkleParams`
  - `fireProbability(ratePerSecond: number, weight: number, dt: number): number`
  - `decayFactor(halfLifeSeconds: number, dt: number): number`
  - These TS functions are the tested reference for the same formulas hard-coded in `SPARKLE_FRAG` (Task 3).

- [ ] **Step 1: Write the failing test — `src/core/params.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { decayFactor, defaultParams, fireProbability } from './params';

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

describe('defaultParams', () => {
  it('has sane positive defaults', () => {
    expect(defaultParams.density).toBeGreaterThan(0);
    expect(defaultParams.halfLife).toBeGreaterThan(0);
    expect(defaultParams.intensity).toBeGreaterThan(0);
    expect(defaultParams.edgeInfluence).toBeGreaterThanOrEqual(0);
    expect(defaultParams.edgeInfluence).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run src/core/params.test.ts`
Expected: FAIL — cannot resolve `./params`.

- [ ] **Step 3: Write `src/core/params.ts`**

```ts
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
  /** Radius (in source texels) sparks may sample from around their footprint. */
  jitterRadius: number;
  /** Unsharp-mask amount applied to the bilinear base image. */
  sharpen: number;
  /** Master blend: 0 = plain base image, 1 = full effect. */
  intensity: number;
}

export const defaultParams: SparkleParams = {
  density: 8,
  halfLife: 0.15,
  edgeInfluence: 0.85,
  edgeGamma: 1.5,
  jitterRadius: 4,
  sharpen: 0.3,
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn vitest run src/core/params.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Type-check and commit**

```bash
yarn tsc --noEmit
git add src/core/params.ts src/core/params.test.ts
git commit -m "feat: sparkle params with frame-rate-independent fire/decay math"
```

---

### Task 3: GLSL shaders and WebGL helpers

**Files:**
- Create: `src/core/shaders.ts`
- Create: `src/core/gl.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `shaders.ts`: `VERT_SRC`, `BASE_FRAG`, `DETAIL_FRAG`, `SPARKLE_FRAG`, `BLIT_FRAG` (all `string`).
  - `gl.ts`: `interface Target { texture: WebGLTexture; framebuffer: WebGLFramebuffer }`, `createProgram(gl, vertexSource, fragmentSource): WebGLProgram`, `createTexture(gl, width, height): WebGLTexture`, `createTarget(gl, width, height): Target`, `drawFullscreen(gl): void`.
- No unit tests: requires a real WebGL2 context (jsdom has none). Verified by shader compilation + visual checks in Task 6. Type-check gate only.

- [ ] **Step 1: Write `src/core/shaders.ts`**

```ts
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
  vec2 px = 1.0 / u_outputSize;
  vec3 center = texture(u_source, v_uv).rgb;
  vec3 blur = (
    texture(u_source, v_uv + vec2(px.x, 0.0)).rgb +
    texture(u_source, v_uv - vec2(px.x, 0.0)).rgb +
    texture(u_source, v_uv + vec2(0.0, px.y)).rgb +
    texture(u_source, v_uv - vec2(0.0, px.y)).rgb
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
  vec2 t = 1.0 / u_sourceSize;
  float tl = lum(v_uv + vec2(-t.x,  t.y));
  float tc = lum(v_uv + vec2( 0.0,  t.y));
  float tr = lum(v_uv + vec2( t.x,  t.y));
  float ml = lum(v_uv + vec2(-t.x,  0.0));
  float mr = lum(v_uv + vec2( t.x,  0.0));
  float bl = lum(v_uv + vec2(-t.x, -t.y));
  float bc = lum(v_uv + vec2( 0.0, -t.y));
  float br = lum(v_uv + vec2( t.x, -t.y));
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

  if (roll < p) {
    vec2 jitter = (vec2(rand(x, y, u_frame, 1u), rand(x, y, u_frame, 2u)) - 0.5)
      * 2.0 * u_jitterRadius;
    ivec2 texel = ivec2(clamp(v_uv * u_sourceSize + jitter, vec2(0.0), u_sourceSize - 1.0));
    outColor = vec4(texelFetch(u_source, texel, 0).rgb, 1.0);
  } else {
    float keep = u_halfLife <= 0.0 ? 0.0 : exp(-0.69314718 * u_dt / u_halfLife);
    outColor = vec4(mix(base, prev, keep), 1.0);
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
```

- [ ] **Step 2: Write `src/core/gl.ts`**

```ts
export interface Target {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const compile = (type: number, source: string): WebGLShader => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Failed to create shader.');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile error: ${log}`);
    }
    return shader;
  };
  const vs = compile(gl.VERTEX_SHADER, vertexSource);
  const fs = compile(gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create program.');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${log}`);
  }
  return program;
}

/** RGBA8 render-target texture, NEAREST/clamped (exact ping-pong reads). */
export function createTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error('Failed to create texture.');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

export function createTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): Target {
  const texture = createTexture(gl, width, height);
  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) throw new Error('Failed to create framebuffer.');
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`Framebuffer incomplete: 0x${status.toString(16)}`);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { texture, framebuffer };
}

/** Draws the fullscreen triangle from VERT_SRC (no VAO/attributes needed). */
export function drawFullscreen(gl: WebGL2RenderingContext): void {
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
```

- [ ] **Step 3: Type-check**

Run: `yarn tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/shaders.ts src/core/gl.ts
git commit -m "feat: sparkle/base/detail/blit shaders and webgl2 helpers"
```

---

### Task 4: `SparkleRenderer`

**Files:**
- Create: `src/core/renderer.ts`

**Interfaces:**
- Consumes: everything Task 2 + Task 3 produce (`SparkleParams`, `defaultParams`, all shader strings, `createProgram`, `createTarget`, `drawFullscreen`, `Target`).
- Produces:
  - `type ViewMode = 'effect' | 'base' | 'detail'`
  - `class SparkleRenderer`:
    - `constructor(canvas: HTMLCanvasElement)` — throws `Error('WebGL2 is not supported in this browser.')` if no context.
    - `setImage(image: ImageBitmap): void` — uploads source (flipped Y, LINEAR), downscales above `MAX_TEXTURE_SIZE` with `console.warn`, rebuilds targets, seeds state with base.
    - `setSize(width: number, height: number): void` — device-pixel buffer size.
    - `setParams(partial: Partial<SparkleParams>): void` — re-renders base when `sharpen` changes.
    - `getParams(): SparkleParams`
    - `render(dt: number, mode: ViewMode, paused: boolean): void` — one sim step (skipped when paused) + composite to screen.
- No unit tests (WebGL2 required); verified in Task 6. Type-check gate only.

- [ ] **Step 1: Write `src/core/renderer.ts`**

```ts
import { createProgram, createTarget, drawFullscreen, type Target } from './gl';
import { defaultParams, type SparkleParams } from './params';
import { BASE_FRAG, BLIT_FRAG, DETAIL_FRAG, SPARKLE_FRAG, VERT_SRC } from './shaders';

export type ViewMode = 'effect' | 'base' | 'detail';

export class SparkleRenderer {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private baseProgram: WebGLProgram;
  private detailProgram: WebGLProgram;
  private sparkleProgram: WebGLProgram;
  private blitProgram: WebGLProgram;
  private source: WebGLTexture | null = null;
  private sourceWidth = 0;
  private sourceHeight = 0;
  private base: Target | null = null;
  private detail: Target | null = null;
  private stateRead: Target | null = null;
  private stateWrite: Target | null = null;
  private frameIndex = 0;
  private params: SparkleParams = { ...defaultParams };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('WebGL2 is not supported in this browser.');
    this.gl = gl;
    this.baseProgram = createProgram(gl, VERT_SRC, BASE_FRAG);
    this.detailProgram = createProgram(gl, VERT_SRC, DETAIL_FRAG);
    this.sparkleProgram = createProgram(gl, VERT_SRC, SPARKLE_FRAG);
    this.blitProgram = createProgram(gl, VERT_SRC, BLIT_FRAG);
  }

  getParams(): SparkleParams {
    return { ...this.params };
  }

  setParams(partial: Partial<SparkleParams>): void {
    const sharpenChanged =
      partial.sharpen !== undefined && partial.sharpen !== this.params.sharpen;
    this.params = { ...this.params, ...partial };
    if (sharpenChanged && this.source) this.renderBase();
  }

  setImage(image: ImageBitmap): void {
    const gl = this.gl;
    const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    let bitmap = image;
    if (image.width > maxSize || image.height > maxSize) {
      const scale = Math.min(maxSize / image.width, maxSize / image.height);
      const w = Math.max(1, Math.floor(image.width * scale));
      const h = Math.max(1, Math.floor(image.height * scale));
      console.warn(
        `Image ${image.width}x${image.height} exceeds MAX_TEXTURE_SIZE ${maxSize}; downscaling to ${w}x${h}.`,
      );
      const off = new OffscreenCanvas(w, h);
      const ctx = off.getContext('2d');
      if (!ctx) throw new Error('2D context unavailable for downscaling.');
      ctx.drawImage(image, 0, 0, w, h);
      bitmap = off.transferToImageBitmap();
    }
    if (this.source) gl.deleteTexture(this.source);
    const texture = gl.createTexture();
    if (!texture) throw new Error('Failed to create source texture.');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.source = texture;
    this.sourceWidth = bitmap.width;
    this.sourceHeight = bitmap.height;
    this.rebuildTargets();
  }

  setSize(width: number, height: number): void {
    if (width === this.canvas.width && height === this.canvas.height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    if (this.source) this.rebuildTargets();
  }

  render(dt: number, mode: ViewMode, paused: boolean): void {
    const gl = this.gl;
    if (!this.source || !this.base || !this.detail || !this.stateRead || !this.stateWrite) {
      return;
    }
    const w = this.canvas.width;
    const h = this.canvas.height;

    if (!paused) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.stateWrite.framebuffer);
      gl.viewport(0, 0, w, h);
      gl.useProgram(this.sparkleProgram);
      this.bindTexture(this.sparkleProgram, 'u_prev', 0, this.stateRead.texture);
      this.bindTexture(this.sparkleProgram, 'u_base', 1, this.base.texture);
      this.bindTexture(this.sparkleProgram, 'u_detail', 2, this.detail.texture);
      this.bindTexture(this.sparkleProgram, 'u_source', 3, this.source);
      gl.uniform2f(this.loc(this.sparkleProgram, 'u_sourceSize'), this.sourceWidth, this.sourceHeight);
      gl.uniform1f(this.loc(this.sparkleProgram, 'u_dt'), dt);
      gl.uniform1f(this.loc(this.sparkleProgram, 'u_density'), this.params.density);
      gl.uniform1f(this.loc(this.sparkleProgram, 'u_halfLife'), this.params.halfLife);
      gl.uniform1f(this.loc(this.sparkleProgram, 'u_edgeInfluence'), this.params.edgeInfluence);
      gl.uniform1f(this.loc(this.sparkleProgram, 'u_edgeGamma'), this.params.edgeGamma);
      gl.uniform1f(this.loc(this.sparkleProgram, 'u_jitterRadius'), this.params.jitterRadius);
      gl.uniform1ui(this.loc(this.sparkleProgram, 'u_frame'), this.frameIndex >>> 0);
      drawFullscreen(gl);
      const swap = this.stateRead;
      this.stateRead = this.stateWrite;
      this.stateWrite = swap;
      this.frameIndex++;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.blitProgram);
    this.bindTexture(this.blitProgram, 'u_state', 0, this.stateRead.texture);
    this.bindTexture(this.blitProgram, 'u_base', 1, this.base.texture);
    this.bindTexture(this.blitProgram, 'u_detail', 2, this.detail.texture);
    gl.uniform1f(this.loc(this.blitProgram, 'u_intensity'), this.params.intensity);
    gl.uniform1i(
      this.loc(this.blitProgram, 'u_mode'),
      mode === 'base' ? 1 : mode === 'detail' ? 2 : 0,
    );
    drawFullscreen(gl);
  }

  private loc(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    return this.gl.getUniformLocation(program, name);
  }

  private bindTexture(
    program: WebGLProgram,
    name: string,
    unit: number,
    texture: WebGLTexture,
  ): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.loc(program, name), unit);
  }

  private rebuildTargets(): void {
    const gl = this.gl;
    const w = Math.max(1, this.canvas.width);
    const h = Math.max(1, this.canvas.height);
    for (const target of [this.base, this.detail, this.stateRead, this.stateWrite]) {
      if (target) {
        gl.deleteTexture(target.texture);
        gl.deleteFramebuffer(target.framebuffer);
      }
    }
    this.base = createTarget(gl, w, h);
    this.detail = createTarget(gl, w, h);
    this.stateRead = createTarget(gl, w, h);
    this.stateWrite = createTarget(gl, w, h);
    this.frameIndex = 0;
    this.renderBase();
    this.renderDetail();
    // Seed both state buffers so the first frames decay from the base image.
    this.renderBaseInto(this.stateRead);
    this.renderBaseInto(this.stateWrite);
  }

  private renderBase(): void {
    if (this.base) this.renderBaseInto(this.base);
  }

  private renderBaseInto(target: Target): void {
    const gl = this.gl;
    if (!this.source) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.baseProgram);
    this.bindTexture(this.baseProgram, 'u_source', 0, this.source);
    gl.uniform2f(this.loc(this.baseProgram, 'u_outputSize'), this.canvas.width, this.canvas.height);
    gl.uniform1f(this.loc(this.baseProgram, 'u_sharpen'), this.params.sharpen);
    drawFullscreen(gl);
  }

  private renderDetail(): void {
    const gl = this.gl;
    if (!this.detail || !this.source) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.detail.framebuffer);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.detailProgram);
    this.bindTexture(this.detailProgram, 'u_source', 0, this.source);
    gl.uniform2f(this.loc(this.detailProgram, 'u_sourceSize'), this.sourceWidth, this.sourceHeight);
    drawFullscreen(gl);
  }
}
```

- [ ] **Step 2: Type-check**

Run: `yarn tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/renderer.ts
git commit -m "feat: SparkleRenderer with ping-pong spark simulation"
```

---

### Task 5: Demo page

**Files:**
- Create: `index.html`
- Create: `src/demo/testcard.ts`
- Create: `src/demo/main.ts`

**Interfaces:**
- Consumes: `SparkleRenderer`, `ViewMode` from `../core/renderer`; `defaultParams`, `SparkleParams` from `../core/params`.
- Produces: the running demo (`yarn dev`), plus `createTestCard(width?: number, height?: number): Promise<ImageBitmap>`.

- [ ] **Step 1: Write `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sparkle Motion</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        display: flex;
        height: 100vh;
        background: #101014;
        color: #d8d8de;
        font: 13px/1.5 system-ui, sans-serif;
      }
      #stage {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
      }
      #view { max-width: 100%; max-height: 100%; }
      #status {
        position: absolute;
        bottom: 12px;
        left: 12px;
        color: #f0a0a0;
      }
      #panel {
        width: 300px;
        flex: none;
        padding: 16px;
        overflow-y: auto;
        background: #16161c;
        border-left: 1px solid #2a2a33;
      }
      #panel h1 { font-size: 15px; margin: 0 0 12px; color: #fff; }
      .control { margin-bottom: 10px; }
      .control label { display: flex; justify-content: space-between; }
      .control input[type="range"] { width: 100%; }
      .row { margin: 12px 0; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
      button { background: #2a2a33; color: #d8d8de; border: 1px solid #3a3a44; border-radius: 4px; padding: 6px 10px; cursor: pointer; }
      button:active { background: #44445a; }
      .hint { color: #77777f; }
      #fps { font-variant-numeric: tabular-nums; color: #9f9fb0; }
    </style>
  </head>
  <body>
    <main id="stage">
      <canvas id="view"></canvas>
      <div id="status"></div>
    </main>
    <aside id="panel">
      <h1>Sparkle Motion</h1>
      <div id="controls"></div>
      <div class="row"><button id="ab">Hold to compare (plain bilinear)</button></div>
      <div class="row">
        <label><input type="checkbox" id="pause" /> Pause</label>
        <label><input type="checkbox" id="detailmap" /> Detail map</label>
      </div>
      <div class="row"><input type="file" id="file" accept="image/*" /></div>
      <div class="row"><span id="fps"></span></div>
      <p class="hint">Drag &amp; drop a high-resolution photo anywhere on the page.</p>
    </aside>
    <script type="module" src="/src/demo/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Write `src/demo/testcard.ts`**

```ts
/**
 * Synthetic ~12.6MP test card: smooth sky gradient (low detail — should not
 * sparkle), a zone plate (rings sweeping past Nyquist), and checkerboards of
 * decreasing pitch with noise. Takes a few hundred ms at startup.
 */
export async function createTestCard(width = 4096, height = 3072): Promise<ImageBitmap> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable for test card.');
  const image = ctx.createImageData(width, height);
  const d = image.data;
  const skyEnd = Math.floor(height * 0.3);
  const cx = width * 0.25;
  const cy = skyEnd + (height - skyEnd) * 0.5;
  const bandHeight = (height - skyEnd) / 6;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let r: number;
      let g: number;
      let b: number;
      if (y < skyEnd) {
        const t = y / skyEnd;
        r = 90 + 40 * t;
        g = 140 + 40 * t;
        b = 220 - 30 * t;
      } else if (x < width / 2) {
        const dx = x - cx;
        const dy = y - cy;
        const v = 128 + 127 * Math.sin((dx * dx + dy * dy) * 0.002);
        r = v;
        g = v;
        b = v;
      } else {
        const band = Math.floor((y - skyEnd) / bandHeight);
        const pitch = 1 << Math.min(band + 1, 6);
        const check = ((Math.floor(x / pitch) + Math.floor(y / pitch)) & 1) === 0;
        const noise = (Math.random() - 0.5) * 24;
        const v = (check ? 190 : 60) + noise;
        r = v;
        g = v * 0.95;
        b = v * 0.85;
      }
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return createImageBitmap(canvas);
}
```

- [ ] **Step 3: Write `src/demo/main.ts`**

```ts
import { defaultParams, type SparkleParams } from '../core/params';
import { SparkleRenderer, type ViewMode } from '../core/renderer';
import { createTestCard } from './testcard';

interface SliderSpec {
  key: keyof SparkleParams;
  label: string;
  min: number;
  max: number;
  step: number;
}

const sliderSpecs: SliderSpec[] = [
  { key: 'density', label: 'Spark density (events/px/s)', min: 0, max: 60, step: 0.5 },
  { key: 'halfLife', label: 'Decay half-life (s)', min: 0.02, max: 2, step: 0.01 },
  { key: 'edgeInfluence', label: 'Edge influence', min: 0, max: 1, step: 0.01 },
  { key: 'edgeGamma', label: 'Edge gamma', min: 0.25, max: 4, step: 0.05 },
  { key: 'jitterRadius', label: 'Jitter radius (texels)', min: 0, max: 32, step: 1 },
  { key: 'sharpen', label: 'Base sharpen', min: 0, max: 2, step: 0.05 },
  { key: 'intensity', label: 'Effect intensity', min: 0, max: 1, step: 0.01 },
];

const canvas = document.getElementById('view') as HTMLCanvasElement;
const stage = document.getElementById('stage') as HTMLElement;
const controls = document.getElementById('controls') as HTMLElement;
const status = document.getElementById('status') as HTMLElement;
const fpsEl = document.getElementById('fps') as HTMLElement;
const abButton = document.getElementById('ab') as HTMLButtonElement;
const pauseBox = document.getElementById('pause') as HTMLInputElement;
const detailBox = document.getElementById('detailmap') as HTMLInputElement;
const fileInput = document.getElementById('file') as HTMLInputElement;

let imageAspect = 4 / 3;
let abHeld = false;

function buildControls(renderer: SparkleRenderer): void {
  for (const spec of sliderSpecs) {
    const wrap = document.createElement('div');
    wrap.className = 'control';
    const label = document.createElement('label');
    const name = document.createElement('span');
    name.textContent = spec.label;
    const value = document.createElement('span');
    value.textContent = String(defaultParams[spec.key]);
    label.append(name, value);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.value = String(defaultParams[spec.key]);
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      value.textContent = String(v);
      renderer.setParams({ [spec.key]: v } as Partial<SparkleParams>);
    });
    wrap.append(label, input);
    controls.append(wrap);
  }
}

function fitCanvas(renderer: SparkleRenderer): void {
  const rect = stage.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  let w = rect.width;
  let h = w / imageAspect;
  if (h > rect.height) {
    h = rect.height;
    w = h * imageAspect;
  }
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  renderer.setSize(Math.max(1, Math.round(w * dpr)), Math.max(1, Math.round(h * dpr)));
}

function loadBitmap(renderer: SparkleRenderer, bitmap: ImageBitmap): void {
  imageAspect = bitmap.width / bitmap.height;
  renderer.setImage(bitmap);
  fitCanvas(renderer);
  status.textContent = '';
}

async function loadFile(renderer: SparkleRenderer, file: File): Promise<void> {
  try {
    const bitmap = await createImageBitmap(file);
    loadBitmap(renderer, bitmap);
  } catch {
    status.textContent = `Could not decode "${file.name}" as an image.`;
  }
}

async function main(): Promise<void> {
  let renderer: SparkleRenderer;
  try {
    renderer = new SparkleRenderer(canvas);
  } catch (err) {
    status.textContent = err instanceof Error ? err.message : String(err);
    return;
  }

  buildControls(renderer);

  abButton.addEventListener('pointerdown', () => { abHeld = true; });
  abButton.addEventListener('pointerup', () => { abHeld = false; });
  abButton.addEventListener('pointerleave', () => { abHeld = false; });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) void loadFile(renderer, file);
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) void loadFile(renderer, file);
  });
  window.addEventListener('resize', () => fitCanvas(renderer));

  status.textContent = 'Generating test card…';
  const testCard = await createTestCard();
  loadBitmap(renderer, testCard);

  let last = performance.now();
  let frames = 0;
  let acc = 0;
  const tick = (now: number): void => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const mode: ViewMode = detailBox.checked ? 'detail' : abHeld ? 'base' : 'effect';
    renderer.render(dt, mode, pauseBox.checked);
    frames += 1;
    acc += dt;
    if (acc >= 0.5) {
      fpsEl.textContent = `${Math.round(frames / acc)} fps`;
      frames = 0;
      acc = 0;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

void main();
```

- [ ] **Step 4: Type-check and build**

Run: `yarn tsc --noEmit && yarn build`
Expected: no type errors; vite build succeeds.

- [ ] **Step 5: Commit**

```bash
git add index.html src/demo/testcard.ts src/demo/main.ts
git commit -m "feat: demo page with test card, sliders, A/B compare, drag-drop"
```

---

### Task 6: Browser verification and default tuning

**Files:**
- Modify (if tuning needed): `src/core/params.ts` (defaults only)

**Interfaces:**
- Consumes: the full demo from Tasks 1–5.
- Produces: verified working prototype; screenshots for the user.

- [ ] **Step 1: Start the dev server in the background**

Run: `yarn dev` (background)
Expected: "Local: http://localhost:5173/".

- [ ] **Step 2: Open in browser via available browser automation tooling**

Navigate to `http://localhost:5173/`. Wait for the test card to generate.

- [ ] **Step 3: Verify console is clean**

Expected: no shader compile errors, no WebGL warnings (a MAX_TEXTURE_SIZE
downscale warning is acceptable only for oversized drag-dropped images, not the
test card).

- [ ] **Step 4: Visual checks (screenshot each)**

1. Default view: sparkle visible on zone plate + fine checkerboards; sky band
   mostly calm (edge weighting working).
2. "Detail map" toggle: sky ≈ black, checkers/zone plate bright.
3. Hold-to-compare: static bilinear image, visibly softer in fine-pitch bands.
4. Pause: animation freezes; FPS readout continues.
5. Move density and half-life sliders to extremes; no errors, effect responds.

- [ ] **Step 5: Tune defaults if needed**

If sparkle is invisible or overwhelming at defaults on the test card, adjust
`defaultParams` (density/halfLife/edgeGamma) in `src/core/params.ts`, re-run
`yarn vitest run` (defaults test must still pass), and re-check visually.

- [ ] **Step 6: Commit any tuning + final state**

```bash
git add -A
git commit -m "feat: verified prototype in browser; tuned defaults"
```
