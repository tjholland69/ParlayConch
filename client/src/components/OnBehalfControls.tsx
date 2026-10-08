import { useState } from "react";
import type { Game, LeagueMemberWithUser, MemberWeekParlay, OnBehalfInfo, WeekLockStatus } from "@shared/schema";
import { legChipLabel } from "@shared/formatPick";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Check, LockOpen, UserCheck, X } from "lucide-react";
import { getDisplayName } from "@/lib/displayName";
import {
  useOnBehalfInfo,
  useRequestUnlock,
  useResolveLegApproval,
  useResolveUnlockRequest,
  useSetPickDelegate,
} from "@/hooks/use-on-behalf";

const VIA_TEXT: Record<NonNullable<OnBehalfInfo["via"]>, string> = {
  maestro: "As Parlay Maestro you can pick for anyone.",
  lieutenant: "As a Lieutenant you can pick for anyone in this league.",
  granted: "These members said you can pick for them.",
};

/**
 * The way into (and out of) On Behalf Of mode on the open parlay. Renders
 * nothing for a member who can't pick for anyone. With one member to pick
 * for it's a single button; with several it asks who. While the mode is on
 * it's a banner naming who the picks are for, with an Exit button.
 */
export function OnBehalfBar({
  info,
  targetId,
  onChange,
}: {
  info: OnBehalfInfo | undefined;
  targetId: string | undefined;
  onChange: (userId: string | undefined) => void;
}) {
  const [choosing, setChoosing] = useState(false);
  if (!info || info.targets.length === 0) return null;
  const target = info.targets.find((t) => t.userId === targetId);

  if (target) {
    return (
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3"
        data-testid="banner-on-behalf-mode"
      >
        <div className="flex items-center gap-2 text-sm">
          <UserCheck className="h-4 w-4 shrink-0 text-amber-400" />
          <span>
            <span className="font-semibold text-amber-300">On Behalf Of {target.name}.</span>{" "}
            <span className="text-muted-foreground">The pick you make is theirs, and they'll be asked to approve it.</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {info.targets.length > 1 && (
            <Select value={target.userId} onValueChange={(v) => onChange(v)}>
              <SelectTrigger className="h-8 w-44 border-amber-500/30 bg-background text-xs" data-testid="select-on-behalf-switch">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {info.targets.map((t) => <SelectItem key={t.userId} value={t.userId}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" variant="outline" className="h-8 border-amber-500/40" onClick={() => onChange(undefined)} data-testid="button-exit-on-behalf">
            <X className="mr-1 h-4 w-4" />
            Exit
          </Button>
        </div>
      </div>
    );
  }

  if (choosing && info.targets.length > 1) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-card/40 px-4 py-3" data-testid="prompt-on-behalf-who">
        <span className="text-sm text-muted-foreground">Pick on behalf of…</span>
        <Select onValueChange={(v) => { setChoosing(false); onChange(v); }}>
          <SelectTrigger className="h-8 w-52 bg-background text-xs" data-testid="select-on-behalf-who">
            <SelectValue placeholder="Choose a member" />
          </SelectTrigger>
          <SelectContent>
            {info.targets.map((t) => <SelectItem key={t.userId} value={t.userId}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="ghost" className="h-8" onClick={() => setChoosing(false)}>Cancel</Button>
      </div>
    );
  }

  return (
    <div className="flex justify-end">
      <Button
        size="sm"
        variant="outline"
        title={info.via ? VIA_TEXT[info.via] : undefined}
        onClick={() => (info.targets.length === 1 ? onChange(info.targets[0].userId) : setChoosing(true))}
        data-testid="button-on-behalf-mode"
      >
        <UserCheck className="mr-1 h-4 w-4" />
        {info.targets.length === 1 ? `Pick On Behalf Of ${info.targets[0].name}` : "On Behalf Of…"}
      </Button>
    </div>
  );
}

/**
 * Picks in the open parlay that someone made for another member and that
 * are still waiting on that member. The member sees Approve / Reject on
 * theirs; the Parlay Maestro sees every one, and can decide in their place.
 */
export function PendingApprovals({
  parlay,
  games,
  members,
  viewerId,
  isAdmin,
  leagueId,
  weekId,
}: {
  parlay: MemberWeekParlay | null | undefined;
  games: Game[];
  members: LeagueMemberWithUser[] | undefined;
  viewerId: string | undefined;
  isAdmin: boolean;
  leagueId: number;
  weekId: number;
}) {
  const resolve = useResolveLegApproval(leagueId, weekId);
  const pending = (parlay?.legs ?? []).filter((l) => l.approvalStatus === "pending");
  if (pending.length === 0) return null;
  const nameOf = (userId: string | null | undefined) =>
    userId === viewerId ? "you" : getDisplayName(members?.find((m) => m.userId === userId)?.user, "a member");

  return (
    <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3" data-testid="panel-pending-approvals">
      <p className="text-sm font-semibold">
        {pending.length === 1 ? "A pick is" : `${pending.length} picks are`} waiting on approval
      </p>
      <p className="text-xs text-muted-foreground">
        A pick made on a member's behalf has to be approved by that member before the parlay can be submitted or locked. The Parlay Maestro can override.
      </p>
      {pending.map((leg) => {
        const mine = leg.userId === viewerId;
        const canDecide = mine || isAdmin;
        return (
          <div key={leg.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background/40 px-3 py-2" data-testid={`row-pending-approval-${leg.id}`}>
            <div className="min-w-0 text-sm">
              <span className="font-medium">{legChipLabel(leg, games.find((g) => g.id === leg.gameId))}</span>
              <span className="block text-xs text-muted-foreground">
                Picked by {nameOf(leg.placedByUserId)} for {nameOf(leg.userId)}
              </span>
            </div>
            {canDecide ? (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-8"
                  disabled={resolve.isPending}
                  onClick={() => resolve.mutate({ legId: leg.id, action: "approve" })}
                  data-testid={`button-approve-pick-${leg.id}`}
                >
                  <Check className="mr-1 h-4 w-4" />
                  {mine ? "Approve" : "Override: approve"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={resolve.isPending}
                  onClick={() => resolve.mutate({ legId: leg.id, action: "reject" })}
                  data-testid={`button-reject-pick-${leg.id}`}
                >
                  <X className="mr-1 h-4 w-4" />
                  {mine ? "Reject" : "Remove"}
                </Button>
              </div>
            ) : (
              <Badge variant="outline" className="border-amber-500/40 text-amber-300">Waiting on {nameOf(leg.userId)}</Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Members tab: who the caller lets make their pick for them. */
export function PickDelegatesCard({
  leagueId,
  members,
  selfId,
}: {
  leagueId: number;
  members: LeagueMemberWithUser[] | undefined;
  selfId: string | undefined;
}) {
  const { data: info } = useOnBehalfInfo(leagueId);
  const setDelegate = useSetPickDelegate(leagueId);
  const others = (members ?? []).filter((m) => m.userId !== selfId && m.isActive !== false);
  if (!info || others.length === 0) return null;
  const allowed = new Set(info.myDelegateIds);

  return (
    <Card className="bg-card/50 border-white/5" data-testid="card-pick-delegates">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCheck className="h-5 w-5 text-primary" />
          On Behalf Of
        </CardTitle>
        <CardDescription>
          Choose who can make your pick for you. You're asked to approve any pick made for you before it counts. The Parlay Maestro can always pick for anyone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {others.map((m) => (
          <label key={m.userId} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2 text-sm" data-testid={`row-pick-delegate-${m.userId}`}>
            <span>
              {getDisplayName(m.user)}
              {m.role === "admin" && <span className="ml-2 text-xs text-muted-foreground">Parlay Maestro: always allowed</span>}
            </span>
            <Switch
              checked={m.role === "admin" || allowed.has(m.userId)}
              disabled={m.role === "admin" || setDelegate.isPending}
              onCheckedChange={(allow) => setDelegate.mutate({ delegateUserId: m.userId, allow })}
              aria-label={`Let ${getDisplayName(m.user)} pick for me`}
            />
          </label>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Under the "parlay is locked" banner: a Request Unlock button for a member
 * who can't unlock it themselves, and the waiting requests (with Unlock and
 * Dismiss) for whoever can.
 */
export function UnlockRequests({
  leagueId,
  weekId,
  lockStatus,
}: {
  leagueId: number;
  weekId: number;
  lockStatus: WeekLockStatus;
}) {
  const requestUnlock = useRequestUnlock(leagueId, weekId);
  const resolve = useResolveUnlockRequest(leagueId, weekId);
  const viewer = lockStatus.viewer;
  const requests = lockStatus.openUnlockRequests ?? [];

  return (
    <>
      {viewer?.canRequestUnlock && (
        viewer.hasOpenRequest ? (
          <p className="mt-2 text-xs text-amber-300" data-testid="text-unlock-requested">
            You've asked for this week to be unlocked. Waiting on the Parlay Maestro.
          </p>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="mt-2 h-8"
            disabled={requestUnlock.isPending}
            onClick={() => requestUnlock.mutate(undefined)}
            data-testid="button-request-unlock"
          >
            <LockOpen className="mr-1 h-4 w-4" />
            Request unlock
          </Button>
        )
      )}
      {requests.map((r) => (
        <div key={r.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background/40 px-3 py-2" data-testid={`row-unlock-request-${r.id}`}>
          <span className="text-sm">
            <span className="font-medium">{r.requestedByName}</span> asked for an unlock
            {r.reason ? <span className="text-muted-foreground">: "{r.reason}"</span> : null}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-8" disabled={resolve.isPending} onClick={() => resolve.mutate({ requestId: r.id, action: "grant" })} data-testid={`button-grant-unlock-${r.id}`}>
              <LockOpen className="mr-1 h-4 w-4" />
              Unlock
            </Button>
            <Button size="sm" variant="ghost" className="h-8" disabled={resolve.isPending} onClick={() => resolve.mutate({ requestId: r.id, action: "dismiss" })} data-testid={`button-dismiss-unlock-${r.id}`}>
              Dismiss
            </Button>
          </div>
        </div>
      ))}
    </>
  );
}
