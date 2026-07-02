# Sparkle Motion Prototype — Design

**Date:** 2026-07-01
**Status:** Approved
**Supersedes/refines:** `DESIGN.md` (Stochastic Detail Illumination concept doc)

## Goal

A web-based prototype demonstrating temporal detail illumination: a high-resolution
photo (e.g. 15MP) displayed at canvas resolution, where edge-weighted stochastic
"spark" events momentarily reveal true high-res texels, fading back to a sharpened
bilinear base. On a high-refresh display the eye integrates these events into
perceived detail beyond what static downsampling conveys.

## Decisions made

- **Renderer:** WebGL2 fragment-shader stochastic sampling (not a CPU particle
  list). Particle behavior emerges from per-pixel weighted dice rolls; scales to
  millions of events/sec at 120Hz.
- **Sampling model:** discrete spark events with temporal decay (the particle
  aesthetic). Hybrid TAA-jitter + sparks is backlogged.
- **Stack:** Vite + vanilla TypeScript. Library core is framework-agnostic;
  demo page is plain DOM. No React/Tailwind for the prototype.

## Architecture

```
src/
  core/            # the library (framework-agnostic)
    analysis.ts    # detail/edge map generation
    renderer.ts    # WebGL2 context, textures, ping-pong render loop
    params.ts      # typed tunable parameters + dt-normalization math
    shaders/       # GLSL: sparkle.frag, detail.frag, fullscreen vert, blit
  demo/
    main.ts        # drag-drop image loading, slider panel, toggles, FPS
index.html         # demo page
public/            # bundled sample image(s)
```

## Pipeline (one-time, per loaded image)

1. Decode image file → `ImageBitmap` → full-res GPU texture. Images larger than
   `MAX_TEXTURE_SIZE` are downscaled at decode with a console warning.
2. **Base pass:** bilinear downsample to canvas resolution with optional
   unsharp-mask sharpening (slider), rendered to a base texture.
3. **Detail map pass:** Sobel edge magnitude on source luminance, downsampled to
   canvas resolution, normalized to [0,1]. This is the spark-emission weight map.
   Debug-viewable via toggle.

## Per-frame loop

Two RGBA state textures in ping-pong; state = currently displayed color per pixel.

- **Decay:** `state = mix(base, prevState, exp(-dt / halfLife))` — lit pixels
  relax toward the base image.
- **Fire:** PCG-hash noise of (pixel coord, frame index) rolls a per-pixel die.
  Fire probability `p = 1 - exp(-rate * weight * dt)` where `rate` is the global
  density slider and `weight` comes from the detail map (with influence + gamma
  sliders). A firing pixel snaps to one randomly chosen texel within its
  high-res footprint (jitter radius slider).
- **Output:** state, blended with base by the master effect-intensity slider.

Rate-based `dt` normalization makes the time-integrated image identical across
60/120/144Hz displays.

## Controls

| Control | Kind | Meaning |
|---|---|---|
| Spark density | slider | expected fire events per pixel per second (global rate) |
| Decay half-life | slider | fade time back to base |
| Edge influence | slider | 0 = uniform sparkle → 1 = fully edge-weighted |
| Edge gamma | slider | contrast curve on the detail map |
| Jitter radius | slider | footprint radius sparks sample from |
| Base sharpen | slider | unsharp-mask amount on the base image |
| Effect intensity | slider | master blend, 0 = plain base |
| Pause | toggle | freeze animation |
| Show detail map | toggle | debug view of emission weights |
| A/B compare | hold button | show plain bilinear while held |
| FPS | readout | render loop health |

## Error handling

- No WebGL2 context → replace canvas with a clear message.
- Image decode failure → non-blocking error message, previous image stays.
- Oversized images → downscale to `MAX_TEXTURE_SIZE`, warn.

## Testing

- **Unit (vitest):** CPU-side math — dt-normalized probability/decay conversions,
  param mapping, analysis helpers that are pure functions.
- **Visual/manual:** in-browser against a bundled sample image and user-supplied
  high-res photos via drag-drop; A/B hold-to-compare is the acceptance check for
  "does perceived detail improve".

## Backlog (explicitly out of scope for this prototype)

- Hybrid mode: TAA-style jittered supersampling base + sparks on edges.
- Cursor/touch attracts detail; device-motion input.
- Blue-noise texture instead of hash noise for nicer event distribution.
- Accessibility static fallback mode; reduced-motion media query handling.
- npm packaging of `core/` as a standalone library.
