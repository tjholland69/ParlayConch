import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWeeks, useGames, useLeagues, useLeaguesActiveStatus } from "@/hooks/use-bets";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Calendar, Users, ArrowRight, Info, Newspaper } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { getBuildingVerb } from "@/lib/parlaySlang";

interface InjuryNewsItem {
  id: string;
  title: string;
  description: string;
  tag?: string;
  team?: string;
  position?: string;
}

const NOT_RULED_OUT_TAGS = new Set(["Questionable", "Doubtful", "Day-To-Day"]);

function normalizeTeam(s: string) {
  return s.toLowerCase().trim();
}

function teamMatches(shortName: string, injuryTeam: string) {
  const a = normalizeTeam(shortName);
  const b = normalizeTeam(injuryTeam);
  return a.includes(b) || b.includes(a);
}

export default function Picks() {
  const { data: weeks, isLoading: isLoadingWeeks } = useWeeks();
  const { data: leagues, isLoading: isLoadingLeagues } = useLeagues();

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedWeekId, setSelectedWeekId] = useState<string | undefined>();

  const years = useMemo(
    () => [...new Set(weeks?.map(w => w.season) ?? [])].sort((a, b) => b - a),
    [weeks]
  );

  const weeksForYear = useMemo(
    () => weeks?.filter(w => w.season === selectedYear) ?? [],
    [weeks, selectedYear]
  );

  useEffect(() => {
    if (!weeksForYear.length) return;
    const activeWeek = weeksForYear.find(w => w.isActive);
    const week1 = weeksForYear.find(w => w.weekNumber === 1) ?? weeksForYear[0];
    setSelectedWeekId(activeWeek ? String(activeWeek.id) : String(week1.id));
  }, [selectedYear, weeks]);

  const { data: games, isLoading: isLoadingGames } = useGames(Number(selectedWeekId));
  const { data: activeStatus } = useLeaguesActiveStatus();
  const { data: injuries } = useQuery<InjuryNewsItem[]>({
    queryKey: ["/api/news", "injuries", 60],
    queryFn: async () => {
      const res = await fetch("/api/news?feed=injuries&limit=60");
      if (!res.ok) throw new Error("Failed to load injuries");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const gameNotes = useMemo(() => {
    if (!games?.length) return [];
    return games.map(game => {
      const watchList = (injuries ?? [])
        .filter(inj => inj.tag && NOT_RULED_OUT_TAGS.has(inj.tag))
        .filter(inj => inj.team && (teamMatches(game.homeTeam, inj.team) || teamMatches(game.awayTeam, inj.team)))
        .slice(0, 2);
      return { game, watchList };
    });
  }, [games, injuries]);

  if (isLoadingWeeks || isLoadingLeagues) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  if (!leagues?.length) {
    return (
      <div className="max-w-2xl mx-auto space-y-8 pb-12">
        <div className="text-center py-16 bg-card/30 rounded-2xl border border-white/10">
          <Users className="w-16 h-16 mx-auto text-primary mb-4" />
          <h2 className="text-2xl font-bold mb-2">Join a League to Make Picks</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Parlays are submitted through leagues. Create or join a league to start making your weekly parlay picks.
          </p>
          <Link href="/leagues">
            <Button size="lg" data-testid="button-go-to-leagues">
              Go to Leagues
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card/30 p-6 rounded-2xl border border-white/5 backdrop-blur-sm">
        <div>
          <h1 className="text-3xl font-display font-bold" data-testid="text-picks-title">Quick Picks</h1>
          <p className="text-muted-foreground">Browse games for the week. Make picks in your league.</p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          {/* Year filter */}
          <Select
            value={String(selectedYear)}
            onValueChange={v => setSelectedYear(Number(v))}
          >
            <SelectTrigger className="bg-background border-white/10 h-12 w-24 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Week filter */}
          <Select
            value={selectedWeekId}
            onValueChange={setSelectedWeekId}
          >
            <SelectTrigger className="bg-background border-white/10 h-12 flex-1 md:w-44 md:flex-none">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary shrink-0" />
                <SelectValue placeholder="Select Week" />
              </div>
            </SelectTrigger>
            <SelectContent>
              {weeksForYear.map(week => (
                <SelectItem key={week.id} value={String(week.id)}>
                  {week.label}{week.isActive ? " (Current)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* League Shortcuts */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {leagues.map((league) => {
          const status = activeStatus?.[league.id];
          const hasOpenParlay = !!(status && status.submittedCount > 0 && !status.isLocked);
          // Rule 1: open but not (fully) approved yet -> brewing, pulse yellow.
          // Rule 2: open and approved -> green, settled in.
          // Rule 3: no parlay this week -> leave base styling untouched.
          const isBrewing = hasOpenParlay && !!status?.hasPendingParlay;
          const isApproved = hasOpenParlay && !isBrewing && !!status?.hasApprovedParlay;
          const pct = hasOpenParlay
            ? Math.round((status!.submittedCount / Math.max(league.memberCount, 1)) * 100)
            : 0;
          const buildingVerb = getBuildingVerb(league.id);

          return (
            <Link key={league.id} href={`/leagues/${league.id}`}>
              <Card
                className={cn(
                  "relative overflow-hidden border cursor-pointer transition-all duration-300",
                  isBrewing && "border-yellow-500/50 bg-card/50 hover:bg-yellow-950/20 animate-pulse",
                  isApproved && "border-green-500/50 bg-card/50 hover:bg-green-950/20",
                  !isBrewing && !isApproved && "border-white/5 bg-card/50 hover:bg-white/5"
                )}
                style={
                  isBrewing
                    ? { boxShadow: "0 0 18px 3px rgba(234,179,8,0.22), 0 0 5px 1px rgba(234,179,8,0.16)" }
                    : isApproved
                    ? { boxShadow: "0 0 18px 3px rgba(34,197,94,0.22), 0 0 5px 1px rgba(34,197,94,0.16)" }
                    : undefined
                }
                data-testid={`card-league-quick-${league.id}`}
              >
                {/* Progress bar background */}
                {hasOpenParlay && (
                  <div
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 pointer-events-none transition-all duration-700 ease-out"
                    style={{
                      width: `${pct}%`,
                      background: isBrewing
                        ? "linear-gradient(to right, rgba(234,179,8,0.28), rgba(234,179,8,0.07))"
                        : "linear-gradient(to right, rgba(34,197,94,0.28), rgba(34,197,94,0.07))",
                      boxShadow: isBrewing
                        ? "inset -2px 0 8px rgba(234,179,8,0.14)"
                        : "inset -2px 0 8px rgba(34,197,94,0.14)",
                    }}
                  />
                )}
                <CardContent className="p-4 flex items-center justify-between relative z-10">
                  <div>
                    <p className="font-bold">{league.name}</p>
                    {isBrewing ? (
                      <>
                        <p className="text-xs text-yellow-400 font-medium flex items-center gap-1.5 mt-0.5">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse shrink-0" />
                          {buildingVerb}...
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {status!.submittedCount}/{league.memberCount} members in
                        </p>
                      </>
                    ) : isApproved ? (
                      <>
                        <p className="text-xs text-green-400 font-medium flex items-center gap-1.5 mt-0.5">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                          Parlay Approved
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {status!.submittedCount}/{league.memberCount} members in
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">{league.memberCount} members</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn(
                      "shrink-0",
                      isBrewing && "text-yellow-400 hover:text-yellow-300",
                      isApproved && "text-green-400 hover:text-green-300"
                    )}
                  >
                    {isBrewing ? "Join Parlay" : isApproved ? "View Parlay" : "Make Picks"}
                    <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Games Preview */}
      <div>
        <h2 className="text-xl font-bold mb-4">This Week's Games</h2>
        {isLoadingGames ? (
          <div className="grid gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : games?.length === 0 ? (
          <div className="text-center py-12 bg-card/20 rounded-2xl border border-dashed border-white/10">
            <p className="text-muted-foreground">No games scheduled for this week yet.</p>
          </div>
        ) : (
          <>
            {games?.some(g => !g.spread) && (
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-white/5 border border-white/10 rounded-xl px-4 py-3 mb-4">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary/70" />
                <span>Lines and game times will be posted closer to kickoff. Check back soon!</span>
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              {games?.map((game) => {
                const hasOdds = !!(game.spread || game.overUnder || game.moneylineHome);
                const hasTime = !!game.gameTime;
                return (
                  <Card key={game.id} className="bg-card/50 border-white/5" data-testid={`card-game-preview-${game.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">
                          {hasTime
                            ? format(new Date(game.gameTime!), "EEE, MMM d h:mm a")
                            : <span className="italic">Time TBD</span>}
                        </span>
                        {game.isFinished && (
                          <span className="text-xs font-mono text-muted-foreground">Final</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-bold">{game.awayTeam}</p>
                          <p className="text-xs text-muted-foreground">{game.awayRecord ?? ""}</p>
                        </div>
                        <div className="px-3 text-center min-w-[90px]">
                          {game.isFinished ? (
                            <p className="font-mono">{game.awayScore} - {game.homeScore}</p>
                          ) : hasOdds ? (
                            <>
                              <p className="text-xs text-muted-foreground">@</p>
                              <p className="font-mono text-sm">{game.spread}</p>
                            </>
                          ) : (
                            <>
                              <p className="text-[9px] text-primary/60 font-semibold uppercase tracking-wide leading-tight">More Info</p>
                              <p className="text-[9px] text-primary/60 font-semibold uppercase tracking-wide leading-tight">Coming Soon</p>
                            </>
                          )}
                        </div>
                        <div className="flex-1 text-right">
                          <p className="font-bold">{game.homeTeam}</p>
                          <p className="text-xs text-muted-foreground">{game.homeRecord ?? ""}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Week Synopsis */}
      {!!gameNotes.length && (
        <div>
          <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-primary/70" />
            Week Synopsis
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            A quick rundown of what's on tap, plus a few names still in the mix worth watching for prop bets.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {gameNotes.map(({ game, watchList }) => (
              <Card key={game.id} className="bg-card/30 border-white/5" data-testid={`card-week-synopsis-${game.id}`}>
                <CardContent className="p-4 space-y-2">
                  <p className="font-bold text-sm">
                    {game.awayTeam} @ {game.homeTeam}
                  </p>
                  {watchList.length > 0 ? (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Worth watching (not ruled out):</p>
                      <ul className="space-y-0.5">
                        {watchList.map(inj => (
                          <li key={inj.id} className="text-xs flex items-center gap-1.5">
                            <span className="font-medium">{inj.title.split(" — ")[0]}</span>
                            <span className="text-muted-foreground">{inj.tag}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No notable injury concerns reported.</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
