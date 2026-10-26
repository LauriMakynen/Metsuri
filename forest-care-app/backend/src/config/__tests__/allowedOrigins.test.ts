import { describe, expect, it } from 'vitest';
import { getAllowedOrigins, isAllowedOrigin } from '../allowedOrigins';

describe('allowed frontend origins', () => {
  it('combines the primary and additional origins and removes whitespace and trailing slashes', () => {
    expect(
      getAllowedOrigins(
        ' https://metsuri.vercel.app/ ',
        'https://preview.vercel.app, https://custom.example/'
      )
    ).toEqual(['https://metsuri.vercel.app', 'https://preview.vercel.app', 'https://custom.example']);
  });

  it('uses the local frontend when no primary origin is configured', () => {
    expect(getAllowedOrigins()).toEqual(['http://localhost:5173']);
  });

  it('allows configured origins and local development, but rejects unconfigured origins', () => {
    const allowedOrigins = getAllowedOrigins('https://metsuri.vercel.app');

    expect(isAllowedOrigin('https://metsuri.vercel.app', allowedOrigins)).toBe(true);
    expect(isAllowedOrigin('http://localhost:3000', allowedOrigins)).toBe(true);
    expect(isAllowedOrigin(undefined, allowedOrigins)).toBe(true);
    expect(isAllowedOrigin('https://attacker.example', allowedOrigins)).toBe(false);
    expect(isAllowedOrigin('https://metsuri.vercel.app.attacker.example', allowedOrigins)).toBe(false);
  });
});
