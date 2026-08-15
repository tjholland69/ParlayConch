import { useState } from "react";
import { Loader2 } from "lucide-react";
import { type CustomIndexWithAccess } from "@shared/schema";
import { useLeagues } from "@/hooks/use-bets";
import { useCreateCustomIndex, useUpdateCustomIndex, useLeagueMembers } from "@/hooks/use-custom-indexes";
import { MultiSelect } from "@/components/MultiSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { getDisplayName } from "@/lib/displayName";
import { BET_TYPE_OPTIONS, PROP_TYPE_OPTIONS } from "@/lib/bettingConstants";

export { BET_TYPE_OPTIONS as BET_TYPES } from "@/lib/bettingConstants";

type BuilderState = {
  displayName: string;
  leagueIds: string[];
  memberUserIds: string[];
  betTypes: string[];
  propTypes: string[];
  playerName: string;
  teamName: string;
  publish: boolean;
  publishedLeagueId: string;
};

const emptyBuilder: BuilderState = {
  displayName: "",
  leagueIds: [],
  memberUserIds: [],
  betTypes: [],
  propTypes: [],
  playerName: "",
  teamName: "",
  publish: false,
  publishedLeagueId: "",
};

/** Prefill for creating a new index from an existing filter selection (e.g. Advanced Filters). */
export type CustomIndexInitialValues = {
  displayName?: string;
  leagueIds?: number[];
  memberUserIds?: string[];
  betTypes?: string[];
  propTypes?: string[];
  playerName?: string;
  teamName?: string;
};

