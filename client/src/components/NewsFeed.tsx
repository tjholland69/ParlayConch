import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExternalLink, Newspaper, ActivitySquare, Trophy } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface NewsItem {
  id: string;
  title: string;
  description: string;
  url: string;
  imageUrl?: string;
  publishedAt: string;
  tag?: string;
  team?: string;
  position?: string;
  conferences?: string[];
  divisions?: string[];
}

const NFL_DIVISIONS = [
  "AFC East", "AFC North", "AFC South", "AFC West",
  "NFC East", "NFC North", "NFC South", "NFC West",
];

const INJURY_TAG_COLORS: Record<string, string> = {
  Out: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  IR: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Doubtful: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "Day-To-Day": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  Questionable: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  Active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

const SCORE_TAG_COLORS: Record<string, string> = {
  Final: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  "In Progress": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Halftime: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Upcoming: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

function LoadingSkeletons() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}

function useNewsFeed(feed: "headlines" | "injuries" | "scores") {
  return useQuery<NewsItem[]>({
    queryKey: ["/api/news", feed],
    queryFn: async () => {
      const res = await fetch(`/api/news?feed=${feed}&limit=16`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

function NewsItemsView({
  items,
  isLoading,
  isError,
  tagColors,
  emptyMessage = "No data available right now.",
}: {
  items: NewsItem[] | undefined;
  isLoading: boolean;
  isError: boolean;
  tagColors: Record<string, string>;
  emptyMessage?: string;
}) {
  if (isLoading) return <LoadingSkeletons />;
  if (isError || !items?.length) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {items.slice(0, 14).map((item) => {
        const tagClass =
          item.tag ? (tagColors[item.tag] ?? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300") : "";
        const isLinked = !!item.url;
        const Inner = (
          <div className="flex gap-3 p-3 rounded-lg hover-elevate transition-colors">
            {item.imageUrl && (
              <img
                src={item.imageUrl}
                alt=""
                className="w-14 h-14 object-cover rounded-md flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-1 flex-wrap">
                {item.tag && (
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${tagClass}`}
                  >
                    {item.tag}
                  </span>
                )}
                <h4 className="font-medium text-sm leading-tight line-clamp-2 flex items-start gap-1">
                  {item.title}
                  {isLinked && <ExternalLink className="w-3 h-3 flex-shrink-0 text-muted-foreground mt-0.5" />}
                </h4>
              </div>
              {item.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">
                {formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true })}
              </p>
            </div>
          </div>
        );

        return isLinked ? (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
            data-testid={`news-item-${item.id}`}
          >
            {Inner}
          </a>
        ) : (
          <div key={item.id} data-testid={`news-item-${item.id}`}>
            {Inner}
          </div>
        );
      })}
    </div>
  );
}

function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 mb-3">{children}</div>;
}

function InjuriesPanel() {
  const { data: items, isLoading, isError } = useNewsFeed("injuries");
  const [position, setPosition] = useState("all");
  const [team, setTeam] = useState("all");

  const positions = [...new Set((items ?? []).map(i => i.position).filter((p): p is string => !!p))].sort();
  const teams = [...new Set((items ?? []).map(i => i.team).filter((t): t is string => !!t))].sort();

  const filtered = (items ?? []).filter(i =>
    (position === "all" || i.position === position) &&
    (team === "all" || i.team === team)
  );

  return (
    <div>
      <FilterBar>
        <Select value={position} onValueChange={setPosition}>
          <SelectTrigger className="h-8 w-32 text-xs" data-testid="select-injury-position">
            <SelectValue placeholder="Position" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Positions</SelectItem>
            {positions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={team} onValueChange={setTeam}>
          <SelectTrigger className="h-8 w-40 text-xs" data-testid="select-injury-team">
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Teams</SelectItem>
            {teams.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterBar>
      <NewsItemsView
        items={filtered}
        isLoading={isLoading}
        isError={isError}
        tagColors={INJURY_TAG_COLORS}
        emptyMessage={items?.length ? "No injuries match those filters." : "No data available right now."}
      />
    </div>
  );
}

function ScoresPanel() {
  const { data: items, isLoading, isError } = useNewsFeed("scores");
  const [conference, setConference] = useState("all");
  const [division, setDivision] = useState("all");

  const filtered = (items ?? []).filter(i =>
    (conference === "all" || (i.conferences ?? []).includes(conference)) &&
    (division === "all" || (i.divisions ?? []).includes(division))
  );

  return (
    <div>
      <FilterBar>
        <Select value={conference} onValueChange={setConference}>
          <SelectTrigger className="h-8 w-32 text-xs" data-testid="select-score-conference">
            <SelectValue placeholder="Conference" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Conferences</SelectItem>
            <SelectItem value="AFC">AFC</SelectItem>
            <SelectItem value="NFC">NFC</SelectItem>
          </SelectContent>
        </Select>
        <Select value={division} onValueChange={setDivision}>
          <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-score-division">
            <SelectValue placeholder="Division" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Divisions</SelectItem>
            {NFL_DIVISIONS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterBar>
      <NewsItemsView
        items={filtered}
        isLoading={isLoading}
        isError={isError}
        tagColors={SCORE_TAG_COLORS}
        emptyMessage={items?.length ? "No games match those filters." : "No data available right now."}
      />
    </div>
  );
}

function HeadlinesPanel() {
  const { data: items, isLoading, isError } = useNewsFeed("headlines");
  return <NewsItemsView items={items} isLoading={isLoading} isError={isError} tagColors={{}} />;
}

export function NewsFeed() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Newspaper className="w-5 h-5 text-blue-500" />
          NFL News & Data
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs defaultValue="injuries">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="injuries" className="flex-1 gap-1.5 text-xs">
              <ActivitySquare className="w-3.5 h-3.5" />
              Injuries
            </TabsTrigger>
            <TabsTrigger value="scores" className="flex-1 gap-1.5 text-xs">
              <Trophy className="w-3.5 h-3.5" />
              Scores
            </TabsTrigger>
            <TabsTrigger value="headlines" className="flex-1 gap-1.5 text-xs">
              <Newspaper className="w-3.5 h-3.5" />
              Headlines
            </TabsTrigger>
          </TabsList>

          <TabsContent value="injuries">
            <InjuriesPanel />
          </TabsContent>

          <TabsContent value="scores">
            <ScoresPanel />
          </TabsContent>

          <TabsContent value="headlines">
            <HeadlinesPanel />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
