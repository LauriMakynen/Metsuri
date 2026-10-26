import { describe, expect, it } from 'vitest';
import { detectImageType, parseTakenAt } from '../workRequestPhotos';

describe('detectImageType', () => {
  it('recognises JPEG, PNG and WebP by magic bytes', () => {
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('image/jpeg');
    expect(
      detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))
    ).toBe('image/png');
    expect(detectImageType(Buffer.from('RIFF\x10\x00\x00\x00WEBPVP8 ', 'binary'))).toBe('image/webp');
  });

  it('rejects other content regardless of what the client claims', () => {
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(detectImageType(Buffer.from('GIF89a'))).toBeNull();
    expect(detectImageType(Buffer.from('RIFF\x10\x00\x00\x00WAVE', 'binary'))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
    expect(detectImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

describe('parseTakenAt', () => {
  const now = new Date('2026-10-26T12:00:00Z');

  it('accepts a plausible ISO timestamp', () => {
    expect(parseTakenAt('2026-10-20T08:15:00.000Z', now)?.toISOString()).toBe('2026-10-20T08:15:00.000Z');
  });

  it('allows a slightly fast phone clock', () => {
    expect(parseTakenAt('2026-10-26T20:00:00Z', now)).not.toBeNull();
  });

  it('ignores missing, invalid and implausible values', () => {
    expect(parseTakenAt(undefined, now)).toBeNull();
    expect(parseTakenAt(['2026-10-20'], now)).toBeNull();
    expect(parseTakenAt('', now)).toBeNull();
    expect(parseTakenAt('eilen', now)).toBeNull();
    expect(parseTakenAt('1980-01-01T00:00:00Z', now)).toBeNull();
    expect(parseTakenAt('2026-10-28T12:00:00Z', now)).toBeNull();
  });
});
