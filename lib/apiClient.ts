import { API_BASE_URL } from './config';

function isAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export function buildQuery(params: Record<string, any> = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry === undefined || entry === null || entry === '') {
          return;
        }
        search.append(key, String(entry));
      });
      return;
    }
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export function buildUrl(path: string, params?: Record<string, any>, baseUrl = API_BASE_URL) {
  const normalizedBase = baseUrl.replace(/\/$/, '');
  const resolvedPath = isAbsoluteUrl(path)
    ? path
    : `${normalizedBase}${path.startsWith('/') ? '' : '/'}${path}`;
  return params ? `${resolvedPath}${buildQuery(params)}` : resolvedPath;
}

export async function apiJson(
  path: string,
  {
    method = 'GET',
    body,
    token,
    headers,
    baseUrl,
  }: {
    method?: string;
    body?: any;
    token?: string | null;
    headers?: Record<string, string>;
    baseUrl?: string;
  } = {}
) {
  const resolvedUrl = buildUrl(path, undefined, baseUrl);
  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(headers || {}),
  };
  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }
  const isBinaryBody =
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body);
  let payloadBody = body;
  if (body && !isBinaryBody && !requestHeaders['Content-Type']) {
    requestHeaders['Content-Type'] = 'application/json';
  }
  if (body && requestHeaders['Content-Type'] === 'application/json') {
    payloadBody = JSON.stringify(body);
  }
  let response: Response;
  try {
    response = await fetch(resolvedUrl, {
      method,
      headers: requestHeaders,
      body: payloadBody,
    });
  } catch (error: any) {
    return {
      ok: false,
      status: 0,
      error: {
        message: 'Network error',
        details: error?.message || null,
      },
    } as const;
  }
  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (payload && typeof payload === 'object' && 'ok' in payload) {
    if (!payload.ok) {
      return {
        ok: false,
        status: response.status,
        error: payload.error || { message: 'Request failed' },
      } as const;
    }
    return {
      ok: true,
      status: response.status,
      data: payload.data,
      meta: payload.meta || null,
    } as const;
  }
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: payload?.error || { message: 'Request failed' },
    } as const;
  }
  return { ok: true, status: response.status, data: payload, meta: null } as const;
}
