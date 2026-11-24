import { describe, expect, it, vi } from 'vitest';
import { workAreaWarning } from '../workAreaCheck';

// The pure verdict does not touch the database; stub the pool so importing needs no DATABASE_URL
vi.mock('../../db/pool', () => ({ default: { query: vi.fn() } }));

describe('workAreaWarning', () => {
  it('accepts forest work on forest land', () => {
    expect(workAreaWarning('harvennus', { fieldShare: 0, forestShare: 0.95 })).toBeNull();
  });

  it('warns about forest work on a field', () => {
    expect(workAreaWarning('istutus', { fieldShare: 0.8, forestShare: 0.1 })).toMatch(/peltoa/);
  });

  it('warns when there is no forest, e.g. in a built-up area', () => {
    expect(workAreaWarning('harvennus', { fieldShare: 0, forestShare: 0 })).toMatch(/rakennettua/);
    expect(workAreaWarning('vesakonhoito', { fieldShare: null, forestShare: 0.2 })).toMatch(/metsää/);
  });

  it('does not check other work such as road and culvert repairs', () => {
    expect(workAreaWarning('muu_tyo', { fieldShare: 1, forestShare: 0 })).toBeNull();
  });

  it('lets the request through when the sources could not be checked', () => {
    expect(workAreaWarning('avohakkuu', { fieldShare: null, forestShare: null })).toBeNull();
  });
});
