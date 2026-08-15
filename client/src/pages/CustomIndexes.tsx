import { useState } from "react";
import { Loader2, Pencil, Plus, Share2, Trash2, TrendingUp, Users, X } from "lucide-react";
import type { CustomIndexWithAccess } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useLeagues } from "@/hooks/use-bets";
import {
  useCustomIndexes,
  useDeleteCustomIndex,
  useShareCustomIndex,
  useUnshareCustomIndex,
  useLeagueMembers,
  describeCustomIndexFilters,
} from "@/hooks/use-custom-indexes";
import { CustomIndexBuilderDialog } from "@/components/dashboard/CustomIndexBuilderDialog";
import { EmptyState } from "@/components/SlidingCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { getDisplayName } from "@/lib/displayName";

/** Share picker — anyone who shares a league with the owner is eligible. */
function ShareDialog({
  index,
  onOpenChange,
}: {
  index: CustomIndexWithAccess | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const { data: leagues } = useLeagues();
  const { members } = useLeagueMembers((leagues ?? []).map((l) => l.id));
  const share = useShareCustomIndex();
  const unshare = useUnshareCustomIndex();
  const [search, setSearch] = useState("");

  if (!index) return null;

  const sharedWith = index.sharedWithUserIds ?? [];
  const candidates = members
    .filter((m) => m.userId !== user?.id && !sharedWith.includes(m.userId))
    .filter((m) => {
      const label = getDisplayName(m.user, m.user.email ?? "");
      return !search.trim() || label.toLowerCase().includes(search.trim().toLowerCase());
    });

  const labelFor = (userId: string) => {
    const member = members.find((m) => m.userId === userId);
    return member ? getDisplayName(member.user, member.user.email ?? userId) : userId;
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share "{index.displayName}"</DialogTitle>
          <DialogDescription>
            You can share with anyone who's in one of your leagues.
          </DialogDescription>
        </DialogHeader>

        {sharedWith.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Shared with</Label>
            <div className="flex flex-wrap gap-2">
              {sharedWith.map((userId) => (
                <Badge key={userId} variant="secondary" className="gap-1 pr-1">
                  {labelFor(userId)}
                  <button
                    type="button"
                    onClick={() => unshare.mutate({ id: index.id, userId })}
                    className="hover:text-destructive"
                    aria-label={`Stop sharing with ${labelFor(userId)}`}
                    data-testid={`button-unshare-${userId}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Input
            placeholder="Search people…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-background border-white/10"
            data-testid="input-share-search"
          />
          <div className="max-h-56 overflow-y-auto space-y-1">
            {candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No one left to share with.</p>
            ) : (
              candidates.map((m) => (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => share.mutate({ id: index.id, userId: m.userId })}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 text-sm text-left"
                  data-testid={`button-share-${m.userId}`}
                >
                  <span className="truncate">{getDisplayName(m.user, m.user.email ?? "Member")}</span>
                  <Share2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </button>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IndexRow({
  index,
  onEdit,
  onShare,
}: {
  index: CustomIndexWithAccess;
  onEdit: (index: CustomIndexWithAccess) => void;
  onShare: (index: CustomIndexWithAccess) => void;
}) {
  const remove = useDeleteCustomIndex();
  const { data: leagues } = useLeagues();

  const summary = describeCustomIndexFilters(index.filters, leagues ?? []);

  return (
    <Card className="p-4 border-white/5 flex items-center gap-4" data-testid={`row-index-${index.id}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-bold truncate">{index.displayName}</p>
          {index.scope === "league" && (
            <Badge className="bg-accent/20 text-accent border-accent/30 text-[10px]">LEAGUE DEFAULT</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5 font-mono">{summary}</p>
      </div>

      {index.isOwner && (
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(index)}
            title="Rename / edit filters"
            data-testid={`button-edit-${index.id}`}
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onShare(index)}
            title="Share"
            data-testid={`button-share-index-${index.id}`}
          >
            <Share2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => remove.mutate(index.id)}
            disabled={remove.isPending}
            title="Delete"
            className="text-destructive hover:text-destructive"
            data-testid={`button-delete-${index.id}`}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      )}
    </Card>
  );
}

export default function CustomIndexes() {
  const { data: indexes, isLoading } = useCustomIndexes();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<CustomIndexWithAccess | null>(null);
  const [sharing, setSharing] = useState<CustomIndexWithAccess | null>(null);

  const openCreate = () => {
    setEditing(null);
    setBuilderOpen(true);
  };
  const openEdit = (index: CustomIndexWithAccess) => {
    setEditing(index);
    setBuilderOpen(true);
  };

  const groups: { title: string; icon: typeof TrendingUp; items: CustomIndexWithAccess[] }[] = [
    { title: "Yours", icon: TrendingUp, items: (indexes ?? []).filter((i) => i.access === "owner") },
    { title: "Shared with you", icon: Share2, items: (indexes ?? []).filter((i) => i.access === "shared") },
    { title: "League defaults", icon: Users, items: (indexes ?? []).filter((i) => i.access === "league") },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <TrendingUp className="w-7 h-7 text-accent" />
            Custom Indexes
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Saved comparison lines you can overlay on your performance graph.
          </p>
        </div>
        <Button onClick={openCreate} data-testid="button-create-index">
          <Plus className="w-4 h-4 mr-2" />
          Create Custom Index
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground text-sm">Loading indexes…</span>
        </div>
      ) : (indexes ?? []).length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          message="No custom indexes yet — create one to compare yourself against a specific slice of your leagues."
        />
      ) : (
        groups
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <div key={group.title} className="space-y-2">
              <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-mono flex items-center gap-2">
                <group.icon className="w-3.5 h-3.5" />
                {group.title}
              </h2>
              {group.items.map((index) => (
                <IndexRow key={index.id} index={index} onEdit={openEdit} onShare={setSharing} />
              ))}
            </div>
          ))
      )}

      <CustomIndexBuilderDialog open={builderOpen} onOpenChange={setBuilderOpen} editing={editing} />
      <ShareDialog index={sharing} onOpenChange={(open) => !open && setSharing(null)} />
    </div>
  );
}
