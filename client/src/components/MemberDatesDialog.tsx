import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDisplayName } from "@/lib/displayName";
import { useSetMemberDates } from "@/hooks/use-parlay-extras";
import type { LeagueMemberWithUser } from "@shared/schema";

const toDay = (d: string | Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");

/**
 * Parlay Maestro: when a member was in the league. A member is only Void,
 * and only loses participation, for parlays played inside these dates.
 */
export function MemberDatesDialog({ leagueId, member, onClose }: {
  leagueId: number;
  member: LeagueMemberWithUser | null;
  onClose: () => void;
}) {
  const save = useSetMemberDates(leagueId);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  useEffect(() => {
    setStart(toDay(member?.startDate));
    setEnd(toDay(member?.endDate));
  }, [member]);
  const hasLeft = member?.isActive === false;

  return (
    <Dialog open={!!member} onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{member ? `${getDisplayName(member.user)}'s dates` : "Member dates"}</DialogTitle>
          <DialogDescription>
            A member is only marked Void for parlays played while they were in the league. Set the start to the day they really joined.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="member-start">In the league from</Label>
            <Input id="member-start" type="date" value={start} max={toDay(new Date())} onChange={(e) => setStart(e.target.value)} data-testid="input-member-start" />
          </div>
          {hasLeft && (
            <div className="space-y-1">
              <Label htmlFor="member-end">Left on</Label>
              <Input id="member-end" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} data-testid="input-member-end" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button
            disabled={!member || !start || (hasLeft && !end) || save.isPending}
            onClick={() => member && save.mutate(
              { userId: member.userId, startDate: start, ...(hasLeft ? { endDate: end } : {}) },
              { onSuccess: onClose },
            )}
            data-testid="button-save-member-dates"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
