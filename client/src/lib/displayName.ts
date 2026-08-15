// Shared "who is this" resolution used anywhere a user's name is rendered.
// Priority: settings.displayName -> firstName (+ lastName) -> email -> fallback.
export type NamedUser = {
  settings?: unknown;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
} | null | undefined;

export function getDisplayName(user: NamedUser, fallback = "Unknown"): string {
  const displayName = (user?.settings as any)?.displayName;
  if (displayName) return displayName;
  if (user?.firstName) {
    return user.lastName ? `${user.firstName} ${user.lastName}`.trim() : user.firstName;
  }
  return user?.email || fallback;
}

// Member pickers list people by first name (we never show last name in the UI),
// so sort on that instead of last name.
export function sortByFirstName<T extends { user?: NamedUser }>(members: T[]): T[] {
  return [...members].sort((a, b) => {
    const aName = a.user?.firstName || getDisplayName(a.user, "");
    const bName = b.user?.firstName || getDisplayName(b.user, "");
    return aName.localeCompare(bName, undefined, { sensitivity: "base" });
  });
}

export function getDisplayInitial(user: NamedUser, fallback = "?"): string {
  const name = getDisplayName(user, "");
  return name ? name[0].toUpperCase() : fallback;
}

// Truncates a user id for display, tolerating null/undefined — legacy or
// bulk-imported rows can have a missing owner id even where the schema
// declares the column NOT NULL (e.g. pre-constraint data).
export function shortId(id: string | null | undefined, len = 6): string {
  return id ? id.slice(0, len) : "unknown";
}
