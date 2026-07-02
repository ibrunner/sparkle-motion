import { describe, expect, it } from 'vitest';
import { isLikelyHeic } from './decode';

describe('isLikelyHeic', () => {
  it('detects by MIME type', () => {
    expect(isLikelyHeic(new File([], 'photo', { type: 'image/heic' }))).toBe(true);
    expect(isLikelyHeic(new File([], 'photo', { type: 'image/heif' }))).toBe(true);
  });

  it('detects by extension when the browser reports no MIME type', () => {
    expect(isLikelyHeic(new File([], 'IMG_1234.HEIC', { type: '' }))).toBe(true);
    expect(isLikelyHeic(new File([], 'clip.heif', { type: '' }))).toBe(true);
  });

  it('rejects ordinary images', () => {
    expect(isLikelyHeic(new File([], 'photo.jpg', { type: 'image/jpeg' }))).toBe(false);
    expect(isLikelyHeic(new File([], 'photo.png', { type: '' }))).toBe(false);
  });
});
