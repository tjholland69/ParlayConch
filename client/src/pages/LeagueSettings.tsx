// Adding in a commet to create a commit and test merging form my local

import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import {
  useLeagues,
  useLeagueMembersWithUsers,
  useUpdateLeagueSettings,
  useSetMemberRole,
  useUpdateLieutenantPermissions,
  useSetLeagueDemo,
  useSetLeagueDemoWeekData,
  useSendLeagueAnnouncement,
  useUpdateLeagueNotificationSettings,
  useRemoveLeagueMember,
  useOrphanedLegs,
  useResolveOrphanedLegs,
  OrphanConflictError,
} from "@/hooks/use-bets";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { getDisplayName } from "@/lib/displayName";
import { PageLoader } from "@/components/PageLoader";
import {
  Settings,
  Users,
  Shield,
  FlaskConical,
  Crown,
  ChevronLeft,
  Loader2,
  Star,
  StarOff,
  Bell,
  Megaphone,
  Clock,
  Sparkles,
  UserX,
  Trash2,
  AlertTriangle,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import type { LieutenantPermissions, LeagueMemberWithUser, LeagueNotificationSettings, ParlayLeg } from "@shared/schema";
import { DEFAULT_LIEUTENANT_PERMISSIONS, DEFAULT_LEAGUE_NOTIFICATION_SETTINGS } from "@shared/schema";
import { PERMISSION_LABELS } from "@/lib/leaguePermissionLabels";
import { LeagueRolesDialog } from "@/components/LeagueRolesDialog";

function formatMemberDateRange(startDate: string | Date | null, endDate: string | Date | null): string {
  const fmt = (d: string | Date) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (!startDate) return "";
  return endDate ? `${fmt(startDate)} – ${fmt(endDate)}` : `Joined ${fmt(startDate)}`;
}

function MemberRow({
  member,
  isAdmin,
  lieutenantCount,
  onRoleChange,
  isPending,
  onRemove,
}: {
  member: LeagueMemberWithUser;
  isAdmin: boolean;
  lieutenantCount: number;
  onRoleChange: (userId: string, role: string) => void;
  isPending: boolean;
  onRemove: (member: LeagueMemberWithUser) => void;
}) {
  const isLt = member.role === "lieutenant";
  const isMemberAdmin = member.role === "admin";
  const isInactive = member.isActive === false;
  const canPromote = !isMemberAdmin && !isLt && lieutenantCount < 2;
  const canDemote = isLt;

  return (
    <div className={cn("flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/8 transition-colors", isInactive && "opacity-60")}>
      <div className="flex items-center gap-3">
        <Avatar className="w-9 h-9">
          <AvatarImage src={member.user.profileImageUrl || undefined} />
          <AvatarFallback className="bg-gradient-to-tr from-primary to-accent text-primary-foreground text-sm font-bold">
            {getDisplayName(member.user, "?")[0]}
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">
              {getDisplayName(member.user)}
            </p>
            {isMemberAdmin && (
              <Badge variant="secondary" className="text-xs h-4 px-1">
                <Crown className="w-2.5 h-2.5 mr-1" />
                Parlay Maestro
              </Badge>
            )}
            {isLt && (
              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs h-4 px-1">
                <Star className="w-2.5 h-2.5 mr-1" />
                Parlay Lieutenant
              </Badge>
            )}
            {member.user.isDemo && (
              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] px-1 h-4">
                DEMO
              </Badge>
            )}
            {isInactive ? (
              <Badge variant="outline" className="text-[10px] px-1 h-4 text-muted-foreground border-white/20">
                {member.purgedAt ? "Purged" : "Inactive"}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] px-1 h-4 text-emerald-400 border-emerald-500/30">
                Active
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{member.user.email}</p>
          <p className="text-[11px] text-muted-foreground/70">{formatMemberDateRange(member.startDate, member.endDate)}</p>
        </div>
      </div>
      {isAdmin && !isMemberAdmin && !isInactive && (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "text-xs",
              isLt
                ? "text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                : canPromote
                ? "text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10"
                : "text-muted-foreground opacity-50 cursor-not-allowed"
            )}
            disabled={isPending || (!canPromote && !canDemote)}
            onClick={() => onRoleChange(member.userId, isLt ? "member" : "lieutenant")}
            title={
              isLt
                ? "Remove Parlay Lieutenant role"
                : canPromote
                ? "Promote to Parlay Lieutenant"
                : "Maximum 2 Parlay Lieutenants reached"
            }
            data-testid={`button-role-toggle-${member.userId}`}
          >
            {isLt ? (
              <>
                <StarOff className="w-3.5 h-3.5 mr-1.5" />
                Remove Lt.
              </>
            ) : (
              <>
                <Star className="w-3.5 h-3.5 mr-1.5" />
                Make Lt.
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs text-destructive/80 hover:text-destructive hover:bg-destructive/10"
            onClick={() => onRemove(member)}
            title="Remove this member from the league"
            data-testid={`button-remove-member-${member.userId}`}
          >
            <UserX className="w-3.5 h-3.5 mr-1.5" />
            Remove
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Remove Member Dialog ────────────────────────────────────────────────────
// Blocks removal until orphaned parlay_legs are resolved (reassign or delete),
// with a "resolve later" bypass that soft-purges the member and moves their
// legs to the exceptions blotter.

type LegResolution = { legId: number; action: "reassign" | "delete"; newUserId?: string };

function RemoveMemberDialog({
  open,
  onOpenChange,
  leagueId,
  member,
  activeMembers,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leagueId: number;
  member: LeagueMemberWithUser | null;
  activeMembers: LeagueMemberWithUser[];
}) {
  const removeMember = useRemoveLeagueMember(leagueId);
  const resolveOrphans = useResolveOrphanedLegs(leagueId);
  const [orphanedLegs, setOrphanedLegs] = useState<ParlayLeg[] | null>(null);
  const [resolutions, setResolutions] = useState<Record<number, LegResolution>>({});

  const reset = () => { setOrphanedLegs(null); setResolutions({}); };

  useEffect(() => { if (!open) reset(); }, [open]);

  if (!member) return null;

  const targetOptions = activeMembers.filter(m => m.userId !== member.userId);

  const attemptRemove = () => {
    removeMember.mutate(
      { userId: member.userId },
      {
        onSuccess: (data) => {
          if (data.orphanedLegs.length === 0) onOpenChange(false);
        },
        onError: (err) => {
          if (err instanceof OrphanConflictError) setOrphanedLegs(err.orphanedLegs);
        },
      }
    );
  };

  const allResolved = orphanedLegs?.every(l => resolutions[l.id]) ?? false;

  const applyResolutions = () => {
    if (!orphanedLegs) return;
    resolveOrphans.mutate(Object.values(resolutions), {
      onSuccess: () => onOpenChange(false),
    });
  };

  const bypassToBlotter = () => {
    removeMember.mutate(
      { userId: member.userId, bypass: true },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!removeMember.isPending && !resolveOrphans.isPending) onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserX className="w-5 h-5 text-destructive" />
            Remove {getDisplayName(member.user)}
          </DialogTitle>
          <DialogDescription>
            {orphanedLegs === null
              ? "This removes them from the league entirely. If they have picks tied to them, you'll be asked to resolve those first."
              : `${orphanedLegs.length} parlay leg${orphanedLegs.length !== 1 ? "s" : ""} in this league still belong to this member. Reassign each to another member or delete it before removing them completely.`}
          </DialogDescription>
        </DialogHeader>

        {orphanedLegs && (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {orphanedLegs.map(leg => (
              <div key={leg.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white/5 text-sm">
                <span className="text-muted-foreground truncate">
                  {leg.betType} · {leg.pick}{leg.line ? ` ${leg.line}` : ""}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Select
                    value={resolutions[leg.id]?.action === "delete" ? "__delete" : (resolutions[leg.id]?.newUserId ?? "")}
                    onValueChange={(v) => {
                      setResolutions(prev => ({
                        ...prev,
                        [leg.id]: v === "__delete" ? { legId: leg.id, action: "delete" } : { legId: leg.id, action: "reassign", newUserId: v },
                      }));
                    }}
                  >
                    <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Resolve…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__delete">
                        <span className="flex items-center gap-1.5 text-destructive"><Trash2 className="w-3 h-3" /> Delete leg</span>
                      </SelectItem>
                      {targetOptions.map(m => (
                        <SelectItem key={m.userId} value={m.userId}>Reassign to {getDisplayName(m.user, m.userId.slice(0, 8))}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2 sm:flex-col sm:items-stretch">
          {orphanedLegs === null ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={removeMember.isPending}>Cancel</Button>
              <Button variant="destructive" onClick={attemptRemove} disabled={removeMember.isPending}>
                {removeMember.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserX className="w-4 h-4 mr-2" />}
                Remove Completely
              </Button>
            </>
          ) : (
            <>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={removeMember.isPending || resolveOrphans.isPending}>Cancel</Button>
                <Button onClick={applyResolutions} disabled={!allResolved || resolveOrphans.isPending}>
                  {resolveOrphans.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Resolve & Remove
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground self-end"
                onClick={bypassToBlotter}
                disabled={removeMember.isPending}
              >
                Resolve later — move to exceptions blotter
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Exceptions Blotter ──────────────────────────────────────────────────────
// Persistent, maestro-only surface for orphaned legs left behind by a bypassed
// purge — deliberately not a one-time dismissible modal, since those get
// forgotten.

function ExceptionsBlotterCard({ leagueId, activeMembers }: { leagueId: number; activeMembers: LeagueMemberWithUser[] }) {
  const { data: orphanedLegs } = useOrphanedLegs(leagueId);
  const resolveOrphans = useResolveOrphanedLegs(leagueId);
  const [resolutions, setResolutions] = useState<Record<number, LegResolution>>({});

  if (!orphanedLegs || orphanedLegs.length === 0) return null;

  const allResolved = orphanedLegs.every(l => resolutions[l.id]);

  return (
    <Card className="bg-amber-500/5 border-amber-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-400">
          <AlertTriangle className="w-5 h-5" />
          Exceptions Blotter
          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">{orphanedLegs.length}</Badge>
        </CardTitle>
        <CardDescription>
          Parlay legs left behind by members who were removed before their picks were resolved. Reassign or delete each one below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {orphanedLegs.map((leg: any) => (
          <div key={leg.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white/5 text-sm">
            <span className="text-muted-foreground truncate">
              {leg.ownerFirstName || leg.ownerEmail || "Former member"} — {leg.betType} · {leg.pick}{leg.line ? ` ${leg.line}` : ""}
            </span>
            <Select
              value={resolutions[leg.id]?.action === "delete" ? "__delete" : (resolutions[leg.id]?.newUserId ?? "")}
              onValueChange={(v) => {
                setResolutions(prev => ({
                  ...prev,
                  [leg.id]: v === "__delete" ? { legId: leg.id, action: "delete" } : { legId: leg.id, action: "reassign", newUserId: v },
                }));
              }}
            >
              <SelectTrigger className="h-8 w-44 text-xs shrink-0"><SelectValue placeholder="Resolve…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__delete">
                  <span className="flex items-center gap-1.5 text-destructive"><Trash2 className="w-3 h-3" /> Delete leg</span>
                </SelectItem>
                {activeMembers.map(m => (
                  <SelectItem key={m.userId} value={m.userId}>Reassign to {getDisplayName(m.user, m.userId.slice(0, 8))}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        <div className="flex justify-end pt-2">
          <Button
            size="sm"
            disabled={!allResolved || resolveOrphans.isPending}
            onClick={() => resolveOrphans.mutate(Object.values(resolutions), { onSuccess: () => setResolutions({}) })}
          >
            {resolveOrphans.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Resolve Selected
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LeagueSettings() {
  const [, params] = useRoute("/leagues/:id/settings");
  const [, navigate] = useLocation();
  const leagueId = Number(params?.id);

  const { data: leagues } = useLeagues();
  const league = leagues?.find((l) => l.id === leagueId);

  const { data: members, isLoading: loadingMembers } = useLeagueMembersWithUsers(leagueId, { includeInactive: true });
  const [removeTarget, setRemoveTarget] = useState<LeagueMemberWithUser | null>(null);

  const updateSettings = useUpdateLeagueSettings(leagueId);
  const setMemberRole = useSetMemberRole(leagueId);
  const updatePerms = useUpdateLieutenantPermissions(leagueId);
  const setLeagueDemo = useSetLeagueDemo(leagueId);
  const setDemoWeekData = useSetLeagueDemoWeekData(leagueId);
  const sendAnnouncement = useSendLeagueAnnouncement(leagueId);
  const updateNotifSettings = useUpdateLeagueNotificationSettings(leagueId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [minLegs, setMinLegs] = useState(3);
  const [maxLegs, setMaxLegs] = useState(5);
  const [maxParlays, setMaxParlays] = useState(1);
  const [maxBetsPerGame, setMaxBetsPerGame] = useState(1);
  const [insightsEnabled, setInsightsEnabled] = useState(false);
  const [loserLabel, setLoserLabel] = useState<string>("parlay_loser");
  const [heroLabel, setHeroLabel] = useState<string>("parlay_hero");
  const [perms, setPerms] = useState<LieutenantPermissions>(DEFAULT_LIEUTENANT_PERMISSIONS);
  const [notifSettings, setNotifSettings] = useState<LeagueNotificationSettings>(DEFAULT_LEAGUE_NOTIFICATION_SETTINGS);
  const [announceTitle, setAnnounceTitle] = useState("");
  const [announceMessage, setAnnounceMessage] = useState("");

  useEffect(() => {
    if (league) {
      setName(league.name);
      setDescription(league.description || "");
      setMinLegs(league.minLegsPerParlay || 3);
      setMaxLegs(league.maxLegsPerParlay || 5);
      setMaxParlays(league.maxParlaysPerWeek || 1);
      setMaxBetsPerGame(league.maxBetsPerGame || 1);
      setInsightsEnabled(league.insightsEnabled ?? false);
      setLoserLabel(league.loserLabel ?? "parlay_loser");
      setHeroLabel(league.heroLabel ?? "parlay_hero");
      setPerms(
        (league.lieutenantPermissions as LieutenantPermissions) || DEFAULT_LIEUTENANT_PERMISSIONS
      );
      setNotifSettings(
        (league.notificationSettings as LeagueNotificationSettings) || DEFAULT_LEAGUE_NOTIFICATION_SETTINGS
      );
    }
  }, [league]);

  if (!league) {
    return <PageLoader />;
  }

  if (!league.isAdmin) {
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Parlay Maestro Access Required</h2>
        <p className="text-muted-foreground mb-6">Only the Parlay Maestro can access league settings.</p>
        <Link href={`/leagues/${leagueId}`}>
          <Button variant="outline">Back to League</Button>
        </Link>
      </div>
    );
  }

  const activeMembers = members?.filter((m) => m.isActive !== false) || [];
  const lieutenants = activeMembers.filter((m) => m.role === "lieutenant");

  const roleOrder: Record<string, number> = { admin: 0, lieutenant: 1, member: 2 };
  const getMemberDisplayName = (m: LeagueMemberWithUser) => getDisplayName(m.user, "");
  const sortedMembers = [...(members || [])].sort((a, b) => {
    const activeDiff = (a.isActive === false ? 1 : 0) - (b.isActive === false ? 1 : 0);
    if (activeDiff !== 0) return activeDiff;
    const roleDiff = (roleOrder[a.role ?? "member"] ?? 2) - (roleOrder[b.role ?? "member"] ?? 2);
    if (roleDiff !== 0) return roleDiff;
    return getMemberDisplayName(a).localeCompare(getMemberDisplayName(b));
  });

  const handleSaveGeneral = () => {
    updateSettings.mutate({ name, description: description || null, minLegsPerParlay: minLegs, maxLegsPerParlay: maxLegs, maxParlaysPerWeek: maxParlays, maxBetsPerGame, insightsEnabled, loserLabel, heroLabel });
  };

  const handleSavePermissions = () => {
    updatePerms.mutate(perms);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="bg-card/30 p-6 rounded-2xl border border-white/5 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Link href={`/leagues/${leagueId}`}>
            <Button variant="ghost" size="icon" className="shrink-0" data-testid="button-back-to-league">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Settings className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-display font-bold" data-testid="text-league-settings-title">
                  League Settings
                </h1>
                {league.isDemo && (
                  <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">
                    DEMO
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{league.name}</p>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="bg-card/50 border border-white/5">
          <TabsTrigger value="general" data-testid="tab-league-general">
            <Settings className="w-4 h-4 mr-2" />
            General
          </TabsTrigger>
          <TabsTrigger value="lieutenants" data-testid="tab-league-lieutenants">
            <Star className="w-4 h-4 mr-2" />
            Parlay Lieutenants
            {lieutenants.length > 0 && (
              <Badge className="ml-1.5 bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] px-1 h-4">
                {lieutenants.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="notifications" data-testid="tab-league-notifications">
            <Bell className="w-4 h-4 mr-2" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="advanced" data-testid="tab-league-advanced">
            <Shield className="w-4 h-4 mr-2" />
            Advanced
          </TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="space-y-4">
          <Card className="bg-card/50 border-white/5">
            <CardHeader>
              <CardTitle>League Info</CardTitle>
              <CardDescription>Update the league name and description</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="league-name">League Name</Label>
                <Input
                  id="league-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-background border-white/10"
                  data-testid="input-league-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="league-description">Description</Label>
                <Input
                  id="league-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                  className="bg-background border-white/10"
                  data-testid="input-league-description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="invite-code">Invite Code</Label>
                  <Input
                    id="invite-code"
                    value={league.inviteCode}
                    readOnly
                    className="bg-background border-white/10 opacity-60 font-mono"
                    data-testid="input-invite-code-readonly"
                  />
                  <p className="text-xs text-muted-foreground">Share this with friends to join</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-white/5">
            <CardHeader>
              <CardTitle>Parlay Rules</CardTitle>
              <CardDescription>Configure the rules for parlay submissions in this league</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="min-legs">Min Required Legs</Label>
                  <Input
                    id="min-legs"
                    type="number"
                    min={1}
                    max={maxLegs}
                    value={minLegs}
                    onChange={(e) => setMinLegs(Number(e.target.value))}
                    className="bg-background border-white/10"
                    data-testid="input-min-legs"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max-legs">Default Legs</Label>
                  <Input
                    id="max-legs"
                    type="number"
                    min={minLegs}
                    max={15}
                    value={maxLegs}
                    onChange={(e) => setMaxLegs(Number(e.target.value))}
                    className="bg-background border-white/10"
                    data-testid="input-max-legs"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max-parlays">Max Parlays/Week</Label>
                  <Input
                    id="max-parlays"
                    type="number"
                    min={1}
                    value={maxParlays}
                    onChange={(e) => setMaxParlays(Number(e.target.value))}
                    className="bg-background border-white/10"
                    data-testid="input-max-parlays"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max-bets-per-game">Max Bets/Game</Label>
                  <Input
                    id="max-bets-per-game"
                    type="number"
                    min={1}
                    value={maxBetsPerGame}
                    onChange={(e) => setMaxBetsPerGame(Number(e.target.value))}
                    className="bg-background border-white/10"
                    data-testid="input-max-bets-per-game"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Members must include at least {minLegs} game picks per parlay. The default leg count is {maxLegs}, up to {maxParlays} parlay{maxParlays !== 1 ? "s" : ""} per week, with at most {maxBetsPerGame} bet{maxBetsPerGame !== 1 ? "s" : ""} per game.
              </p>
              <div className="space-y-2 pt-2 border-t border-white/5">
                <Label htmlFor="loser-label">Whoever busts a loss first each week is called…</Label>
                <Select value={loserLabel} onValueChange={setLoserLabel}>
                  <SelectTrigger id="loser-label" className="w-56 bg-background border-white/10" data-testid="select-loser-label">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="parlay_loser">Parlay Loser</SelectItem>
                    <SelectItem value="asshole">Asshole</SelectItem>
                    <SelectItem value="jerry">Jerry</SelectItem>
                    <SelectItem value="dud">Dud</SelectItem>
                    <SelectItem value="doofus">Doofus</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="hero-label">Whoever's bet decides a winning parlay last is called…</Label>
                <Select value={heroLabel} onValueChange={setHeroLabel}>
                  <SelectTrigger id="hero-label" className="w-56 bg-background border-white/10" data-testid="select-hero-label">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="parlay_hero">Parlay Hero</SelectItem>
                    <SelectItem value="mvp">MVP</SelectItem>
                    <SelectItem value="legend">Legend</SelectItem>
                    <SelectItem value="big_time">Big Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* AI Insights Feature Toggle */}
          <Card className="bg-card/50 border-white/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-violet-400" />
                AI Betting Insights
              </CardTitle>
              <CardDescription>
                Enable AI-generated commentary and betting analytics for this league. This uses AI credits and should only be enabled when actively in use.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {insightsEnabled ? "Insights are enabled" : "Insights are disabled"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    When disabled, the Insights tab will show a locked state to all members.
                  </p>
                </div>
                <Switch
                  checked={insightsEnabled}
                  onCheckedChange={setInsightsEnabled}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              onClick={handleSaveGeneral}
              disabled={updateSettings.isPending}
              data-testid="button-save-league-settings"
            >
              {updateSettings.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </TabsContent>

        {/* Parlay Lieutenants Tab */}
        <TabsContent value="lieutenants" className="space-y-4">
          <Card className="bg-card/50 border-white/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="w-5 h-5 text-blue-400" />
                Parlay Lieutenant Assignment
                <LeagueRolesDialog triggerClassName="h-7 w-7 p-0 ml-auto text-muted-foreground hover:text-foreground" />
              </CardTitle>
              <CardDescription>
                Designate up to 2 trusted members as Parlay Lieutenants. Their permitted actions are configured in the Permissions section below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Current Parlay Lieutenant summary */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 mb-4">
                <Star className="w-4 h-4 text-blue-400 shrink-0" />
                <p className="text-sm text-blue-300">
                  {lieutenants.length === 0
                    ? "No Parlay Lieutenants assigned yet"
                    : `${lieutenants.length} of 2 Parlay Lieutenant slot${lieutenants.length !== 1 ? "s" : ""} filled`}
                </p>
              </div>

              {loadingMembers ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-14 bg-white/5 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2" data-testid="list-members">
                  {sortedMembers.map((member) => (
                    <MemberRow
                      key={member.userId}
                      member={member}
                      isAdmin={league.isAdmin}
                      lieutenantCount={lieutenants.length}
                      onRoleChange={(userId, role) => setMemberRole.mutate({ userId, role })}
                      isPending={setMemberRole.isPending}
                      onRemove={setRemoveTarget}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <ExceptionsBlotterCard leagueId={leagueId} activeMembers={activeMembers} />

          <RemoveMemberDialog
            open={!!removeTarget}
            onOpenChange={(v) => { if (!v) setRemoveTarget(null); }}
            leagueId={leagueId}
            member={removeTarget}
            activeMembers={activeMembers}
          />

          <Card className="bg-card/50 border-white/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Parlay Lieutenant Permissions
              </CardTitle>
              <CardDescription>
                Choose which Parlay Maestro actions Parlay Lieutenants are allowed to perform in this league. Some actions remain admin-only and cannot be delegated.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Grouped permission toggles */}
              {["Parlay Management", "Member Management", "Data & Admin"].map((group) => {
                const groupPerms = PERMISSION_LABELS.filter(p => p.group === group);
                return (
                  <div key={group} className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{group}</p>
                    {groupPerms.map(({ key, label, description }) => (
                      <div
                        key={key}
                        className="flex items-center justify-between py-3 border-b border-white/5 last:border-0"
                      >
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">{label}</p>
                          <p className="text-xs text-muted-foreground">{description}</p>
                        </div>
                        <Switch
                          checked={perms[key] ?? false}
                          onCheckedChange={(checked) => setPerms((prev) => ({ ...prev, [key]: checked }))}
                          data-testid={`switch-perm-${key}`}
                        />
                      </div>
                    ))}
                  </div>
                );
              })}

              {/* Admin-only reminder */}
              <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                <Crown className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-medium">Admin-Only (never delegatable)</p>
                  <p className="text-xs text-muted-foreground">
                    <strong>Suspend Members</strong> and <strong>Set Lieutenant</strong> are permanently restricted to the Parlay Maestro and cannot be granted to Parlay Lieutenants.
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleSavePermissions}
                  disabled={updatePerms.isPending}
                  data-testid="button-save-permissions"
                >
                  {updatePerms.isPending ? "Saving…" : "Save Permissions"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-4">
          {/* Option 1: Ad Hoc Announcement */}
          <Card className="bg-card/50 border-white/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-primary" />
                Send Announcement
              </CardTitle>
              <CardDescription>
                Send an immediate notification to every member of this league
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="announce-title">Title</Label>
                <Input
                  id="announce-title"
                  value={announceTitle}
                  onChange={(e) => setAnnounceTitle(e.target.value)}
                  placeholder="e.g. Picks are due by Sunday noon!"
                  className="bg-background border-white/10"
                  maxLength={120}
                  data-testid="input-announce-title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="announce-message">Message (optional)</Label>
                <Input
                  id="announce-message"
                  value={announceMessage}
                  onChange={(e) => setAnnounceMessage(e.target.value)}
                  placeholder="Add more detail here..."
                  className="bg-background border-white/10"
                  maxLength={500}
                  data-testid="input-announce-message"
                />
                <p className="text-xs text-muted-foreground">
                  This will create an in-app notification for all {members?.length || 0} league members
                </p>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    sendAnnouncement.mutate({ title: announceTitle, message: announceMessage });
                    setAnnounceTitle("");
                    setAnnounceMessage("");
                  }}
                  disabled={sendAnnouncement.isPending || !announceTitle.trim()}
                  data-testid="button-send-announcement"
                >
                  <Megaphone className="w-4 h-4 mr-2" />
                  {sendAnnouncement.isPending ? "Sending…" : "Send to League"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Option 2: Scheduled Reminders */}
          <Card className="bg-card/50 border-white/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                Scheduled Pick Reminders
              </CardTitle>
              <CardDescription>
                Automatically remind members to submit their picks before the weekly deadline
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
                <div>
                  <p className="text-sm font-medium">Enable Scheduled Reminders</p>
                  <p className="text-xs text-muted-foreground">Members who haven't submitted yet will be notified</p>
                </div>
                <Switch
                  checked={notifSettings.scheduledReminders}
                  onCheckedChange={(v) => setNotifSettings((s) => ({ ...s, scheduledReminders: v }))}
                  data-testid="switch-scheduled-reminders"
                />
              </div>

              {notifSettings.scheduledReminders && (
                <div className="space-y-4 pl-1">
                  <div className="space-y-2">
                    <Label htmlFor="reminder-days">Days before deadline</Label>
                    <div className="flex items-center gap-3">
                      <Input
                        id="reminder-days"
                        type="number"
                        min={1}
                        max={7}
                        value={notifSettings.reminderDaysBeforeDeadline}
                        onChange={(e) => setNotifSettings((s) => ({ ...s, reminderDaysBeforeDeadline: Number(e.target.value) }))}
                        className="bg-background border-white/10 w-24"
                        data-testid="input-reminder-days"
                      />
                      <p className="text-sm text-muted-foreground">day{notifSettings.reminderDaysBeforeDeadline !== 1 ? "s" : ""} before the weekly deadline</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reminder-msg">Reminder message</Label>
                    <Input
                      id="reminder-msg"
                      value={notifSettings.reminderMessage}
                      onChange={(e) => setNotifSettings((s) => ({ ...s, reminderMessage: e.target.value }))}
                      className="bg-background border-white/10"
                      maxLength={500}
                      data-testid="input-reminder-message"
                    />
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground/70 bg-white/5 rounded-lg px-3 py-2">
                Scheduled delivery requires a background job service. Your settings are saved and will be active once the scheduler is configured.
              </p>

              <div className="flex justify-end">
                <Button
                  onClick={() => updateNotifSettings.mutate(notifSettings)}
                  disabled={updateNotifSettings.isPending}
                  data-testid="button-save-notif-settings"
                >
                  {updateNotifSettings.isPending ? "Saving…" : "Save Reminder Settings"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Tab */}
        <TabsContent value="advanced" className="space-y-4">
          <Card className="bg-card/50 border-white/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-yellow-400" />
                Demo / QA Mode
              </CardTitle>
              <CardDescription>
                Flag this league as demo or QA data so its records are clearly distinguishable from live production entries
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">Demo League</p>
                    {league.isDemo && (
                      <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] px-1 py-0 h-4">
                        ACTIVE
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    When enabled, a yellow DEMO banner and badge appear on the league. All parlays within this league are implicitly considered demo data.
                  </p>
                </div>
                <Switch
                  checked={!!league.isDemo}
                  onCheckedChange={(checked) => setLeagueDemo.mutate(checked)}
                  disabled={setLeagueDemo.isPending}
                  data-testid="switch-league-demo"
                />
              </div>
            </CardContent>
          </Card>

          {league.isDemo && (
            <Card className="bg-card/50 border-white/5 border-yellow-500/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FlaskConical className="w-5 h-5 text-yellow-400" />
                  Dummy Weekly Data
                </CardTitle>
                <CardDescription>
                  When enabled, picks screens (like Quick Picks) will display a sample dataset from Week 14 of the 2024 season instead of live data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">Use Dummy Week Data</p>
                      {league.useDemoWeekData && (
                        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] px-1 py-0 h-4">
                          ACTIVE
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Sample data (Week 14 · 2024) will replace the live picks feed for all members of this demo league
                    </p>
                  </div>
                  <Switch
                    checked={!!league.useDemoWeekData}
                    onCheckedChange={(checked) => setDemoWeekData.mutate(checked)}
                    disabled={setDemoWeekData.isPending}
                    data-testid="switch-demo-week-data"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="bg-card/50 border-white/5">
            <CardHeader>
              <CardTitle>Future Settings</CardTitle>
              <CardDescription>More league configuration options coming soon</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-white/5">
                <div>
                  <p className="font-medium text-sm">Lock Picks Before Kickoff</p>
                  <p className="text-xs text-muted-foreground">Auto-reject picks submitted after game start</p>
                </div>
                <Badge variant="outline" className="text-muted-foreground">Coming soon</Badge>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-white/5">
                <div>
                  <p className="font-medium text-sm">Public League</p>
                  <p className="text-xs text-muted-foreground">Allow anyone to join without an invite code</p>
                </div>
                <Badge variant="outline" className="text-muted-foreground">Coming soon</Badge>
              </div>
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-sm">Scoring System</p>
                  <p className="text-xs text-muted-foreground">Win rate, points, or custom scoring</p>
                </div>
                <Badge variant="outline" className="text-muted-foreground">Coming soon</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
