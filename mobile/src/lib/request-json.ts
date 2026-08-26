type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * Pure fetch helper — no Expo / SecureStore imports so unit tests can cover
 * auth header + error mapping without loading react-native.
 */
export async function requestJson<T = unknown>(opts: {
  baseUrl: string;
  method: Method;
  path: string;
  body?: unknown;
  token?: string | null;
}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (opts.token) {
    // Native iOS overrides a manually-set `Cookie` header via its own
    // NSURLSession cookie jar, so we send the session token as a Bearer
    // header instead; the server translates it back into the session cookie.
    headers.Authorization = `Bearer ${opts.token}`;
  }

  const response = await fetch(`${opts.baseUrl}${opts.path}`, {
    method: opts.method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `${response.status} ${response.statusText}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
