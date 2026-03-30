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
import { User, Bell, Palette, FlaskConical, Shield, Mail, MessageSquare, Smartphone, Crown, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import type { UserNotificationPreferences } from "@shared/schema";

const DEFAULT_PREFS: UserNotificationPreferences = { email: false, sms: false, push: false, phone: "" };

export default function Settings() {
  const { user } = useAuth();
  const setUserDemo = useSetUserDemo();
  const updateSettings = useUpdateUserSettings();
  const updateNotifPrefs = useUpdateNotificationPreferences();
  const { data: leagues } = useLeagues();

  const [displayName, setDisplayName] = useState(user?.firstName || "");
  const [notifPrefs, setNotifPrefs] = useState<UserNotificationPreferences>(DEFAULT_PREFS);

  useEffect(() => {
    const stored = (user?.settings as any)?.notificationPreferences;
    if (stored) setNotifPrefs({ ...DEFAULT_PREFS, ...stored });
  }, [user]);

  const handleSaveProfile = () => {
    updateSettings.mutate({ displayName });
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
                    {user?.firstName?.[0] || <User className="w-8 h-8" />}
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
                    disabled={updateSettings.isPending || displayName === user?.firstName}
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
              <CardTitle>Display Preferences</CardTitle>
              <CardDescription>Customize how the app looks and behaves for you</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between py-3 border-b border-white/5">
                <div>
                  <p className="font-medium text-sm">Theme</p>
                  <p className="text-xs text-muted-foreground">Light, dark, or system default</p>
                </div>
                <Badge variant="outline" className="text-muted-foreground">Coming soon</Badge>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-white/5">
                <div>
                  <p className="font-medium text-sm">Default Week View</p>
                  <p className="text-xs text-muted-foreground">Start on current week or last viewed</p>
                </div>
                <Badge variant="outline" className="text-muted-foreground">Coming soon</Badge>
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
                      Parlay Maestro Settings
                    </h2>
                  </div>

                  {/* Leagues where user is admin */}
                  <Card className="bg-card/50 border-white/5">
                    <CardHeader>
                      <CardTitle className="text-base">Your Leagues (Parlay Maestro)</CardTitle>
                      <CardDescription>
                        You have full administrative control over the following leagues. Per-league settings can be configured from each league's Settings page.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {adminLeagues.map(league => (
                        <div
                          key={league.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5"
                          data-testid={`row-admin-league-${league.id}`}
                        >
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
                      ))}
                    </CardContent>
                  </Card>

                  {/* Placeholder card — admin-specific global settings go here */}
                  <Card className="bg-card/50 border-white/5">
                    <CardHeader>
                      <CardTitle className="text-base">Global Admin Preferences</CardTitle>
                      <CardDescription>
                        Settings that apply across all leagues you administrate
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div
                        className="flex items-center justify-center py-8 rounded-xl border border-dashed border-white/10 text-muted-foreground text-sm"
                        data-testid="placeholder-admin-settings"
                      >
                        Admin preference settings coming in the next update
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              <Separator className="border-white/5" />

              {/* ── Parlay Lieutenant section ── */}
              {isAnyLieutenant && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-1">
                    <Star className="w-4 h-4 text-blue-400" />
                    <h2 className="text-sm font-semibold text-blue-400 uppercase tracking-wider">
                      Parlay Lieutenant Settings
                    </h2>
                  </div>

                  {/* Leagues where user is lieutenant */}
                  <Card className="bg-card/50 border-white/5">
                    <CardHeader>
                      <CardTitle className="text-base">Your Leagues (Parlay Lieutenant)</CardTitle>
                      <CardDescription>
                        You have been granted Lieutenant permissions in the following leagues by the Parlay Maestro.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {lieutenantLeagues.map(league => (
                        <div
                          key={league.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5"
                          data-testid={`row-lieutenant-league-${league.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                              <Star className="w-4 h-4 text-blue-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{league.name}</p>
                              <div className="flex items-center gap-1 mt-0.5">
                                {league.lieutenantPermissions?.approveRejectParlays && (
                                  <Badge className="text-[10px] px-1 py-0 h-4 bg-blue-500/20 text-blue-400 border-blue-500/30">
                                    Approve/Reject
                                  </Badge>
                                )}
                                {league.lieutenantPermissions?.editParlays && (
                                  <Badge className="text-[10px] px-1 py-0 h-4 bg-blue-500/20 text-blue-400 border-blue-500/30">
                                    Edit Parlays
                                  </Badge>
                                )}
                                {league.lieutenantPermissions?.importHistory && (
                                  <Badge className="text-[10px] px-1 py-0 h-4 bg-blue-500/20 text-blue-400 border-blue-500/30">
                                    Import
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          <Link href={`/leagues/${league.id}`}>
                            <Button size="sm" variant="outline" data-testid={`button-lieutenant-league-${league.id}`}>
                              View League
                            </Button>
                          </Link>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Placeholder card — lieutenant-specific settings go here */}
                  <Card className="bg-card/50 border-white/5">
                    <CardHeader>
                      <CardTitle className="text-base">Lieutenant Preferences</CardTitle>
                      <CardDescription>
                        Settings available to you based on permissions granted by your Parlay Maestro
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div
                        className="flex items-center justify-center py-8 rounded-xl border border-dashed border-white/10 text-muted-foreground text-sm"
                        data-testid="placeholder-lieutenant-settings"
                      >
                        Lieutenant preference settings coming in the next update
                      </div>
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
