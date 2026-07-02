/** True if the file is probably HEIC/HEIF (iPhone photos). Browsers often
 * report an empty MIME type for these, so also check the extension. */
export function isLikelyHeic(file: File): boolean {
  if (file.type === 'image/heic' || file.type === 'image/heif') return true;
  return /\.hei[cf]$/i.test(file.name);
}

/**
 * Decode an image file to an ImageBitmap. Tries the browser's native decoder
 * first; falls back to libheif (wasm, lazily loaded) for HEIC/HEIF, which no
 * browser decodes natively.
 */
export async function decodeImageFile(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    if (!isLikelyHeic(file)) {
      throw new Error(`Could not decode "${file.name}" as an image.`);
    }
  }
  try {
    const { default: libheif } = await import('libheif-js/wasm-bundle');
    const decoder = new libheif.HeifDecoder();
    const images = decoder.decode(await file.arrayBuffer());
    if (images.length === 0) throw new Error('file contains no images');
    const image = images[0];
    const imageData = new ImageData(image.get_width(), image.get_height());
    await new Promise<void>((resolve, reject) => {
      image.display(imageData, (result) => {
        if (result) resolve();
        else reject(new Error('HEIF pixel decode failed'));
      });
    });
    return await createImageBitmap(imageData);
  } catch (err) {
    const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
    throw new Error(`Could not decode HEIC file "${file.name}"${detail}.`);
  }
}