/** Create/edit dialog. `editing` non-null puts it in edit mode. */
export function CustomIndexBuilderDialog({
  open,
  onOpenChange,
  editing,
  initialValues,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: CustomIndexWithAccess | null;
  initialValues?: CustomIndexInitialValues;
}) {
  const { data: leagues } = useLeagues();
  const create = useCreateCustomIndex();
  const update = useUpdateCustomIndex();

  const [state, setState] = useState<BuilderState>(emptyBuilder);
  // Re-seed the form whenever the dialog opens onto a different target
  const [seededFor, setSeededFor] = useState<number | "new" | null>(null);
  const target = editing ? editing.id : ("new" as const);
  if (open && seededFor !== target) {
    setSeededFor(target);
    setState(
      editing
        ? {
            displayName: editing.displayName,
            leagueIds: (editing.filters?.leagueIds ?? []).map(String),
            memberUserIds: editing.filters?.memberUserIds ?? [],
            betTypes: editing.filters?.betTypes ?? [],
            propTypes: editing.filters?.propTypes ?? [],
            playerName: editing.filters?.playerName ?? "",
            teamName: editing.filters?.teamName ?? "",
            publish: editing.scope === "league",
            publishedLeagueId: editing.publishedLeagueId ? String(editing.publishedLeagueId) : "",
          }
        : {
            ...emptyBuilder,
            displayName: initialValues?.displayName ?? "",
            leagueIds: (initialValues?.leagueIds ?? []).map(String),
            memberUserIds: initialValues?.memberUserIds ?? [],
            betTypes: initialValues?.betTypes ?? [],
            propTypes: initialValues?.propTypes ?? [],
            playerName: initialValues?.playerName ?? "",
            teamName: initialValues?.teamName ?? "",
          }
    );
  }
  if (!open && seededFor !== null) setSeededFor(null);

  const selectedLeagueIds = state.leagueIds.map(Number);
  const { members } = useLeagueMembers(selectedLeagueIds);

  // Publishing a league default is a Parlay Maestro action, so the toggle only
  // appears when the user administers one of the selected leagues.
  const adminLeagues = (leagues ?? []).filter(
    (l) => l.isAdmin && (selectedLeagueIds.length === 0 || selectedLeagueIds.includes(l.id))
  );
  const canPublish = adminLeagues.length > 0;

  const submitting = create.isPending || update.isPending;
  const publishLeagueId = state.publishedLeagueId
    ? Number(state.publishedLeagueId)
    : adminLeagues[0]?.id;
  const valid =
    state.displayName.trim().length > 0 && (!state.publish || !!publishLeagueId);

  const submit = async () => {
    const payload = {
      displayName: state.displayName.trim(),
      scope: (state.publish && canPublish ? "league" : "private") as "league" | "private",
      publishedLeagueId: state.publish && canPublish ? publishLeagueId ?? null : null,
      filters: {
        leagueIds: selectedLeagueIds,
        memberUserIds: state.memberUserIds,
        betTypes: state.betTypes,
        propTypes: state.propTypes,
        playerName: state.playerName.trim(),
        teamName: state.teamName.trim(),
      },
    };

    try {
      if (editing) await update.mutateAsync({ id: editing.id, ...payload });
      else await create.mutateAsync(payload);
      onOpenChange(false);
    } catch {
      // Error is already surfaced via toast in the mutation hook — keep the dialog
      // open (e.g. duplicate-filter conflict) so the user can adjust and retry.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Custom Index" : "Create Custom Index"}</DialogTitle>
          <DialogDescription>
            An index is a saved comparison line. Leave a filter empty to include everything.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="index-name">Name</Label>
            <Input
              id="index-name"
              data-testid="input-index-name"
              placeholder="e.g. Spreads vs. the front office"
              value={state.displayName}
              onChange={(e) => setState((s) => ({ ...s, displayName: e.target.value }))}
              className="bg-background border-white/10"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Leagues</Label>
            <MultiSelect
              testId="input-index-leagues"
              placeholder="All my leagues"
              options={(leagues ?? []).map((l) => ({ value: String(l.id), label: l.name }))}
              selected={state.leagueIds}
              onChange={(next) =>
                // Dropping a league must also drop members that came only from it
                setState((s) => ({ ...s, leagueIds: next, memberUserIds: next.length === 0 ? [] : s.memberUserIds }))
              }
              emptyMessage="You're not in any leagues yet."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Members</Label>
            <MultiSelect
              testId="input-index-members"
              placeholder="All members"
              options={members.map((m) => ({
                value: m.userId,
                label: getDisplayName(m.user, m.user.email ?? "Member"),
              }))}
              selected={state.memberUserIds}
              onChange={(next) => setState((s) => ({ ...s, memberUserIds: next }))}
              emptyMessage="Pick a league first to choose members."
            />
            <p className="text-xs text-muted-foreground">
              Whose bets make up the comparison line. Empty means every member.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Bet Types</Label>
            <MultiSelect
              testId="input-index-bet-types"
              placeholder="All bet types"
              options={BET_TYPE_OPTIONS}
              selected={state.betTypes}
              onChange={(next) => setState((s) => ({ ...s, betTypes: next }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Prop Types</Label>
            <MultiSelect
              testId="input-index-prop-types"
              placeholder="All prop types"
              options={PROP_TYPE_OPTIONS}
              selected={state.propTypes}
              onChange={(next) => setState((s) => ({ ...s, propTypes: next }))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="index-player">Player</Label>
              <Input
                id="index-player"
                data-testid="input-index-player"
                placeholder="Any player"
                value={state.playerName}
                onChange={(e) => setState((s) => ({ ...s, playerName: e.target.value }))}
                className="bg-background border-white/10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="index-team">Team</Label>
              <Input
                id="index-team"
                data-testid="input-index-team"
                placeholder="Any team (e.g. KC)"
                value={state.teamName}
                onChange={(e) => setState((s) => ({ ...s, teamName: e.target.value }))}
                className="bg-background border-white/10"
              />
            </div>
          </div>

          {canPublish && (
            <div className="flex items-start justify-between gap-4 rounded-xl border border-white/10 p-3">
              <div>
                <Label htmlFor="index-publish" className="cursor-pointer">
                  Publish as league default
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Every member of {adminLeagues.find((l) => l.id === publishLeagueId)?.name ?? "the league"} sees
                  this index automatically.
                </p>
              </div>
              <Switch
                id="index-publish"
                data-testid="switch-index-publish"
                checked={state.publish}
                onCheckedChange={(checked) =>
                  setState((s) => ({
                    ...s,
                    publish: checked,
                    publishedLeagueId: s.publishedLeagueId || String(adminLeagues[0]?.id ?? ""),
                  }))
                }
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || submitting} data-testid="button-save-index">
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {editing ? "Save changes" : "Create index"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
