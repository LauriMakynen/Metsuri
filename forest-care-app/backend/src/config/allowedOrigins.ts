export function getAllowedOrigins(frontendUrl?: string, frontendUrls?: string): string[] {
  const origins = [frontendUrl || 'http://localhost:5173', ...(frontendUrls ?? '').split(',')];
  const normalizedOrigins = origins.map((origin) => origin.trim().replace(/\/+$/, '')).filter(Boolean);
  return [...new Set(normalizedOrigins)];
}

export function isAllowedOrigin(
  origin: string | undefined,
  allowedOrigins: readonly string[]
): boolean {
  if (!origin) return true;
  if (/^http:\/\/localhost:\d+$/.test(origin)) return true;
  return allowedOrigins.includes(origin);
}
