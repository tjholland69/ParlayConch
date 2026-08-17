import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Info, Crown, Star, User } from "lucide-react";
import { PERMISSION_LABELS } from "@/lib/leaguePermissionLabels";

/** Powers the admin always has that can never be delegated to a lieutenant —
 * see the NOTE on shared/schema.ts's LieutenantPermissions type. */
const ADMIN_ONLY_POWERS = [
  "Suspend or remove members",
  "Appoint or remove lieutenants",
  "Transfer admin to another member",
];

const MEMBER_POWERS = [
  "Submit their own weekly parlay picks",
  "View league standings, history, and other members' picks",
  "Dispute their own leg results",
];

/** Explains what each league role — admin ("Parlay Maestro"), lieutenant
 * ("Parlay Lieutenant"), member — is allowed to do. Lieutenant permissions
 * are league-configurable (see League Settings > Lieutenants), so those are
 * rendered from the same PERMISSION_LABELS list admins use to grant them,
 * rather than a separately-maintained description that could drift. */
export function LeagueRolesDialog({ triggerClassName }: { triggerClassName?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={triggerClassName ?? "h-8 w-8 p-0 text-muted-foreground hover:text-foreground"}
          title="What can each role do?"
          data-testid="button-league-roles-info"
        >
          <Info className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>League Roles</DialogTitle>
          <DialogDescription>What each role is allowed to do in this league.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-400" />
              <h3 className="font-semibold text-sm">Admin — "Parlay Maestro"</h3>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">1 per league</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Full control over the league, plus everything a lieutenant can do. Only the admin can:
            </p>
            <ul className="space-y-1">
              {ADMIN_ONLY_POWERS.map(power => (
                <li key={power} className="text-xs text-muted-foreground flex gap-1.5">
                  <span className="text-amber-400/80 shrink-0">›</span>{power}
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Lieutenant — "Parlay Lieutenant"</h3>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">up to 2 per league</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Has whichever of these the admin has turned on for this league (League Settings &gt; Lieutenants):
            </p>
            <ul className="space-y-1">
              {PERMISSION_LABELS.map(p => (
                <li key={p.key} className="text-xs text-muted-foreground flex gap-1.5">
                  <span className="text-primary/70 shrink-0">›</span>
                  <span><span className="text-foreground/90">{p.label}</span> — {p.description}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Member</h3>
            </div>
            <ul className="space-y-1">
              {MEMBER_POWERS.map(power => (
                <li key={power} className="text-xs text-muted-foreground flex gap-1.5">
                  <span className="text-muted-foreground/60 shrink-0">›</span>{power}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
