import { useState, useCallback, useEffect } from "react";
import type { UserStat } from "@shared/schema";
import { useLeagues, useLeagueStats } from "@/hooks/use-bets";
import { Trophy, Medal, Globe2, MapPin, Users, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Region = "US" | "EMEA" | "APAC";

const REGIONS: { key: Region; flag: string; label: string }[] = [
  { key: "US", flag: "🇺🇸", label: "US" },
  { key: "EMEA", flag: "🌍", label: "EMEA" },
  { key: "APAC", flag: "🌏", label: "APAC" },
];

const SLIDE_LABELS = ["My Leagues", "Regional", "Global"];

interface HeroSliderProps {
  globalStats: UserStat[];
}

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3">
      <Icon className="w-10 h-10 text-muted-foreground opacity-30" />
      <p className="text-muted-foreground text-sm text-center max-w-xs">{message}</p>
    </div>
  );
}

function PlayerDisplay({ player, label }: { player: UserStat; label: string }) {
  return (
    <>
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest mb-4">
        <Medal className="w-3.5 h-3.5" />
        {label}
      </div>
      <h1 className="text-3xl md:text-5xl font-display font-bold mb-2 leading-tight truncate max-w-full">
        {player.username}
      </h1>
      <div className="flex items-end gap-2 mb-6">
        <span className="text-4xl md:text-6xl font-mono font-bold text-primary text-glow">
          {Number(player.winRate).toFixed(1)}%
        </span>
        <span className="text-muted-foreground font-mono mb-1 md:mb-2">Win Rate</span>
      </div>
      <div className="flex gap-8">
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Wins</p>
          <p className="text-2xl font-mono font-bold text-white">{player.wins}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Losses</p>
          <p className="text-2xl font-mono font-bold text-white">{player.losses}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Pushes</p>
          <p className="text-2xl font-mono font-bold text-white">{player.pushes}</p>
        </div>
      </div>
    </>
  );
}

function LeagueSlideContent() {
  const { data: leagues, isLoading: leaguesLoading } = useLeagues();
  const [selectedLeagueId, setSelectedLeagueId] = useState<number>(0);

  useEffect(() => {
    if (leagues?.length && !selectedLeagueId) {
      setSelectedLeagueId(leagues[0].id);
    }
  }, [leagues, selectedLeagueId]);

  const { data: leagueStats, isLoading: statsLoading } = useLeagueStats(selectedLeagueId);

  if (leaguesLoading) {
    return (
      <div className="flex items-center gap-2 py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground text-sm">Loading leagues…</span>
      </div>
    );
  }

  if (!leagues?.length) {
    return <EmptyState icon={Users} message="Join a league to see league leaders" />;
  }

  const topPlayer = leagueStats?.length
    ? leagueStats.reduce((prev, curr) => (prev.winRate > curr.winRate ? prev : curr))
    : null;

  return (
    <div>
      <div className="flex gap-2 flex-wrap mb-5">
        {leagues.map((league) => (
          <button
            key={league.id}
            onClick={(e) => { e.stopPropagation(); setSelectedLeagueId(league.id); }}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-semibold transition-all border",
              selectedLeagueId === league.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10"
            )}
          >
            {league.name}
          </button>
        ))}
      </div>

      {statsLoading ? (
        <div className="flex items-center gap-2 py-4">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground text-sm">Loading…</span>
        </div>
      ) : topPlayer ? (
        <PlayerDisplay player={topPlayer} label="League Leader" />
      ) : (
        <EmptyState icon={Trophy} message="No completed parlays yet for this league" />
      )}
    </div>
  );
}

function RegionalSlideContent({ globalStats }: { globalStats: UserStat[] }) {
  const [selectedRegion, setSelectedRegion] = useState<Region>("US");

  const regionStats = globalStats.filter((s) => s.region === selectedRegion);
  const topPlayer = regionStats.length
    ? regionStats.reduce((prev, curr) => (prev.winRate > curr.winRate ? prev : curr))
    : null;

  const regionMeta = REGIONS.find((r) => r.key === selectedRegion)!;

  return (
    <div>
      <div className="flex gap-2 mb-5">
        {REGIONS.map(({ key, flag, label }) => (
          <button
            key={key}
            onClick={(e) => { e.stopPropagation(); setSelectedRegion(key); }}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-semibold transition-all border flex items-center gap-1.5",
              selectedRegion === key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10"
            )}
          >
            <span>{flag}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      {topPlayer ? (
        <PlayerDisplay player={topPlayer} label={`${regionMeta.flag} ${regionMeta.label} Leader`} />
      ) : (
        <EmptyState
          icon={MapPin}
          message={`No ${selectedRegion} players have set their region yet. Users can set their region in Settings → Profile.`}
        />
      )}
    </div>
  );
}

export function HeroSlider({ globalStats }: HeroSliderProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const totalSlides = 3;

  const goToSlide = useCallback((index: number) => {
    setCurrentSlide(index);
  }, []);

  const prev = useCallback(() => {
    setCurrentSlide((s) => (s - 1 + totalSlides) % totalSlides);
  }, []);

  const next = useCallback(() => {
    setCurrentSlide((s) => (s + 1) % totalSlides);
  }, []);

  const globalTopPlayer = globalStats.length
    ? globalStats.reduce((prev, curr) => (prev.winRate > curr.winRate ? prev : curr))
    : null;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-background to-background border border-primary/20">
      <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">
        <Trophy className="w-64 h-64 rotate-12" />
      </div>

      <div className="relative z-10 flex items-center justify-between px-6 pt-5">
        <div className="flex gap-0.5 bg-white/5 rounded-full p-1 border border-white/10">
          {SLIDE_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => goToSlide(i)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-semibold transition-all",
                currentSlide === i
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex gap-1">
          <button
            onClick={prev}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={next}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${currentSlide * 100}%)` }}
        >
          <div className="w-full shrink-0 p-6 md:p-10 min-h-[260px]">
            <LeagueSlideContent />
          </div>
          <div className="w-full shrink-0 p-6 md:p-10 min-h-[260px]">
            <RegionalSlideContent globalStats={globalStats} />
          </div>
          <div className="w-full shrink-0 p-6 md:p-10 min-h-[260px]">
            {globalTopPlayer ? (
              <PlayerDisplay player={globalTopPlayer} label="Global Leader" />
            ) : (
              <EmptyState icon={Globe2} message="No global stats yet" />
            )}
          </div>
        </div>
      </div>

      <div className="relative z-10 flex justify-center gap-2 pb-4 pt-1">
        {Array.from({ length: totalSlides }).map((_, i) => (
          <button
            key={i}
            onClick={() => goToSlide(i)}
            className={cn(
              "rounded-full transition-all duration-300",
              currentSlide === i ? "w-6 h-2 bg-primary" : "w-2 h-2 bg-white/20 hover:bg-white/40"
            )}
          />
        ))}
      </div>

    </div>
  );
}
