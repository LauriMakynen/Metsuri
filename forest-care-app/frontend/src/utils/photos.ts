import { useEffect, useRef } from 'react';
import { workRequestsService } from '../services/forestService';
import type { WorkRequest } from '../types';

// Photos are shrunk in the browser before upload: fast on a mobile connection, and re-encoding
// drops the EXIF block, so the GPS position or camera details never leave the phone.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;
const EXIF_SCAN_BYTES = 256 * 1024;

export const MAX_PHOTOS_PER_REQUEST = 10;

export interface PreparedPhoto {
  key: string;
  blob: Blob;
  previewUrl: string;
  takenAt: Date | null;
}

// "YYYY:MM:DD HH:MM:SS" in the camera's local time
function parseExifDate(value: string): Date | null {
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match.map(Number);
  if (y < 1990) return null;
  const date = new Date(y, mo - 1, d, h, mi, s);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Capture time from a JPEG's EXIF (DateTimeOriginal, else DateTime); null when missing. */
export function readExifDateTaken(buffer: ArrayBuffer): Date | null {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;

  // Find the APP1 "Exif" segment
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null;
    const length = view.getUint16(offset + 2);
    if (marker === 0xffe1 && offset + 10 <= view.byteLength && view.getUint32(offset + 4) === 0x45786966) {
      return readTiffDate(view, offset + 10, Math.min(offset + 2 + length, view.byteLength));
    }
    offset += 2 + length;
  }
  return null;
}

function readTiffDate(view: DataView, tiff: number, end: number): Date | null {
  if (tiff + 8 > end) return null;
  const little = view.getUint16(tiff) === 0x4949;
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);

  // Returns the tag's ASCII value, or for EXIF_IFD_POINTER the offset as a string
  const readIfd = (ifdOffset: number): Map<number, string | number> => {
    const tags = new Map<number, string | number>();
    const start = tiff + ifdOffset;
    if (start + 2 > end) return tags;
    const count = u16(start);
    for (let i = 0; i < count; i++) {
      const entry = start + 2 + i * 12;
      if (entry + 12 > end) break;
      const tag = u16(entry);
      const type = u16(entry + 2);
      const n = u32(entry + 4);
      if (type === 4) {
        tags.set(tag, u32(entry + 8));
      } else if (type === 2 && n >= 19) {
        const at = tiff + u32(entry + 8);
        if (at + 19 > end) continue;
        let text = '';
        for (let c = 0; c < 19; c++) text += String.fromCharCode(view.getUint8(at + c));
        tags.set(tag, text);
      }
    }
    return tags;
  };

  const ifd0 = readIfd(u32(tiff + 4));
  const exifPointer = ifd0.get(0x8769);
  const exif = typeof exifPointer === 'number' ? readIfd(exifPointer) : new Map();
  const original = exif.get(0x9003) ?? exif.get(0x9004) ?? ifd0.get(0x0132);
  return typeof original === 'string' ? parseExifDate(original) : null;
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Fall back to an <img> element below (e.g. older Safari)
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function shrink(file: Blob): Promise<Blob> {
  const image = await decode(file);
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas');
    context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) throw new Error('encode');
    return blob;
  } finally {
    image.close();
  }
}

/**
 * Reads the capture time and shrinks a photo picked from the gallery or taken with the camera.
 * Throws a user-facing message when the file can't be read as an image.
 */
export async function preparePhoto(file: File, fromCamera: boolean): Promise<PreparedPhoto> {
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error(`${file.name} ei ole kuva`);
  }
  let takenAt: Date | null = null;
  try {
    takenAt = readExifDateTaken(await file.slice(0, EXIF_SCAN_BYTES).arrayBuffer());
  } catch {
    // Unreadable metadata only means the capture time is unknown
  }
  // A photo just taken with the camera has no reliable EXIF on every phone, but it was taken now
  if (!takenAt && fromCamera) takenAt = new Date(file.lastModified || Date.now());

  let blob: Blob;
  try {
    blob = await shrink(file);
  } catch {
    throw new Error(`Kuvaa ${file.name} ei voitu lukea. Kokeile toista kuvaa tai JPEG-muotoa.`);
  }
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    blob,
    previewUrl: URL.createObjectURL(blob),
    takenAt,
  };
}

export function releasePhoto(photo: PreparedPhoto): void {
  URL.revokeObjectURL(photo.previewUrl);
}

// Releases preview object URLs of photos left unsaved when the component unmounts
export function useReleaseOnUnmount(photos: PreparedPhoto[]) {
  const ref = useRef(photos);
  useEffect(() => {
    ref.current = photos;
  }, [photos]);
  useEffect(() => () => ref.current.forEach(releasePhoto), []);
}

export function photoErrorMessage(err: unknown, action = 'tallennus'): string {
  const response = (err as { response?: { data?: { error?: string } } }).response;
  if (response?.data?.error) return response.data.error;
  return response ? `Kuvan ${action} epäonnistui` : `Kuvan ${action} epäonnistui – tarkista verkkoyhteys`;
}

/**
 * Uploads photos one at a time so a slow connection isn't flooded. Stops at the first failure
 * and returns the photos that are still unsaved, so the user can try again.
 */
export async function uploadPhotos(
  requestId: number,
  photos: PreparedPhoto[],
  onProgress?: (done: number) => void
): Promise<{ updated: WorkRequest | null; remaining: PreparedPhoto[]; error: string | null }> {
  let updated: WorkRequest | null = null;
  for (let i = 0; i < photos.length; i++) {
    try {
      updated = await workRequestsService.uploadPhoto(requestId, photos[i].blob, photos[i].takenAt);
      releasePhoto(photos[i]);
      onProgress?.(i + 1);
    } catch (err) {
      return { updated, remaining: photos.slice(i), error: photoErrorMessage(err) };
    }
  }
  return { updated, remaining: [], error: null };
}

export function formatTakenAt(value: string | Date | null): string {
  if (!value) return 'Ottamisaika ei tiedossa';
  const date = typeof value === 'string' ? new Date(value) : value;
  return `Otettu ${date.toLocaleDateString('fi-FI')} klo ${date.toLocaleTimeString('fi-FI', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}
