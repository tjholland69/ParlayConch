import { useEffect, useState } from "react";
import { BarChart3, Loader2, RotateCcw, SlidersHorizontal, Save } from "lucide-react";
import { useLeagues } from "@/hooks/use-bets";
import { useDashboardAdvancedPerformance } from "@/hooks/use-dashboard";
import { MultiSelect } from "@/components/MultiSelect";
import { PlayerCombobox } from "@/components/PlayerCombobox";
import { EmptyState } from "@/components/SlidingCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  PerformanceLineChart,
  seriesColor,
  type PerformanceSeries,
} from "@/components/dashboard/PerformanceLineChart";
import { CustomIndexBuilderDialog } from "@/components/dashboard/CustomIndexBuilderDialog";
import { BET_TYPE_OPTIONS, PROP_TYPE_OPTIONS } from "@/lib/bettingConstants";

/**
 * Ad-hoc slicing of the performance graph. Filters live in component state only —
 * nothing is persisted, so a reload starts clean. Save a slice you want to keep
 * as a Custom Index instead.
 */
export default function IndexAdvanced() {
  const { data: leagues } = useLeagues();

  const [leagueIds, setLeagueIds] = useState<string[]>([]);
  const [betTypes, setBetTypes] = useState<string[]>([]);
  const [propTypes, setPropTypes] = useState<string[]>([]);
  const [playerName, setPlayerName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  const { data, isLoading, error } = useDashboardAdvancedPerformance({
    leagueIds: leagueIds.map(Number),
    betTypes,
    propTypes,
    playerName,
    teamName,
  });

  // Player props are the only bet type a "player" filter applies to — once the
  // user narrows bet types to something that excludes player props, a player
  // filter can no longer match anything, so disable and clear it.
  const playerFilterEnabled = betTypes.length === 0 || betTypes.includes("player_prop");
  useEffect(() => {
    if (!playerFilterEnabled && playerName) setPlayerName("");
  }, [playerFilterEnabled, playerName]);

  const hasFilters =
    leagueIds.length > 0 || betTypes.length > 0 || propTypes.length > 0 || !!playerName || !!teamName;

  const reset = () => {
    setLeagueIds([]);
    setBetTypes([]);
    setPropTypes([]);
    setPlayerName("");
    setTeamName("");
  };

  const series: PerformanceSeries[] = [
    { key: "myWinRate", name: "You", color: seriesColor(0) },
    { key: "indexWinRate", name: "Index", color: seriesColor(0), dashed: true },
  ];

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <SlidersHorizontal className="w-7 h-7 text-accent" />
          Advanced Filters
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Slice your performance against the league however you like. Nothing here is saved —
          build a Custom Index to keep a slice around.
        </p>
      </div>

      <Card className="p-5 border-white/5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Leagues</Label>
            <MultiSelect
              testId="filter-leagues"
              placeholder="All my leagues"
              options={(leagues ?? []).map((l) => ({ value: String(l.id), label: l.name }))}
              selected={leagueIds}
              onChange={setLeagueIds}
              emptyMessage="You're not in any leagues yet."
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Bet Types</Label>
            <MultiSelect
              testId="filter-bet-types"
              placeholder="All bet types"
              options={BET_TYPE_OPTIONS}
              selected={betTypes}
              onChange={setBetTypes}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Prop Types</Label>
            <MultiSelect
              testId="filter-prop-types"
              placeholder="All prop types"
              options={PROP_TYPE_OPTIONS}
              selected={propTypes}
              onChange={setPropTypes}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-player" className="text-xs uppercase tracking-wide text-muted-foreground">
              Player
            </Label>
            <PlayerCombobox
              testId="filter-player"
              value={playerName}
              onChange={setPlayerName}
              disabled={!playerFilterEnabled}
              placeholder={playerFilterEnabled ? "Any player" : "Select Player Prop to filter by player"}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="filter-team" className="text-xs uppercase tracking-wide text-muted-foreground">
              Team
            </Label>
            <Input
              id="filter-team"
              data-testid="filter-team"
              placeholder="Any team (e.g. KC)"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              className="bg-background border-white/10"
            />
          </div>

          <div className="flex items-end gap-2">
            <Button
              variant="ghost"
              onClick={reset}
              disabled={!hasFilters}
              data-testid="button-reset-filters"
              className="text-muted-foreground"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset filters
            </Button>
            {hasFilters && (
              <Button
                onClick={() => setSaveDialogOpen(true)}
                data-testid="button-save-as-custom-index"
              >
                <Save className="w-4 h-4 mr-2" />
                Save as Custom Index
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-5 border-white/5">
        <h2 className="text-xl font-bold flex items-center gap-2 mb-5">
          <BarChart3 className="w-5 h-5 text-accent" />
          Performance Over Time
        </h2>

        {isLoading ? (
          <div className="flex items-center gap-2 py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <span className="text-muted-foreground text-sm">Loading performance…</span>
          </div>
        ) : error || !data ? (
          <EmptyState icon={BarChart3} message="Couldn't load performance data right now." />
        ) : data.points.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            message={
              hasFilters
                ? "No decided legs match these filters — try loosening them."
                : "No decided parlay legs yet — check back once some weeks are settled."
            }
          />
        ) : (
          <PerformanceLineChart points={data.points as any} series={series} height={340} />
        )}
      </Card>

      <CustomIndexBuilderDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        editing={null}
        initialValues={{
          leagueIds: leagueIds.map(Number),
          betTypes,
          propTypes,
          playerName,
          teamName,
        }}
      />
    </div>
  );
}
