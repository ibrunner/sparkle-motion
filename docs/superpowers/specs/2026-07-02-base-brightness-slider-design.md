# Base-brightness slider — design

## Goal

Add a "Base brightness" control that darkens the baseline the sparks sit on,
without touching how sparks are emitted. Because some spark blend modes are
additive (screen/dodge/add), a bright base saturates quickly and the sparks
lose contrast. A darker baseline gives additive sparks room to read.

The darken behaves like a black layer painted **on top of the source but below
the sparks**: all emission/analysis (edge map, light map) continues to read the
full-brightness source, so no other slider changes behaviour.

## Parameter

- `baseBrightness: number`, range `0`–`1`, default `1` (= unchanged).
- Multiplier applied to base RGB where the base is the *visible baseline*.
- `1` leaves everything as today; lower values darken the floor.

## Where it applies

`base` (the downsampled source) is consumed in several roles. The darken
multiplier applies to the **visible-baseline** roles only, never the
**emission** roles.

| Location | `base` role | Darken? |
|---|---|---|
| `SPARKLE_FRAG` — `lum(base)` for `lightC` | light-emission weight | No |
| `SPARKLE_FRAG` — `decayed = mix(base, prev, keep)` | decay target | Yes |
| `SPARKLE_FRAG` — `blendSpark(decayed, spark)` | blend underlying | Yes (via `decayed`) |
| `BLIT_FRAG` — `lightC` weight | debug weight (modes 2/3) | No |
| `BLIT_FRAG` — mode 0 `mix(base, state, u_intensity)` | shown baseline / intensity-off image | Yes |
| `BLIT_FRAG` — mode 1 (base debug view) | "base only" view | Yes (show the real composited floor) |

Key mechanic: compute `vec3 dark = base * u_baseBrightness;` **after** taking
`lum(base)`. Emission reads original `base`; decay target and blend underlying
read `dark`. Since `prev` was produced against `dark` in earlier frames, decay
stays self-consistent — sparks fade to the darkened floor.

`BASE_FRAG` is deliberately **not** changed (that would dim emission too).

## Implementation surface

- `params.ts` — add `baseBrightness` field, default `1`, doc comment.
- `shaders.ts` — `uniform float u_baseBrightness;` in `SPARKLE_FRAG` and
  `BLIT_FRAG`; introduce `dark` and route baseline roles through it.
- `renderer.ts` — one `uniform1f` in the sparkle pass, one in the blit pass.
- `main.ts` — one `SliderSpec`.

## Control

- Label: "Base brightness".
- Placement: immediately after "Base sharpen" (groups with base-image controls).
- Range `0`–`1`, `curve: 3` (fine resolution near black), default `1`.
- Hint: "Darkens the baseline the sparks sit on, below the sparks — additive
  blend modes read better against a darker floor. Emission is unaffected."

## Out of scope

- No change to emission maps, drift, burst, or blend math.
- No per-channel or colored darkening — single scalar multiply only.
- Debug weight views (modes 2/3) keep reading the true source.

## Testing

- `params.test.ts` is formula-only; `baseBrightness` adds no formula, so no unit
  test is required. Verify visually: at `1.0` output is identical to before; at
  low values the base darkens while spark emission density (mode 2 weight view)
  is unchanged.
