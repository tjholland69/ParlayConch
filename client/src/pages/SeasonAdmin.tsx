import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldAlert, CalendarPlus, RefreshCw, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useWeeks } from "@/hooks/use-bets";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/SlidingCard";
import type { Week } from "@shared/schema";

/**
 * Super-user-only panel for standing up a new season: create the week row,
 * pull its games/lines from OddsAPI, then activate it once ready. Unlisted —
 * no nav link, same pattern as /exceptions — navigate here directly.
 */
export default function SeasonAdmin() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: weeks, isLoading: weeksLoading } = useWeeks();

  const currentYear = new Date().getFullYear();
  const [season, setSeason] = useState(String(currentYear));
  const [weekNumber, setWeekNumber] = useState("1");
  const [createdWeek, setCreatedWeek] = useState<Week | null>(null);

  const createWeek = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/weeks", {
        season: Number(season),
        weekNumber: Number(weekNumber),
      });
      return res.json();
    },
    onSuccess: (data) => {
      setCreatedWeek(data.week);
      queryClient.invalidateQueries({ queryKey: ["/api/weeks"] });
      toast({ title: data.message, description: `Week #${data.week.id} — ${data.week.label}` });
    },
    onError: (err: Error) => toast({ title: "Failed to create week", description: err.message, variant: "destructive" }),
  });

  const syncGames = useMutation({
    mutationFn: async (weekId: number) => {
      const res = await apiRequest("POST", `/api/admin/weeks/${weekId}/sync-games`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Games synced", description: `${data.added} added, ${data.updated} updated` });
    },
    onError: (err: Error) => toast({ title: "Sync failed", description: err.message, variant: "destructive" }),
  });

  const activateWeek = useMutation({
    mutationFn: async (weekId: number) => {
      const res = await apiRequest("POST", `/api/admin/weeks/${weekId}/activate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weeks"] });
      toast({ title: "Active week updated" });
    },
    onError: (err: Error) => toast({ title: "Activation failed", description: err.message, variant: "destructive" }),
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user?.isSuperUser) {
    return (
      <div className="max-w-lg mx-auto mt-16">
        <EmptyState icon={ShieldAlert} message="This page is restricted to support staff." />
      </div>
    );
  }

  const recentWeeks = [...(weeks ?? [])]
    .sort((a, b) => b.season - a.season || b.weekNumber - a.weekNumber)
    .slice(0, 8);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
          <CalendarPlus className="w-6 h-6 text-accent" />
          Season Admin
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Stand up a new week: create it, pull games/lines from OddsAPI, then activate.
        </p>
      </div>

      <Card className="border-white/5">
        <CardHeader className="pb-2 font-semibold text-sm">1. Create week</CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Season</label>
              <Input type="number" value={season} onChange={(e) => setSeason(e.target.value)} />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Week #</label>
              <Input type="number" value={weekNumber} onChange={(e) => setWeekNumber(e.target.value)} />
            </div>
          </div>
          <Button onClick={() => createWeek.mutate()} disabled={createWeek.isPending} className="w-full">
            {createWeek.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Week"}
          </Button>
        </CardContent>
      </Card>

      {createdWeek && (
        <Card className="border-white/5">
          <CardHeader className="pb-2 font-semibold text-sm flex items-center justify-between">
            <span>2. Sync &amp; activate — {createdWeek.label}</span>
            {createdWeek.isActive && <Badge variant="outline" className="gap-1"><CheckCircle2 className="w-3 h-3" /> Active</Badge>}
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => syncGames.mutate(createdWeek.id)}
              disabled={syncGames.isPending}
            >
              {syncGames.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><RefreshCw className="w-4 h-4 mr-2" /> Sync Games</>}
            </Button>
            <Button
              className="flex-1"
              onClick={() => activateWeek.mutate(createdWeek.id)}
              disabled={activateWeek.isPending || !!createdWeek.isActive}
            >
              {activateWeek.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Activate Week"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="border-white/5">
        <CardHeader className="pb-2 font-semibold text-sm">Existing weeks</CardHeader>
        <CardContent className="space-y-2">
          {weeksLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          ) : (
            recentWeeks.map((w) => (
              <div key={w.id} className="flex items-center justify-between text-sm py-1 border-b border-white/5 last:border-0">
                <span>{w.label}</span>
                <div className="flex items-center gap-2">
                  {w.isActive ? (
                    <Badge variant="outline" className="gap-1"><CheckCircle2 className="w-3 h-3" /> Active</Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => activateWeek.mutate(w.id)}
                      disabled={activateWeek.isPending}
                    >
                      Activate
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => syncGames.mutate(w.id)}
                    disabled={syncGames.isPending}
                  >
                    Sync Games
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
