import { useAuth } from "@/hooks/use-auth";
import { resolveAccentHex } from "@/lib/theme";

/** The current user's chosen accent color (Settings → Appearance), resolved
 * to a hex value every component can render with. Falls back to the default
 * blue before the user's settings have loaded or if none is set. */
export function useAccentColor(): string {
  const { user } = useAuth();
  return resolveAccentHex((user?.settings as any)?.primaryColor);
}
