import { defaultParams, type SparkBlendMode, type SparkleParams } from '../core/params';
import { SparkleRenderer, type ViewMode } from '../core/renderer';
import { decodeImageFile } from './decode';
import { createTestCard } from './testcard';

type NumericParamKey = {
  [K in keyof SparkleParams]: SparkleParams[K] extends number ? K : never;
}[keyof SparkleParams];

interface SliderSpec {
  key: NumericParamKey;
  label: string;
  min: number;
  max: number;
  step: number;
  /** >1 compresses the slider's low end for fine control of subtle values. */
  curve?: number;
  /** One-line description shown under the label and as a tooltip. */
  hint: string;
}

const sliderSpecs: SliderSpec[] = [
  {
    key: 'density',
    label: 'Spark density (events/px/s)',
    min: 0,
    max: 60,
    step: 0.5,
    curve: 3,
    hint: 'How often each pixel fires a spark. Low values = sparse, calm shimmer.',
  },
  {
    key: 'halfLife',
    label: 'Decay half-life (s)',
    min: 0.02,
    max: 10,
    step: 0.01,
    curve: 3,
    hint: 'How long a fired spark takes to fade halfway back to the base image.',
  },
  {
    key: 'edgeInfluence',
    label: 'Edge influence',
    min: 0,
    max: 1,
    step: 0.01,
    hint: '0 = sparks everywhere, 1 = sparks only where the edge map is bright.',
  },
  {
    key: 'edgeGamma',
    label: 'Edge gamma',
    min: 0.25,
    max: 4,
    step: 0.05,
    hint: 'Contrast on the edge map: higher = only the strongest edges spark.',
  },
  {
    key: 'lightInfluence',
    label: 'Light influence',
    min: 0,
    max: 1,
    step: 0.01,
    hint: 'Photon model: brighter areas emit more sparks (multiplies with edge weighting).',
  },
  {
    key: 'lightLow',
    label: 'Light levels: low',
    min: 0,
    max: 1,
    step: 0.01,
    hint: 'Luminance at or below this emits nothing from the light map.',
  },
  {
    key: 'lightMid',
    label: 'Light levels: midpoint',
    min: 0.05,
    max: 0.95,
    step: 0.01,
    hint: 'Luminance that maps to 50% emission — drag left to open up shadows, right to favor highlights.',
  },
  {
    key: 'lightHigh',
    label: 'Light levels: high',
    min: 0,
    max: 1,
    step: 0.01,
    hint: 'Luminance at or above this gets full light-map emission.',
  },
  {
    key: 'highlightBias',
    label: 'Highlight bias',
    min: 0,
    max: 1,
    step: 0.01,
    hint: 'Chance a spark takes the brightest of 4 candidate texels — recovers glints that averaging destroys.',
  },
  {
    key: 'jitterRadius',
    label: 'Jitter radius (texels)',
    min: 0,
    max: 32,
    step: 1,
    hint: 'How far into its high-res footprint each spark may sample, in source pixels.',
  },
  {
    key: 'sharpen',
    label: 'Base sharpen',
    min: 0,
    max: 2,
    step: 0.05,
    hint: 'Unsharp mask on the static downsampled base image.',
  },
  {
    key: 'sparkStrength',
    label: 'Spark strength',
    min: 0,
    max: 1,
    step: 0.01,
    hint: 'How far a spark moves toward the true pixel value. Low = gentle nudges.',
  },
  {
    key: 'intensity',
    label: 'Effect intensity',
    min: 0,
    max: 1,
    step: 0.01,
    hint: 'Master blend: 0 shows only the base image, 1 the full effect.',
  },
];

const SLIDER_RESOLUTION = 1000;

function formatValue(v: number): string {
  if (v >= 10) return v.toFixed(1);
  if (v >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

const canvas = document.getElementById('view') as HTMLCanvasElement;
const stage = document.getElementById('stage') as HTMLElement;
const controls = document.getElementById('controls') as HTMLElement;
const status = document.getElementById('status') as HTMLElement;
const fpsEl = document.getElementById('fps') as HTMLElement;
const abButton = document.getElementById('ab') as HTMLButtonElement;
const pauseBox = document.getElementById('pause') as HTMLInputElement;
const blendSelect = document.getElementById('blend') as HTMLSelectElement;
const viewSelect = document.getElementById('viewmode') as HTMLSelectElement;
const fileInput = document.getElementById('file') as HTMLInputElement;

let imageAspect = 4 / 3;
let abHeld = false;

function buildControls(renderer: SparkleRenderer): void {
  for (const spec of sliderSpecs) {
    const wrap = document.createElement('div');
    wrap.className = 'control';
    wrap.title = spec.hint;
    const label = document.createElement('label');
    const name = document.createElement('span');
    name.textContent = spec.label;
    const value = document.createElement('span');
    value.textContent = formatValue(defaultParams[spec.key]);
    label.append(name, value);
    const input = document.createElement('input');
    input.type = 'range';
    const curve = spec.curve ?? 1;
    const toValue = (raw: number): number =>
      spec.min + (spec.max - spec.min) * Math.pow(raw / SLIDER_RESOLUTION, curve);
    const toRaw = (v: number): number =>
      SLIDER_RESOLUTION * Math.pow((v - spec.min) / (spec.max - spec.min), 1 / curve);
    if (curve !== 1) {
      input.min = '0';
      input.max = String(SLIDER_RESOLUTION);
      input.step = '1';
      input.value = String(toRaw(defaultParams[spec.key]));
    } else {
      input.min = String(spec.min);
      input.max = String(spec.max);
      input.step = String(spec.step);
      input.value = String(defaultParams[spec.key]);
    }
    input.addEventListener('input', () => {
      const raw = parseFloat(input.value);
      const v = curve !== 1 ? toValue(raw) : raw;
      value.textContent = formatValue(v);
      renderer.setParams({ [spec.key]: v } as Partial<SparkleParams>);
    });
    const hint = document.createElement('div');
    hint.className = 'control-hint';
    hint.textContent = spec.hint;
    wrap.append(label, hint, input);
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
  status.textContent = `Loading "${file.name}"…`;
  try {
    const bitmap = await decodeImageFile(file);
    loadBitmap(renderer, bitmap);
  } catch (err) {
    status.textContent = err instanceof Error ? err.message : String(err);
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

  blendSelect.value = defaultParams.blendMode;
  blendSelect.addEventListener('change', () => {
    renderer.setParams({ blendMode: blendSelect.value as SparkBlendMode });
  });

  abButton.addEventListener('pointerdown', () => {
    abHeld = true;
  });
  abButton.addEventListener('pointerup', () => {
    abHeld = false;
  });
  abButton.addEventListener('pointerleave', () => {
    abHeld = false;
  });

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
    const mode: ViewMode = abHeld ? 'base' : (viewSelect.value as ViewMode);
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
