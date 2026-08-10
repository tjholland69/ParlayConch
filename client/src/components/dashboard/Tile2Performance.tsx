import { useState } from "react";
import { BarChart3, Calendar as CalendarIcon, Check, ChevronDown, Loader2 } from "lucide-react";
import { SlidingCard, EmptyState } from "@/components/SlidingCard";
import { useLeagues } from "@/hooks/use-bets";
import { useDashboardPerformance, type DashboardDateRange } from "@/hooks/use-dashboard";
import { useCustomIndexes, useCustomIndexPerformances } from "@/hooks/use-custom-indexes";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
import {
  PerformanceLineChart,
  seriesColor,
  type PerformancePoint,
  type PerformanceSeries,
} from "@/components/dashboard/PerformanceLineChart";
import { PerformanceBarChart } from "@/components/dashboard/PerformanceBarChart";

const ALL_LEAGUES_VALUE = "all";
const DEFAULT_INDEX_ID = "default";
type DateRangeMode = "all" | "year" | "month" | "custom";

function LeagueFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: leagues } = useLeagues();

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-44 bg-background border-white/10 h-8 text-xs">
        <SelectValue placeholder="All My Leagues" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_LEAGUES_VALUE}>All My Leagues</SelectItem>
        {(leagues ?? []).map((league) => (
          <SelectItem key={league.id} value={String(league.id)}>
            {league.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Multi-select of comparison lines. "Default Index" is always offered. */
function CompareAgainstFilter({
  active,
  onToggle,
}: {
  active: string[];
  onToggle: (id: string) => void;
}) {
  const { data: indexes } = useCustomIndexes();
  const options = [
    { id: DEFAULT_INDEX_ID, label: "Default Index" },
    ...(indexes ?? []).map((idx) => ({ id: String(idx.id), label: idx.displayName })),
  ];

  const summary =
    active.length === 0
      ? "None"
      : active.length === 1
        ? options.find((o) => o.id === active[0])?.label ?? "1 selected"
        : `${active.length} selected`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-52 h-8 text-xs justify-between bg-background border-white/10 font-normal"
          data-testid="button-compare-against"
        >
          <span className="truncate">Compare: {summary}</span>
          <ChevronDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onToggle(option.id)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-white/5 text-left"
            data-testid={`option-compare-${option.id}`}
          >
            <span className="w-4 h-4 shrink-0 flex items-center justify-center">
              {active.includes(option.id) && <Check className="w-3.5 h-3.5 text-primary" />}
            </span>
            <span className="truncate">{option.label}</span>
          </button>
        ))}
        {(indexes ?? []).length === 0 && (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            Build a custom index to compare against more than the default.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function toISODate(d: Date): string {
  const tzOffsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}

/** All Time (default) / This Year / This Month / Custom — resolves to a concrete
 * startDate/endDate for the server; "All Time" sends no range at all. */
function DateRangeFilter({
  value,
  onChange,
}: {
  value: DashboardDateRange;
  onChange: (mode: DateRangeMode, range: DashboardDateRange) => void;
}) {
  const [mode, setMode] = useState<DateRangeMode>("all");
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const handleModeChange = (next: string) => {
    const m = next as DateRangeMode;
    setMode(m);
    if (m === "all") {
      onChange(m, {});
    } else if (m === "year") {
      const now = new Date();
      onChange(m, { startDate: toISODate(new Date(now.getFullYear(), 0, 1)), endDate: toISODate(now) });
    } else if (m === "month") {
      const now = new Date();
      onChange(m, { startDate: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: toISODate(now) });
    } else {
      setPopoverOpen(true);
      // Wait for explicit range selection before firing onChange.
    }
  };

  const applyCustomRange = (range: DateRange | undefined) => {
    setCustomRange(range);
    if (range?.from && range?.to) {
      onChange("custom", { startDate: toISODate(range.from), endDate: toISODate(range.to) });
      setPopoverOpen(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <Select value={mode} onValueChange={handleModeChange}>
        <SelectTrigger className="w-36 bg-background border-white/10 h-8 text-xs" data-testid="select-performance-date-range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Time</SelectItem>
          <SelectItem value="year">This Year</SelectItem>
          <SelectItem value="month">This Month</SelectItem>
          <SelectItem value="custom">Custom</SelectItem>
        </SelectContent>
      </Select>
      {mode === "custom" && (
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs bg-background border-white/10 font-normal"
              data-testid="button-custom-date-range"
            >
              <CalendarIcon className="w-3.5 h-3.5 mr-1.5" />
              {value.startDate && value.endDate ? `${value.startDate} – ${value.endDate}` : "Pick dates"}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0">
            <Calendar mode="range" selected={customRange} onSelect={applyCustomRange} numberOfMonths={2} defaultMonth={customRange?.from} />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

/** "cumulative" is the running win-rate line; "weekly" is that week's own win rate as bars. */
type PerformanceViewMode = "cumulative" | "weekly";

function PerformanceChartSlide({
  leagueFilter,
  activeIndexIds,
  dateRange,
  mode,
}: {
  leagueFilter: string;
  activeIndexIds: string[];
  dateRange: DashboardDateRange;
  mode: PerformanceViewMode;
}) {
  const leagueId = leagueFilter === ALL_LEAGUES_VALUE ? undefined : Number(leagueFilter);
  const { data, isLoading, error } = useDashboardPerformance(leagueId, dateRange);
  const { data: indexes } = useCustomIndexes();

  const activeCustom = (indexes ?? []).filter((idx) => activeIndexIds.includes(String(idx.id)));
  const defaultActive = activeIndexIds.includes(DEFAULT_INDEX_ID);
  const { byId: overlayPoints } = useCustomIndexPerformances(activeCustom.map((idx) => idx.id));

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground text-sm">Loading performance…</span>
      </div>
    );
  }

  if (error || !data) {
    return <EmptyState icon={BarChart3} message="Couldn't load performance data right now." />;
  }

  if (data.points.length === 0) {
    return <EmptyState icon={BarChart3} message="No decided parlay legs yet — check back once some weeks are settled." />;
  }

  // Week-over-week is a single bar per week — the combined win rate across every
  // decided leg in scope (you + everyone else), not a per-user/index comparison.
  if (mode === "weekly") {
    const points: PerformancePoint[] = data.points.map((p) => ({
      weekLabel: p.weekLabel,
      all: p.allWeekWinRate,
    }));
    const series: PerformanceSeries[] = [{ key: "all", name: "League Average", color: seriesColor(0) }];

    return (
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2 mb-5">
          <BarChart3 className="w-5 h-5 text-accent" />
          Week-over-Week Performance
        </h2>
        <PerformanceBarChart points={points} series={series} />
      </div>
    );
  }

  // Build the ordered list of active comparison scopes. Slot order is stable —
  // the default index always holds slot 0, and each custom index keeps its slot
  // as others are toggled, so colors never repaint on a filter change.
  type Scope = {
    id: string;
    name: string;
    points: {
      weekLabel: string;
      myWinRate: number | null;
      indexWinRate: number | null;
      myWeekWinRate: number | null;
      indexWeekWinRate: number | null;
    }[];
  };
  const scopes: Scope[] = [];
  if (defaultActive) {
    scopes.push({ id: DEFAULT_INDEX_ID, name: "Index", points: data.points });
  }
  for (const idx of activeCustom) {
    const points = overlayPoints[idx.id];
    if (points) {
      scopes.push({ id: String(idx.id), name: idx.displayName, points });
    }
  }

  // Merge every scope's series into one row per week label, preserving the
  // default series' week ordering and appending any weeks only an overlay has.
  const rowsByWeek = new Map<string, PerformancePoint>();
  const weekOrder: string[] = [];
  const ensureRow = (weekLabel: string): PerformancePoint => {
    let row = rowsByWeek.get(weekLabel);
    if (!row) {
      row = { weekLabel };
      rowsByWeek.set(weekLabel, row);
      weekOrder.push(weekLabel);
    }
    return row;
  };
  for (const label of data.points.map((p) => p.weekLabel)) ensureRow(label);

  const series: PerformanceSeries[] = [];
  const isSingleScope = scopes.length === 1;

  scopes.forEach((scope, slot) => {
    const color = seriesColor(slot);
    // Opposite side of the palette from "You" so the index line reads as a
    // distinct color, not just the same line dashed.
    const indexColor = seriesColor(slot + 4);
    const myKey = `my_${scope.id}`;
    const indexKey = `index_${scope.id}`;

    for (const point of scope.points) {
      const row = ensureRow(point.weekLabel);
      row[myKey] = point.myWinRate;
      row[indexKey] = point.indexWinRate;
    }

    // With a single scope the labels stay exactly as they read today.
    series.push({
      key: myKey,
      name: isSingleScope ? "You" : `You — ${scope.name}`,
      color,
    });
    series.push({
      key: indexKey,
      name: scope.name,
      color: indexColor,
      dashed: true,
    });
  });

  const points = weekOrder.map((label) => rowsByWeek.get(label)!);

  return (
    <div>
      <h2 className="text-xl font-bold flex items-center gap-2 mb-5">
        <BarChart3 className="w-5 h-5 text-accent" />
        Performance Over Time
      </h2>
      {series.length === 0 ? (
        <EmptyState icon={BarChart3} message="Pick at least one index to compare against." />
      ) : (
        <PerformanceLineChart points={points} series={series} />
      )}
    </div>
  );
}

export function Tile2Performance() {
  const [leagueFilter, setLeagueFilter] = useState(ALL_LEAGUES_VALUE);
  const [activeIndexIds, setActiveIndexIds] = useState<string[]>([DEFAULT_INDEX_ID]);
  const [dateRange, setDateRange] = useState<DashboardDateRange>({});

  const toggleIndex = (id: string) =>
    setActiveIndexIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <SlidingCard
      headerExtra={
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <LeagueFilter value={leagueFilter} onChange={setLeagueFilter} />
          <CompareAgainstFilter active={activeIndexIds} onToggle={toggleIndex} />
          <DateRangeFilter value={dateRange} onChange={(_mode, range) => setDateRange(range)} />
        </div>
      }
      slides={[
        {
          label: "Performance",
          content: (
            <PerformanceChartSlide
              leagueFilter={leagueFilter}
              activeIndexIds={activeIndexIds}
              dateRange={dateRange}
              mode="cumulative"
            />
          ),
        },
        {
          label: "Week-over-Week",
          content: (
            <PerformanceChartSlide
              leagueFilter={leagueFilter}
              activeIndexIds={activeIndexIds}
              dateRange={dateRange}
              mode="weekly"
            />
          ),
        },
      ]}
    />
  );
}
