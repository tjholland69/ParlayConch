import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { getDisplayName } from "@/lib/displayName";
import { useEffectiveUserId } from "@/hooks/use-acting-as";
import { useAddSubcommitteeMembers, useCreateSubcommittee } from "@/hooks/use-parlay-extras";
import { subcommitteeCandidates } from "@shared/subcommittee";
import type { LeagueWithMembers } from "@shared/schema";

type Member = LeagueWithMembers["members"][number];

/** The league's roster as a tick list: the only people a subcommittee can hold. */
function RosterPicker({ candidates, picked, onToggle, leagueName }: { candidates: Member[]; picked: Set<string>; onToggle: (userId: string) => void; leagueName: string }) {
  if (candidates.length === 0) {
    return <p className="text-sm text-muted-foreground italic">Everyone in {leagueName} is already in.</p>;
  }
  return (
    <div className="max-h-64 overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/5" data-testid="list-subcommittee-roster">
      {candidates.map((m) => (
        <label key={m.userId} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-white/5">
          <Checkbox checked={picked.has(m.userId)} onCheckedChange={() => onToggle(m.userId)} data-testid={`checkbox-subcommittee-member-${m.userId}`} />
          <span className="truncate">{getDisplayName(m.user, "Member")}</span>
        </label>
      ))}
    </div>
  );
}

function usePicked(open: boolean) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => { if (open) setPicked(new Set()); }, [open]);
  const toggle = (userId: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (!next.delete(userId)) next.add(userId);
    return next;
  });
  return { picked, toggle };
}

/**
 * Forms a subcommittee inside `parent`: a league of its own for some of the
 * league's members. Any member can form one, and runs it as its Frondeur.
 */
export function CreateSubcommitteeDialog({ parent, open, onOpenChange }: { parent: LeagueWithMembers; open: boolean; onOpenChange: (open: boolean) => void }) {
  const me = useEffectiveUserId();
  const create = useCreateSubcommittee(parent.id);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const { picked, toggle } = usePicked(open);
  useEffect(() => { if (open) { setName(""); setDescription(""); } }, [open]);
  const candidates = subcommitteeCandidates(parent.members, me ? [me] : []);

  const submit = () => {
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), description: description.trim() || undefined, memberUserIds: Array.from(picked) },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New subcommittee in {parent.name}</DialogTitle>
          <DialogDescription>
            A league of its own for some of {parent.name}'s members. Only the people in it can see it, and its
            picks don't count toward {parent.name}'s stats. You'll run it as its Frondeur.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Input placeholder="Subcommittee name" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-subcommittee-name" />
          <Input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} data-testid="input-subcommittee-description" />
          <div className="space-y-2">
            <p className="text-sm font-medium">Members <span className="text-muted-foreground font-normal">({picked.size} picked, plus you)</span></p>
            <RosterPicker candidates={candidates} picked={picked} onToggle={toggle} leagueName={parent.name} />
            <p className="text-xs text-muted-foreground">You can add more later.</p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={!name.trim() || create.isPending} data-testid="button-submit-subcommittee">
            {create.isPending ? "Creating..." : "Create subcommittee"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The Frondeur adds more of the league's members to their subcommittee. */
export function AddSubcommitteeMembersDialog({
  league,
  parent,
  currentMemberIds,
  open,
  onOpenChange,
}: {
  league: { id: number; name: string };
  /** The league it was formed in. Undefined while loading, or for a super user who isn't in it. */
  parent: LeagueWithMembers | undefined;
  /** Active members already in the subcommittee. */
  currentMemberIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const add = useAddSubcommitteeMembers(league.id);
  const { picked, toggle } = usePicked(open);
  const candidates = subcommitteeCandidates(parent?.members, currentMemberIds);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add members to {league.name}</DialogTitle>
          <DialogDescription>
            A subcommittee only takes members of {parent?.name ?? "its league"}. There's no invite code: pick them here.
          </DialogDescription>
        </DialogHeader>
        <RosterPicker candidates={candidates} picked={picked} onToggle={toggle} leagueName={parent?.name ?? "the league"} />
        <DialogFooter>
          <Button
            onClick={() => add.mutate(Array.from(picked), { onSuccess: () => onOpenChange(false) })}
            disabled={picked.size === 0 || add.isPending}
            data-testid="button-submit-add-subcommittee-members"
          >
            {add.isPending ? "Adding..." : picked.size > 1 ? `Add ${picked.size} members` : "Add member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
