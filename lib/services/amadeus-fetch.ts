import { AMADEUS_CONFIG, getAccessToken } from '@/lib/services/amadeus-auth';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isAuthError(status: number) {
  return status === 401 || status === 403;
}

function isRetriableStatus(status: number) {
  return status >= 500 || status === 408 || status === 429;
}

function computeBackoffMs(attempt: number, retryAfterHeader?: string | null) {
  if (retryAfterHeader) {
    const secs = Number(retryAfterHeader);
    if (!Number.isNaN(secs) && secs >= 0) return Math.min(5000, Math.max(500, secs * 1000));
  }
  const base = 400; // ms
  const jitter = Math.floor(Math.random() * 150);
  return Math.min(5000, base * Math.pow(2, attempt) + jitter); // 400, 800, 1600 (+jitter)
}

export interface AmadeusFetchInit extends RequestInit {
  maxRetries?: number; // number of retries after first attempt (default 3)
}

// path should start with '/v1' or '/v2'
export async function amadeusFetch(path: string, init: AmadeusFetchInit = {}): Promise<Response> {
  const maxRetries = init.maxRetries ?? 3; // retries after the first attempt
  let attempt = 0;

  // Prepare headers (case-insensitive map handling)
  const headers = new Headers(init.headers || {});

  // Prepare body: stringify when content-type json and body is object
  let body = init.body as any;
  const contentType = headers.get('Content-Type') || headers.get('content-type');
  if (body && typeof body === 'object' && (!contentType || contentType.includes('application/json'))) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }

  const url = `${AMADEUS_CONFIG.baseUrl}${path}`;

  // loop: initial attempt + retries
  // total attempts = 1 + maxRetries
  while (true) {
    const token = await getAccessToken();
    headers.set('Authorization', `Bearer ${token}`);
    let resp: Response;
    try {
      resp = await fetch(url, { ...init, headers, body });
    } catch (err) {
      // network error - retry if attempts left
      if (attempt < maxRetries) {
        const delay = computeBackoffMs(attempt);
        await sleep(delay);
        attempt++;
        continue;
      }
      throw err;
    }

    if (resp.ok) return resp;

    if (isAuthError(resp.status)) {
      // do not retry auth errors
      return resp;
    }

    if (isRetriableStatus(resp.status) && attempt < maxRetries) {
      const retryAfter = resp.headers.get('Retry-After');
      const delay = computeBackoffMs(attempt, retryAfter);
      await sleep(delay);
      attempt++;
      continue;
    }

    return resp;
  }
}