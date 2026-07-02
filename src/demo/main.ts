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
