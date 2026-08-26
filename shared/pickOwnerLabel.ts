// Formats "who owns this pick" for the picks-grid taken-tile indicator.
// Shared by server (computes it once, so a full last name is only ever
// shipped in this abbreviated "F.Lastname" form) and can be reused
// client-side wherever the same input shape is available.
//
// Priority mirrors client/src/lib/displayName.ts's getDisplayName: a custom
// settings.displayName wins, split on whitespace into "first"/"last" parts;
// otherwise firstName/lastName; otherwise email; otherwise a fallback.
export type PickOwnerNameSource = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  settings?: { displayName?: string | null } | null;
};

function resolveNameParts(user: PickOwnerNameSource): { first: string; last: string } {
  const displayName = user.settings?.displayName;
  if (displayName) {
    const parts = displayName.trim().split(/\s+/);
    return { first: parts[0], last: parts.slice(1).join(" ") };
  }
  if (user.firstName) {
    return { first: user.firstName, last: user.lastName ?? "" };
  }
  return { first: user.email ?? "Someone", last: "" };
}

export function formatPickOwnerLabel(user: PickOwnerNameSource): { web: string; mobile: string } {
  const { first, last } = resolveNameParts(user);
  const web = last ? `${first[0]?.toUpperCase() ?? ""}.${last}` : first;
  return { web, mobile: first };
}
