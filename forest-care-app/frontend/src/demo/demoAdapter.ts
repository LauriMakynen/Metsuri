import { AxiosError, AxiosHeaders, getAdapter, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { isDemoActive } from './demoMode';
import { DemoHttpError, matchDemoRoute } from './demoBackend';
import { saveDemoState } from './demoStore';

// Axios adapter for the guest demo: requests the demo knows are answered from the in-browser
// demo data, everything else (forest value, cadastre, auth) goes to the server as usual.

const DEMO_LATENCY_MS = 120;

function parseUrl(config: InternalAxiosRequestConfig): { path: string; query: Record<string, string> } {
  const url = new URL(config.url ?? '', 'http://demo.local');
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });
  for (const [key, value] of Object.entries((config.params ?? {}) as Record<string, unknown>)) {
    if (value !== undefined && value !== null) query[key] = String(value);
  }
  return { path: url.pathname, query };
}

function parseBody(data: unknown): unknown {
  if (typeof data !== 'string') return data ?? null;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

function headerRecord(config: InternalAxiosRequestConfig): Record<string, string> {
  const headers: Record<string, string> = {};
  Object.entries(AxiosHeaders.from(config.headers).toJSON()).forEach(([key, value]) => {
    if (typeof value === 'string') headers[key.toLowerCase()] = value;
  });
  return headers;
}

export function createDemoAwareAdapter(defaultAdapter: AxiosAdapter): AxiosAdapter {
  return async (config) => {
    if (!isDemoActive()) return defaultAdapter(config);
    const method = (config.method ?? 'get').toUpperCase();
    const { path, query } = parseUrl(config);
    const route = matchDemoRoute(method, path);
    if (!route) return defaultAdapter(config);

    // A short pause, so loading states look like they do with a real server
    await new Promise((resolve) => window.setTimeout(resolve, DEMO_LATENCY_MS));
    try {
      const result = await route.handler({
        method,
        path,
        params: route.params,
        query,
        body: parseBody(config.data),
        headers: headerRecord(config),
      });
      if (method !== 'GET') saveDemoState();
      const response: AxiosResponse = {
        data: result.data ?? '',
        status: result.status ?? 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config,
      };
      return response;
    } catch (error) {
      if (error instanceof AxiosError) throw error;
      const status = error instanceof DemoHttpError ? error.status : 500;
      const message = error instanceof Error ? error.message : 'Demo error';
      const response: AxiosResponse = {
        data: { error: status === 500 ? 'Internal server error' : message },
        status,
        statusText: 'Error',
        headers: new AxiosHeaders(),
        config,
      };
      throw new AxiosError(message, status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST, config, null, response);
    }
  };
}

export const demoAwareAdapter: AxiosAdapter = createDemoAwareAdapter(getAdapter(['xhr', 'http', 'fetch']));
