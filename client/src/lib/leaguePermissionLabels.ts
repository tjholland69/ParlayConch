import type { LieutenantPermissions } from "@shared/schema";

/** Human-readable descriptions of the grantable lieutenant permission flags,
 * grouped for display. Shared between League Settings (where admins toggle
 * these per league) and the roles explainer dialog, so the two can't drift. */
export const PERMISSION_LABELS: { key: keyof LieutenantPermissions; label: string; description: string; group: string }[] = [
  // Parlay management
  { key: "approveRejectParlays", label: "Approve / Reject Parlays", description: "Can approve or reject pending parlay submissions", group: "Parlay Management" },
  { key: "editParlays", label: "Edit Parlays", description: "Can edit parlay picks and leg results", group: "Parlay Management" },
  { key: "lockParlay", label: "Lock Weekly Parlay", description: "Can lock the week's parlay to prevent further submissions", group: "Parlay Management" },
  { key: "unlockParlay", label: "Unlock Weekly Parlay", description: "Can unlock a previously locked parlay to re-open submissions", group: "Parlay Management" },
  { key: "unselectUserPick", label: "Remove a Member's Pick", description: "Can clear an individual pick from another member's parlay (secondary approvals will apply)", group: "Parlay Management" },
  // Member management
  { key: "approveMemberInvites", label: "Approve Member Invites", description: "Can approve pending invite requests submitted by regular members", group: "Member Management" },
  // Data & admin
  { key: "markLeagueDemo", label: "Mark League as Demo", description: "Can toggle the league's demo/QA flag", group: "Data & Admin" },
];
