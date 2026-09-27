import { logger } from "../logger";

async function backoff(label: string, attempt: number): Promise<void> {
  const delayMs = 500 * 2 ** attempt;
  logger.warn(`[${label}] attempt ${attempt + 1} failed, retrying in ${delayMs}ms`);
  await new Promise((r) => setTimeout(r, delayMs));
}

/**
 * fetch() with retry/backoff for transient failures — a network-level
 * exception (DNS, timeout, connection reset) or a 5xx response is retried
 * with exponential backoff; a 4xx response (bad request, bad API key, 404)
 * is surfaced immediately since retrying it can't succeed.
 */
export async function fetchWithRetry(
  url: string,
  opts: { retries?: number; headers?: Record<string, string>; label?: string } = {},
): Promise<Response> {
  const { retries = 2, headers, label = "fetch" } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, headers ? { headers } : undefined);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await backoff(label, attempt);
      continue;
    }

    if (res.ok) return res;

    if (res.status < 500) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`${label} failed: ${res.status} ${res.statusText} — ${text}`);
    }

    lastErr = new Error(`${label} failed: ${res.status} ${res.statusText} — ${url}`);
    if (attempt < retries) await backoff(label, attempt);
  }

  throw lastErr;
}

export async function fetchJsonWithRetry(
  url: string,
  opts?: { retries?: number; headers?: Record<string, string>; label?: string },
): Promise<any> {
  const res = await fetchWithRetry(url, opts);
  return res.json();
}
