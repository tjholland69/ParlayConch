import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

/**
 * The base URL of the Parlay.Club API server.
 * In development: set EXPO_PUBLIC_API_URL in your .env
 * In production:  set extra.apiUrl in app.json
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ||
  "http://localhost:5000";

const SESSION_KEY = "parlayclub_session";

export async function getSessionToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_KEY);
}

export async function setSessionToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, token);
}

export async function clearSessionToken(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * Typed API request helper — mirrors the web app's apiRequest in queryClient.ts.
 * Automatically includes the session token if available.
 */
export async function apiRequest<T = unknown>(
  method: Method,
  path: string,
  body?: unknown
): Promise<T> {
  const token = await getSessionToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    headers["Cookie"] = `connect.sid=${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `${response.status} ${response.statusText}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/**
 * Default query function for TanStack Query.
 * Automatically prefixes paths with the API base URL.
 */
export async function defaultQueryFn<T>({ queryKey }: { queryKey: readonly unknown[] }): Promise<T> {
  const path = queryKey[0] as string;
  return apiRequest<T>("GET", path);
}
