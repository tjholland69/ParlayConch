import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { requestJson } from "@/lib/request-json";

/**
 * The base URL of the Parlay.Conch API server.
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
  return requestJson<T>({
    baseUrl: API_BASE_URL,
    method,
    path,
    body,
    token,
  });
}

/**
 * Default query function for TanStack Query.
 * Automatically prefixes paths with the API base URL.
 */
export async function defaultQueryFn<T>({ queryKey }: { queryKey: readonly unknown[] }): Promise<T> {
  const path = queryKey[0] as string;
  return apiRequest<T>("GET", path);
}
