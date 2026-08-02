import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSetUserDemo, useUpdateUserSettings, useUpdateNotificationPreferences, useLeagues } from "@/hooks/use-bets";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { User, Bell, Palette, FlaskConical, Shield, Mail, MessageSquare, Smartphone, Crown, Star, MapPin, Moon, Sun, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { getDisplayName } from "@/lib/displayName";
import type { UserNotificationPreferences } from "@shared/schema";

const DEFAULT_PREFS: UserNotificationPreferences = { email: false, sms: false, push: false, phone: "" };

const COLOR_PRESETS = [
  { label: "Blue", value: "221 83% 53%" },
  { label: "Green", value: "142 70% 50%" },
  { label: "Purple", value: "262 80% 60%" },
  { label: "Orange", value: "25 90% 55%" },
  { label: "Red", value: "0 72% 55%" },
  { label: "Teal", value: "175 70% 45%" },
  { label: "Pink", value: "330 80% 60%" },
  { label: "Amber", value: "38 92% 50%" },
];

export default function Settings() {
  const { user } = useAuth();
  const setUserDemo = useSetUserDemo();
  const updateSettings = useUpdateUserSettings();
  const updateNotifPrefs = useUpdateNotificationPreferences();
  const { data: leagues } = useLeagues();

  const [displayName, setDisplayName] = useState((user?.settings as any)?.displayName || user?.firstName || "");
  const [notifPrefs, setNotifPrefs] = useState<UserNotificationPreferences>(DEFAULT_PREFS);
  const [selectedColor, setSelectedColor] = useState<string>((user?.settings as any)?.primaryColor || "221 83% 53%");
  const [selectedRegion, setSelectedRegion] = useState<string>((user?.settings as any)?.region || "");
  const [selectedTheme, setSelectedTheme] = useState<"dark" | "light" | "system">((user?.settings as any)?.theme || "dark");

  useEffect(() => {
    const stored = (user?.settings as any)?.notificationPreferences;
    if (stored) setNotifPrefs({ ...DEFAULT_PREFS, ...stored });
  }, [user]);

  useEffect(() => {
    const savedColor = (user?.settings as any)?.primaryColor;
    if (savedColor) setSelectedColor(savedColor);
  }, [user]);

  useEffect(() => {
    const savedRegion = (user?.settings as any)?.region;
    if (savedRegion) setSelectedRegion(savedRegion);
  }, [user]);

  useEffect(() => {
    const savedTheme = (user?.settings as any)?.theme;
    if (savedTheme) setSelectedTheme(savedTheme);
  }, [user]);

  const handleSaveProfile = () => {
    updateSettings.mutate({ displayName });
  };

  const handleSaveColor = () => {
    updateSettings.mutate({ primaryColor: selectedColor });
  };

  const handleSaveTheme = (theme: "dark" | "light" | "system") => {
    setSelectedTheme(theme);
    updateSettings.mutate({ theme });
  };

  const handleSaveRegion = () => {
    updateSettings.mutate({ region: selectedRegion || null });
  };

  // Determine the user's highest role across all their leagues
  const adminLeagues = leagues?.filter(l => l.isAdmin) ?? [];
  const lieutenantLeagues = leagues?.filter(l => l.isLieutenant) ?? [];
  const isAnyAdmin = adminLeagues.length > 0;
  const isAnyLieutenant = lieutenantLeagues.length > 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div className="bg-card/30 p-6 rounded-2xl border border-white/5 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold" data-testid="text-settings-title">
              Account Settings
            </h1>
            <p className="text-sm text-muted-foreground">Manage your profile and preferences</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="bg-card/50 border border-white/5">
          <TabsTrigger value="profile" data-testid="tab-settings-profile">
            <User className="w-4 h-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="preferences" data-testid="tab-settings-preferences">
            <Palette className="w-4 h-4 mr-2" />
            Preferences
          </TabsTrigger>
          <TabsTrigger value="notifications" data-testid="tab-settings-notifications">
            <Bell className="w-4 h-4 mr-2" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="admin" data-testid="tab-settings-admin">
            <Crown className="w-4 h-4 mr-2" />
            Admin Privileges
          </TabsTrigger>
          <TabsTrigger value="account" data-testid="tab-settings-account">
            <Shield className="w-4 h-4 mr-2" />
            Account
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-4">
          <Card className="bg-card/50 border-white/5">
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Your public identity within leagues and picks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                {user?.profileImageUrl ? (
                  <img
                    src={user.profileImageUrl}
                    alt="Profile"
                    className="w-16 h-16 rounded-full border-2 border-white/10"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-primary-foreground font-bold text-2xl">
                    {getDisplayName(user, "")[0] || <User className="w-8 h-8" />}
                  </div>
                )}
                <div>
                  <p className="text-sm text-muted-foreground">
                    Profile photo is synced from your Replit account
                  </p>
                </div>
              </div>

              <Separator className="border-white/5" />

              {/* Display Name */}
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <div className="flex gap-3">
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={user?.firstName || "Your name"}
                    className="bg-background border-white/10"
                    data-testid="input-display-name"
                  />
                  <Button
                    onClick={handleSaveProfile}
                    disabled={updateSettings.isPending || displayName === ((user?.settings as any)?.displayName || user?.firstName || "")}
                    data-testid="button-save-display-name"
                  >
                    {updateSettings.isPending ? "Saving…" : "Save"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This name appears in league standings and parlay lists
                </p>
              </div>

              <Separator className="border-white/5" />

              {/* Region */}
              <div className="space-y-3">
                <div>
                  <Label className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    Region
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Used to show you on regional leaderboards on the dashboard
                  </p>
                </div>
                <div className="flex gap-2">
                  {[
                    { key: "US", flag: "🇺🇸", label: "US" },
                    { key: "EMEA", flag: "🌍", label: "EMEA" },
                    { key: "APAC", flag: "🌏", label: "APAC" },
                  ].map(({ key, flag, label }) => (
                    <button
                      key={key}
                      onClick={() => setSelectedRegion(selectedRegion === key ? "" : key)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                        selectedRegion === key
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10"
                      )}
                      data-testid={`button-region-${key.toLowerCase()}`}
                    >
                      <span>{flag}</span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
                <Button
                  size="sm"
                  onClick={handleSaveRegion}
                  disabled={updateSettings.isPending || selectedRegion === ((user?.settings as any)?.region || "")}
                  data-testid="button-save-region"
                >
                  {updateSettings.isPending ? "Saving…" : "Save Region"}
                </Button>
              </div>

              <Separator className="border-white/5" />

              {/* Email (read-only) */}
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  value={user?.email || ""}
                  readOnly
                  className="bg-background border-white/10 opacity-60"
                  data-testid="input-email-readonly"
                />
                <p className="text-xs text-muted-foreground">
                  Email is managed by your Replit account
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-4">
          <Card className="bg-card/50 border-white/5">
            <CardHeader>
              <CardTitle>Accent Color</CardTitle>
              <CardDescription>Choose your preferred accent color — applied consistently across the entire app including the login page</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-4 gap-3">
                {COLOR_PRESETS.filter(p => !(selectedTheme === "light" && p.label === "Teal")).map((preset) => {
                  const isSelected = selectedColor === preset.value;
                  return (
                    <button
                      key={preset.value}
                      onClick={() => setSelectedColor(preset.value)}
                      className={cn(
                        "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                        isSelected
                          ? "border-white/40 bg-white/10 scale-105"
                          : "border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/20"
                      )}
                      data-testid={`color-preset-${preset.label.toLowerCase()}`}
                    >
                      <div
                        className="w-8 h-8 rounded-full ring-2 ring-offset-2 ring-offset-background transition-all"
                        style={{
                          backgroundColor: `hsl(${preset.value})`,
                          outline: isSelected ? `2px solid hsl(${preset.value})` : "none",
                          outlineOffset: "2px",
                        }}
                      />
                      <span className="text-xs text-muted-foreground">{preset.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <div className="flex-1 p-3 rounded-xl bg-white/5 border border-white/5 flex items-center gap-3">
                  <div
                    className="w-5 h-5 rounded-full shrink-0"
                    style={{ backgroundColor: `hsl(${selectedColor})` }}
                  />
                  <span className="text-sm text-muted-foreground">
                    {COLOR_PRESETS.find(p => p.value === selectedColor)?.label ?? "Custom"} selected
                  </span>
                </div>
                <Button
                  onClick={handleSaveColor}
                  disabled={updateSettings.isPending || selectedColor === ((user?.settings as any)?.primaryColor || "221 83% 53%")}
                  data-testid="button-save-color"
                >
                  {updateSettings.isPending ? "Saving…" : "Apply"}
                </Button>
              </div>

              <Separator className="border-white/5" />

              {/* Theme selector */}
              <div className="space-y-3">
                <div>
                  <p className="font-medium text-sm">Theme</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Choose how the app looks</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: "dark" as const, label: "Dark", Icon: Moon },
                    { key: "light" as const, label: "Light", Icon: Sun },
                    { key: "system" as const, label: "System", Icon: Monitor },
                  ]).map(({ key, label, Icon }) => {
                    const active = selectedTheme === key;
                    return (
                      <button
                        key={key}
                        onClick={() => handleSaveTheme(key)}
                        className={cn(
                          "flex flex-col items-center gap-2 py-4 rounded-xl border text-sm font-medium transition-all",
                          active
                            ? "bg-primary/15 border-primary text-primary"
                            : "bg-white/5 border-white/5 text-muted-foreground hover:bg-white/10 hover:border-white/20 hover:text-foreground"
                        )}
                        data-testid={`button-theme-${key}`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="text-xs">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-sm">Odds Format</p>
                  <p className="text-xs text-muted-foreground">American, decimal, or fractional</p>
                </div>
                <Badge variant="outline" className="text-muted-foreground">Coming soon</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-4">
          <Card className="bg-card/50 border-white/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                Notification Delivery
              </CardTitle>
              <CardDescription>
                Choose how you want to receive alerts in addition to the in-app notification bell
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Email */}
              <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                      <Mail className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Email</p>
                      <p className="text-xs text-muted-foreground">{user?.email}</p>
                    </div>
                  </div>
                  <Switch
                    checked={notifPrefs.email}
                    onCheckedChange={(v) => setNotifPrefs((p) => ({ ...p, email: v }))}
                    data-testid="switch-email-notifications"
                  />
                </div>
                {notifPrefs.email && (
                  <p className="text-xs text-blue-400/80 pl-11">
                    Email delivery requires additional setup — your preference is saved.
                  </p>
                )}
              </div>

              {/* SMS */}
              <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                      <MessageSquare className="w-4 h-4 text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">SMS / Text Message</p>
                      <p className="text-xs text-muted-foreground">Requires a verified phone number</p>
                    </div>
                  </div>
                  <Switch
                    checked={notifPrefs.sms}
                    onCheckedChange={(v) => setNotifPrefs((p) => ({ ...p, sms: v }))}
                    data-testid="switch-sms-notifications"
                  />
                </div>
                {notifPrefs.sms && (
                  <div className="pl-11 space-y-2">
                    <Label htmlFor="phone" className="text-xs text-muted-foreground">Phone number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+1 555 000 0000"
                      value={notifPrefs.phone || ""}
                      onChange={(e) => setNotifPrefs((p) => ({ ...p, phone: e.target.value }))}
                      className="bg-background border-white/10 h-8 text-sm"
                      data-testid="input-phone-number"
                    />
                    <p className="text-xs text-green-400/80">SMS delivery requires Twilio integration — your preference is saved.</p>
                  </div>
                )}
              </div>

              {/* Push */}
              <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                      <Smartphone className="w-4 h-4 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Push Notifications</p>
                      <p className="text-xs text-muted-foreground">Native app only — not available in browser</p>
                    </div>
                  </div>
                  <Switch
                    checked={notifPrefs.push}
                    onCheckedChange={(v) => setNotifPrefs((p) => ({ ...p, push: v }))}
                    data-testid="switch-push-notifications"
                  />
                </div>
                {notifPrefs.push && (
                  <p className="text-xs text-purple-400/80 mt-2 pl-11">Push notifications will be available when a native app is released.</p>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => updateNotifPrefs.mutate(notifPrefs)}
                  disabled={updateNotifPrefs.isPending}
                  data-testid="button-save-notification-prefs"
                >
                  {updateNotifPrefs.isPending ? "Saving…" : "Save Preferences"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Admin Privileges Tab */}
        <TabsContent value="admin" className="space-y-4">
          {!isAnyAdmin && !isAnyLieutenant ? (
            /* ── No elevated role in any league ── */
            <Card className="bg-card/50 border-white/5">
              <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                  <Shield className="w-7 h-7 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <p className="text-lg font-semibold" data-testid="text-no-admin-privileges">
                    No Admin Privileges Available
                  </p>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    You are a standard member in all your leagues. Admin settings are only available to Parlay Maestros and Parlay Lieutenants.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* ── Parlay Maestro section ── */}
              {isAnyAdmin && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-1">
                    <Crown className="w-4 h-4 text-primary" />
                    <h2 className="text-sm font-semibold text-primary uppercase tracking-wider">
                      Parlay Maestro
                    </h2>
                  </div>

                  {/* League list with per-league permission summaries */}
                  <Card className="bg-card/50 border-white/5">
                    <CardHeader>
                      <CardTitle className="text-base">Your Admin Leagues</CardTitle>
                      <CardDescription>
                        You have full control over the following leagues. Configure per-league Lieutenant permissions from each league's Settings page.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {adminLeagues.map(league => {
                        const lp = league.lieutenantPermissions as Record<string, boolean> | null;
                        const grantedCount = lp ? Object.values(lp).filter(Boolean).length : 0;
                        return (
                          <div
                            key={league.id}
                            className="p-3 rounded-lg bg-white/5 border border-white/5"
                            data-testid={`row-admin-league-${league.id}`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                                  <Crown className="w-4 h-4 text-primary" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium">{league.name}</p>
                                  <p className="text-xs text-muted-foreground">{league.memberCount} members</p>
                                </div>
                              </div>
                              <Link href={`/leagues/${league.id}/settings`}>
                                <Button size="sm" variant="outline" data-testid={`button-league-settings-${league.id}`}>
                                  Configure
                                </Button>
                              </Link>
                            </div>
                            <p className="text-xs text-muted-foreground pl-11">
                              {grantedCount === 0
                                ? "No Lieutenant permissions granted yet"
                                : `${grantedCount} Lieutenant permission${grantedCount !== 1 ? "s" : ""} enabled`}
                            </p>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>

                  {/* Full permission framework reference */}
                  <Card className="bg-card/50 border-white/5">
                    <CardHeader>
                      <CardTitle className="text-base">Permission Framework</CardTitle>
                      <CardDescription>
                        All league activities and who is authorized to perform them. Configure per-league Lieutenant access in each league's Settings.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      {/* Grantable to lieutenants */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Configurable — can be granted to Parlay Lieutenants</p>
                        <div className="space-y-2">
                          {[
                            { label: "Approve / Reject Parlays", desc: "Approve or reject pending parlay submissions", icon: "✓" },
                            { label: "Edit Parlays", desc: "Edit parlay picks and leg results for any member", icon: "✓" },
                            { label: "Lock Weekly Parlay", desc: "Lock the week's parlay to prevent further submissions", icon: "✓" },
                            { label: "Unlock Weekly Parlay", desc: "Unlock a previously locked parlay to re-open submissions", icon: "✓" },
                            { label: "Remove a Member's Pick", desc: "Clear an individual pick from another member's parlay", icon: "✓" },
                            { label: "Approve Member Invites", desc: "Approve pending invite requests from regular members", icon: "✓" },
                            { label: "Mark League as Demo", desc: "Toggle the league's demo / QA flag", icon: "✓" },
                          ].map(({ label, desc, icon }) => (
                            <div key={label} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
                              <span className="text-green-400 text-xs font-bold mt-0.5 w-4 shrink-0">{icon}</span>
                              <div className="min-w-0">
                                <p className="text-sm font-medium">{label}</p>
                                <p className="text-xs text-muted-foreground">{desc}</p>
                              </div>
                              <Badge variant="outline" className="text-[10px] shrink-0 text-muted-foreground">Lt. eligible</Badge>
                            </div>
                          ))}
                        </div>
                      </div>

                      <Separator className="border-white/5" />

                      {/* Admin-only activities */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Admin-Only — never delegatable</p>
                        <div className="space-y-2">
                          {[
                            { label: "Backload Historical Data", desc: "Import historical parlay records via CSV — restricted to Parlay Maestro only" },
                            { label: "Suspend Members", desc: "Remove or suspend a member from the league temporarily or permanently" },
                            { label: "Set Parlay Lieutenant", desc: "Promote or demote members to/from the Parlay Lieutenant role" },
                          ].map(({ label, desc }) => (
                            <div key={label} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
                              <span className="text-red-400 text-xs font-bold mt-0.5 w-4 shrink-0">✕</span>
                              <div className="min-w-0">
                                <p className="text-sm font-medium">{label}</p>
                                <p className="text-xs text-muted-foreground">{desc}</p>
                              </div>
                              <Badge variant="outline" className="text-[10px] shrink-0 text-red-400 border-red-400/30">Admin only</Badge>
                            </div>
                          ))}
                        </div>
                      </div>

                      <Separator className="border-white/5" />

                      {/* Open to all members */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">All Members</p>
                        <div className="flex items-start gap-3 py-2">
                          <span className="text-blue-400 text-xs font-bold mt-0.5 w-4 shrink-0">→</span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium">Send League Invites</p>
                            <p className="text-xs text-muted-foreground">Any member can send invites, but admin or Lieutenant approval is required before the invite goes through. Admin invites bypass the approval step.</p>
                          </div>
                          <Badge variant="outline" className="text-[10px] shrink-0 text-blue-400 border-blue-400/30">All members</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {isAnyAdmin && isAnyLieutenant && <Separator className="border-white/5" />}

              {/* ── Parlay Lieutenant section ── */}
              {isAnyLieutenant && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-1">
                    <Star className="w-4 h-4 text-blue-400" />
                    <h2 className="text-sm font-semibold text-blue-400 uppercase tracking-wider">
                      Parlay Lieutenant
                    </h2>
                  </div>

                  {/* Per-league permissions breakdown */}
                  <Card className="bg-card/50 border-white/5">
                    <CardHeader>
                      <CardTitle className="text-base">Your Granted Permissions</CardTitle>
                      <CardDescription>
                        Permissions granted to you by the Parlay Maestro in each league. Contact the Parlay Maestro to request changes.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {lieutenantLeagues.map(league => {
                        const lp = league.lieutenantPermissions as Record<string, boolean> | null;
                        const PERM_DISPLAY: { key: string; label: string }[] = [
                          { key: "approveRejectParlays", label: "Approve / Reject Parlays" },
                          { key: "editParlays", label: "Edit Parlays" },
                          { key: "lockParlay", label: "Lock Weekly Parlay" },
                          { key: "unlockParlay", label: "Unlock Weekly Parlay" },
                          { key: "unselectUserPick", label: "Remove a Member's Pick" },
                          { key: "approveMemberInvites", label: "Approve Member Invites" },
                          { key: "markLeagueDemo", label: "Mark League as Demo" },
                        ];
                        const granted = PERM_DISPLAY.filter(p => lp?.[p.key]);
                        const denied = PERM_DISPLAY.filter(p => !lp?.[p.key]);
                        return (
                          <div key={league.id} data-testid={`row-lieutenant-league-${league.id}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Star className="w-4 h-4 text-blue-400 shrink-0" />
                                <p className="text-sm font-semibold">{league.name}</p>
                              </div>
                              <Link href={`/leagues/${league.id}`}>
                                <Button size="sm" variant="outline" className="h-7 text-xs" data-testid={`button-lieutenant-league-${league.id}`}>
                                  View League
                                </Button>
                              </Link>
                            </div>
                            <div className="grid grid-cols-2 gap-1 pl-6">
                              {granted.map(p => (
                                <div key={p.key} className="flex items-center gap-1.5 text-xs text-green-400">
                                  <span>✓</span>
                                  <span>{p.label}</span>
                                </div>
                              ))}
                              {denied.map(p => (
                                <div key={p.key} className="flex items-center gap-1.5 text-xs text-muted-foreground/50">
                                  <span>✕</span>
                                  <span>{p.label}</span>
                                </div>
                              ))}
                            </div>
                            {league !== lieutenantLeagues[lieutenantLeagues.length - 1] && (
                              <Separator className="border-white/5 mt-4" />
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Account Tab */}
        <TabsContent value="account" className="space-y-4">
          <Card className="bg-card/50 border-white/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-yellow-400" />
                Demo / QA Mode
              </CardTitle>
              <CardDescription>
                Flag your account as demo or QA data to distinguish it from live production records
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">Demo Account</p>
                    {user?.isDemo && (
                      <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] px-1 py-0 h-4">
                        ACTIVE
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    When enabled, a DEMO badge appears next to your name in all leagues. Useful for separating test accounts from real players in a shared production database.
                  </p>
                </div>
                <Switch
                  checked={!!user?.isDemo}
                  onCheckedChange={(checked) => setUserDemo.mutate(checked)}
                  disabled={setUserDemo.isPending}
                  data-testid="switch-user-demo"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-white/5">
            <CardHeader>
              <CardTitle>Danger Zone</CardTitle>
              <CardDescription>Irreversible account actions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-sm">Delete Account</p>
                  <p className="text-xs text-muted-foreground">Permanently remove your account and all data</p>
                </div>
                <Button variant="destructive" size="sm" disabled data-testid="button-delete-account">
                  Coming soon
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
