import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSetUserDemo, useUpdateUserSettings } from "@/hooks/use-bets";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { User, Bell, Palette, FlaskConical, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Settings() {
  const { user } = useAuth();
  const setUserDemo = useSetUserDemo();
  const updateSettings = useUpdateUserSettings();

  const [displayName, setDisplayName] = useState(user?.firstName || "");

  const handleSaveProfile = () => {
    updateSettings.mutate({ displayName });
  };

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
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Control when and how you receive updates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between py-3 border-b border-white/5">
                <div>
                  <p className="font-medium text-sm">Parlay Approved</p>
                  <p className="text-xs text-muted-foreground">When a league admin approves your pick</p>
                </div>
                <Badge variant="outline" className="text-muted-foreground">Coming soon</Badge>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-white/5">
                <div>
                  <p className="font-medium text-sm">Parlay Rejected</p>
                  <p className="text-xs text-muted-foreground">When a league admin rejects your pick</p>
                </div>
                <Badge variant="outline" className="text-muted-foreground">Coming soon</Badge>
              </div>
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-sm">Weekly Reminder</p>
                  <p className="text-xs text-muted-foreground">Reminder to submit your weekly parlay</p>
                </div>
                <Badge variant="outline" className="text-muted-foreground">Coming soon</Badge>
              </div>
            </CardContent>
          </Card>
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
