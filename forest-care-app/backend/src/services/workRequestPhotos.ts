// Validation for photos attached to work requests. The browser shrinks photos before upload,
// so the size limit only needs to fit a resized JPEG with room to spare.

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const MAX_PHOTOS_PER_REQUEST = 10;

export type PhotoContentType = 'image/jpeg' | 'image/png' | 'image/webp';

// Earliest accepted capture time; older values are almost certainly a wrong camera clock
const MIN_TAKEN_AT = Date.UTC(1990, 0, 1);
// Allows for a phone clock that runs a bit ahead
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

/**
 * Image type detected from the file's magic bytes. The Content-Type header is not trusted,
 * so only real JPEG, PNG and WebP files are stored and served back.
 */
export function detectImageType(data: Buffer): PhotoContentType | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    data.length >= 12 &&
    data.toString('ascii', 0, 4) === 'RIFF' &&
    data.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Capture time sent by the client (ISO 8601). Missing, unparseable or implausible values
 * give null: the photo is still saved, just without a capture time.
 */
export function parseTakenAt(value: unknown, now: Date = new Date()): Date | null {
  if (typeof value !== 'string' || !value.trim() || value.length > 40) return null;
  const date = new Date(value.trim());
  const time = date.getTime();
  if (!Number.isFinite(time)) return null;
  if (time < MIN_TAKEN_AT || time > now.getTime() + MAX_FUTURE_MS) return null;
  return date;
}
