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
