import { useState } from "react";
import { useLeagues, useCreateLeague, useJoinLeague, useLeaguesOverviewStats, useLeaguesActiveStatus, useLeaguesWeeklyWinRates } from "@/hooks/use-bets";
import { LeagueActivitySparkline } from "@/components/leagues/LeagueActivitySparkline";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, LogIn, Copy, Crown, FlaskConical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

export default function Leagues() {
  const { data: leagues, isLoading } = useLeagues();
  const { data: overviewStats } = useLeaguesOverviewStats();
  const { data: activeStatus } = useLeaguesActiveStatus();
  const { data: weeklyWinRates } = useLeaguesWeeklyWinRates();
  const createLeague = useCreateLeague();
  const joinLeague = useJoinLeague();
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [newLeagueName, setNewLeagueName] = useState("");
  const [newLeagueDesc, setNewLeagueDesc] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  const handleCreate = () => {
    if (!newLeagueName.trim()) return;
    createLeague.mutate({ name: newLeagueName, description: newLeagueDesc || undefined }, {
      onSuccess: () => {
        setCreateOpen(false);
        setNewLeagueName("");
        setNewLeagueDesc("");
      }
    });
  };

  const handleJoin = () => {
    if (!inviteCode.trim()) return;
    joinLeague.mutate(inviteCode, {
      onSuccess: () => {
        setJoinOpen(false);
        setInviteCode("");
      }
    });
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Copied!", description: "Invite code copied to clipboard" });
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card/30 p-6 rounded-2xl border border-white/5 backdrop-blur-sm">
        <div>
          <h1 className="text-3xl font-display font-bold" data-testid="text-leagues-title">My Leagues</h1>
          <p className="text-muted-foreground">Join friends and compete for bragging rights</p>
        </div>
        
        <div className="flex gap-2">
          <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-join-league">
                <LogIn className="w-4 h-4 mr-2" />
                Join League
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Join a League</DialogTitle>
                <DialogDescription>Enter the invite code shared by a league admin</DialogDescription>
              </DialogHeader>
              <Input 
                placeholder="Enter invite code" 
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                data-testid="input-invite-code"
              />
              <DialogFooter>
                <Button onClick={handleJoin} disabled={joinLeague.isPending} data-testid="button-submit-join">
                  {joinLeague.isPending ? "Joining..." : "Join"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-league">
                <Plus className="w-4 h-4 mr-2" />
                Create League
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a New League</DialogTitle>
                <DialogDescription>Start a league and invite your friends</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Input 
                  placeholder="League name" 
                  value={newLeagueName}
                  onChange={(e) => setNewLeagueName(e.target.value)}
                  data-testid="input-league-name"
                />
                <Input 
                  placeholder="Description (optional)" 
                  value={newLeagueDesc}
                  onChange={(e) => setNewLeagueDesc(e.target.value)}
                  data-testid="input-league-description"
                />
              </div>
              <DialogFooter>
                <Button onClick={handleCreate} disabled={createLeague.isPending} data-testid="button-submit-create">
                  {createLeague.isPending ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="h-0.5 bg-gradient-to-r from-transparent via-white/30 to-transparent" />

      {!leagues?.length ? (
        <div className="text-center py-16 bg-card/20 rounded-2xl border border-dashed border-white/10">
          <Users className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold mb-2">No Leagues Yet</h2>
          <p className="text-muted-foreground mb-6">Create a league or join one with an invite code</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {leagues.map((league) => {
            const status = activeStatus?.[league.id];
            const anyOpen = !!status && !status.allSubmitted && !status.isLocked;
            const currentUserOpen = !!status && !status.currentUserSubmitted && !status.isLocked;
            return (
            <Card
              key={league.id}
              className={cn(
                "bg-card/50 backdrop-blur-sm border-white/5",
                anyOpen && "border-orange-500/40 shadow-[0_0_16px_2px_rgba(249,115,22,0.25)]",
                currentUserOpen && "animate-pulse border-orange-500/70"
              )}
              data-testid={`card-league-${league.id}`}
            >
              <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-xl">{league.name}</CardTitle>
                    {league.isAdmin && (
                      <Badge variant="secondary" className="text-xs">
                        <Crown className="w-3 h-3 mr-1" />
                        Parlay Maestro
                      </Badge>
                    )}
                    {league.isDemo && (
                      <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs" data-testid={`badge-demo-league-${league.id}`}>
                        <FlaskConical className="w-3 h-3 mr-1" />
                        DEMO
                      </Badge>
                    )}
                  </div>
                  {league.description && (
                    <CardDescription>{league.description}</CardDescription>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => copyCode(league.inviteCode)}
                    title="Copy invite code"
                    data-testid={`button-copy-code-${league.id}`}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Link href={`/leagues/${league.id}`}>
                    <Button data-testid={`button-view-league-${league.id}`}>
                      View League
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    <span>{league.memberCount} members</span>
                  </div>
                  <div>
                    <span className="font-mono text-xs bg-white/5 px-2 py-1 rounded">
                      Code: {league.inviteCode}
                    </span>
                  </div>
                  <div>
                    <span>{league.minLegsPerParlay}-{league.maxLegsPerParlay} legs per parlay</span>
                  </div>
                  {(() => {
                    const stat = overviewStats?.[league.id];
                    if (!stat || stat.totalDecided === 0) return null;
                    const color =
                      stat.winRate >= 60 ? "text-green-400" :
                      stat.winRate >= 40 ? "text-yellow-400" :
                      "text-red-400";
                    const sparklineColor =
                      stat.winRate >= 60 ? "#4ade80" :
                      stat.winRate >= 40 ? "#facc15" :
                      "#f87171";
                    return (
                      <div className="ml-auto flex items-center gap-3 shrink-0">
                        <LeagueActivitySparkline
                          points={weeklyWinRates?.[league.id] ?? []}
                          color={sparklineColor}
                        />
                        <div className="flex flex-col items-end gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className={`font-bold text-sm ${color}`}>
                              {stat.winRate.toFixed(1)}%
                            </span>
                            <span className="text-xs text-muted-foreground/60">Overall Picks Won</span>
                          </div>
                          <span className="text-xs text-muted-foreground/60">
                            {stat.wins} pick{stat.wins !== 1 ? "s" : ""} won
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
