import { describe, expect, it, vi } from 'vitest';
import { cleanName, cleanText, isForumReportReason, shouldHideReportedPost } from '../forum';
import { isForumAdmin } from '../../middleware/forum';

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

describe('forum report moderation rules', () => {
  it('hides a post at the threshold of three distinct open reports', () => {
    expect(shouldHideReportedPost(2)).toBe(false);
    expect(shouldHideReportedPost(3)).toBe(true);
    expect(shouldHideReportedPost(4)).toBe(true);
  });

  it('accepts only supported report reasons', () => {
    expect(isForumReportReason('abusive_language')).toBe(true);
    expect(isForumReportReason('personal_information')).toBe(true);
    expect(isForumReportReason('invalid')).toBe(false);
    expect(isForumReportReason(null)).toBe(false);
  });
});

describe('forum role checks', () => {
  it('allows only the admin role to moderate', () => {
    expect(isForumAdmin('admin')).toBe(true);
    expect(isForumAdmin('user')).toBe(false);
    expect(isForumAdmin(undefined)).toBe(false);
  });
});
