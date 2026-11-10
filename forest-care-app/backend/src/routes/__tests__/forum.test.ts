import { describe, expect, it, vi } from 'vitest';
import { cleanName, cleanText } from '../forum';

// The validators do not touch the database; stub the pool so importing needs no DATABASE_URL
vi.mock('../../db/pool', () => ({ default: { query: vi.fn(), connect: vi.fn() } }));

describe('cleanText', () => {
  it('trims and accepts text within the limits', () => {
    expect(cleanText('  Hei kaikki  ', 3, 150)).toBe('Hei kaikki');
  });

  it('collapses long runs of blank lines', () => {
    expect(cleanText('eka\r\n\r\n\r\n\r\ntoka', 1, 100)).toBe('eka\n\ntoka');
  });

  it('rejects empty, too short, too long and non-string values', () => {
    expect(cleanText('   ', 1, 100)).toBeNull();
    expect(cleanText('ab', 3, 100)).toBeNull();
    expect(cleanText('x'.repeat(101), 1, 100)).toBeNull();
    expect(cleanText(42, 1, 100)).toBeNull();
    expect(cleanText(undefined, 1, 100)).toBeNull();
  });
});

describe('cleanName', () => {
  it('keeps a nickname on one line with single spaces', () => {
    expect(cleanName('  Metsä\n  Matti ')).toBe('Metsä Matti');
  });

  it('rejects too short and too long nicknames', () => {
    expect(cleanName('M')).toBeNull();
    expect(cleanName('x'.repeat(41))).toBeNull();
    expect(cleanName(null)).toBeNull();
  });
});
