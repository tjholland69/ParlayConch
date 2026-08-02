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
import { getDisplayName } from "@/lib/displayName";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import type { LieutenantPermissions, LeagueMemberWithUser, LeagueNotificationSettings } from "@shared/schema";
import { DEFAULT_LIEUTENANT_PERMISSIONS, DEFAULT_LEAGUE_NOTIFICATION_SETTINGS } from "@shared/schema";

const PERMISSION_LABELS: { key: keyof LieutenantPermissions; label: string; description: string; group: string }[] = [
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

function MemberRow({
  member,
  isAdmin,
  lieutenantCount,
  onRoleChange,
  isPending,
}: {
  member: LeagueMemberWithUser;
  isAdmin: boolean;
  lieutenantCount: number;
  onRoleChange: (userId: string, role: string) => void;
  isPending: boolean;
}) {
  const isLt = member.role === "lieutenant";
  const isMemberAdmin = member.role === "admin";
  const canPromote = !isMemberAdmin && !isLt && lieutenantCount < 2;
  const canDemote = isLt;

  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/8 transition-colors">
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
          </div>
          <p className="text-xs text-muted-foreground">{member.user.email}</p>
        </div>
      </div>
      {isAdmin && !isMemberAdmin && (
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
      )}
    </div>
  );
}

export default function LeagueSettings() {
  const [, params] = useRoute("/leagues/:id/settings");
  const [, navigate] = useLocation();
  const leagueId = Number(params?.id);

  const { data: leagues } = useLeagues();
  const league = leagues?.find((l) => l.id === leagueId);

  const { data: members, isLoading: loadingMembers } = useLeagueMembersWithUsers(leagueId);

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
  const [insightsEnabled, setInsightsEnabled] = useState(false);
  const [loserLabel, setLoserLabel] = useState<string>("parlay_loser");
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
      setInsightsEnabled(league.insightsEnabled ?? false);
      setLoserLabel(league.loserLabel ?? "parlay_loser");
      setPerms(
        (league.lieutenantPermissions as LieutenantPermissions) || DEFAULT_LIEUTENANT_PERMISSIONS
      );
      setNotifSettings(
        (league.notificationSettings as LeagueNotificationSettings) || DEFAULT_LEAGUE_NOTIFICATION_SETTINGS
      );
    }
  }, [league]);

  if (!league) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
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

  const lieutenants = members?.filter((m) => m.role === "lieutenant") || [];

  const roleOrder: Record<string, number> = { admin: 0, lieutenant: 1, member: 2 };
  const getMemberDisplayName = (m: LeagueMemberWithUser) => getDisplayName(m.user, "");
  const sortedMembers = [...(members || [])].sort((a, b) => {
    const roleDiff = (roleOrder[a.role ?? "member"] ?? 2) - (roleOrder[b.role ?? "member"] ?? 2);
    if (roleDiff !== 0) return roleDiff;
    return getMemberDisplayName(a).localeCompare(getMemberDisplayName(b));
  });

  const handleSaveGeneral = () => {
    updateSettings.mutate({ name, description: description || null, minLegsPerParlay: minLegs, maxLegsPerParlay: maxLegs, maxParlaysPerWeek: maxParlays, insightsEnabled, loserLabel });
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
              <div className="grid grid-cols-3 gap-4">
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
              </div>
              <p className="text-xs text-muted-foreground">
                Members must include at least {minLegs} game picks per parlay. The default leg count is {maxLegs}, up to {maxParlays} parlay{maxParlays !== 1 ? "s" : ""} per week.
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
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

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
