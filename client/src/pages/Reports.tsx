import { Suspense, lazy, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { useLeagues } from "@/hooks/use-bets";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BarChart3, Check, Copy, Download, FileText, Loader2, MessageSquareText } from "lucide-react";
import { PageLoader } from "@/components/PageLoader";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { EXPORT_FORMATS, type ExportFormat } from "@shared/dataExport";
import type { Report, ReportCatalogEntry, ReportId } from "@shared/reports";

const StoryStudio = lazy(() => import("@/pages/StoryStudio"));

const FORMAT_LABELS: Record<ExportFormat, string> = {
  csv: "CSV (spreadsheet)",
  json: "JSON",
  xml: "XML",
  md: "Markdown (.md)",
};

type Scope = "season" | "all";

function reportUrl(leagueId: number, reportId: ReportId, scope: Scope, format?: ExportFormat) {
  const params = new URLSearchParams();
  if (scope === "all") params.set("scope", "all");
  if (format) params.set("format", format);
  const qs = params.toString();
  return `/api/leagues/${leagueId}/reports/${reportId}${qs ? `?${qs}` : ""}`;
}

/**
 * The graphic view: one thin bar per row, its value printed at the end. One
 * measure and one series, so every bar is the same color and the card's
 * title says what's being measured.
 */
function ReportBars({ chart }: { chart: Report["chart"] }) {
  if (chart.bars.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nothing to chart yet.</p>;
  }
  return (
    <figure className="space-y-2" data-testid="chart-report">
      <figcaption className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{chart.title}</figcaption>
      <ul className="space-y-2">
        {chart.bars.map((bar) => (
          <li
            key={bar.label}
            className="grid grid-cols-[minmax(5rem,9rem)_1fr_3rem] items-center gap-3 text-sm"
            title={`${bar.label}: ${bar.display}`}
          >
            <span className="truncate text-foreground">{bar.label}</span>
            <span className="h-2.5 rounded-r bg-white/5">
              <span
                className="block h-full rounded-r bg-primary"
                style={{ width: `${Math.max(0, Math.min(100, (bar.value / (chart.max || 1)) * 100))}%` }}
              />
            </span>
            <span className="text-right font-mono tabular-nums text-foreground">{bar.display}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function ReportTable({ dataset }: { dataset: Report["dataset"] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-white/5">
      <table className="w-full text-sm" data-testid="table-report">
        <thead className="bg-muted/20 text-xs text-muted-foreground">
          <tr>
            {dataset.columns.map((c) => (
              <th key={c.key} title={c.description} className={cn("px-3 py-2 font-medium", c.type === "number" ? "text-right" : "text-left")}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataset.rows.map((row, i) => (
            <tr key={i} className="border-t border-white/5">
              {dataset.columns.map((c) => (
                <td key={c.key} className={cn("px-3 py-2", c.type === "number" && "text-right font-mono tabular-nums")}>
                  {row[c.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportView({ leagueId, entry }: { leagueId: number; entry: ReportCatalogEntry }) {
  const { toast } = useToast();
  const [view, setView] = useState<"graphic" | "text">("graphic");
  const [scope, setScope] = useState<Scope>("season");
  const [copied, setCopied] = useState(false);
  const hasScope = entry.id === "allocation";
  const effectiveScope = hasScope ? scope : "season";

  const { data: report, isLoading, error } = useQuery<Report>({
    queryKey: ["/api/leagues", leagueId, "reports", entry.id, effectiveScope],
    queryFn: async () => {
      const res = await fetch(reportUrl(leagueId, entry.id, effectiveScope), { credentials: "include" });
      if (!res.ok) throw new Error("Couldn't load this report");
      return res.json();
    },
  });

  const copyText = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Couldn't copy", description: "Your browser blocked clipboard access.", variant: "destructive" });
    }
  };

  return (
    <Card className="bg-card/50 border-white/5" data-testid={`card-report-${entry.id}`}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-lg">{entry.title}</CardTitle>
          <CardDescription>{entry.description}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {hasScope && (
            <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
              <SelectTrigger className="h-8 w-36 bg-background border-white/10 text-xs" data-testid="select-report-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="season">Current Year</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
          )}
          <div className="flex rounded-lg border border-white/10 p-0.5">
            <Button size="sm" variant={view === "graphic" ? "secondary" : "ghost"} className="h-7 gap-1.5 text-xs" onClick={() => setView("graphic")} data-testid="button-report-graphic">
              <BarChart3 className="h-3.5 w-3.5" />
              Graphic
            </Button>
            <Button size="sm" variant={view === "text" ? "secondary" : "ghost"} className="h-7 gap-1.5 text-xs" onClick={() => setView("text")} data-testid="button-report-text">
              <MessageSquareText className="h-3.5 w-3.5" />
              Text
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : error || !report ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Couldn't load this report. Try again in a moment.</p>
        ) : view === "graphic" ? (
          <>
            <ReportBars chart={report.chart} />
            <ReportTable dataset={report.dataset} />
          </>
        ) : (
          <pre className="whitespace-pre-wrap rounded-lg border border-white/5 bg-background/60 p-4 font-sans text-sm" data-testid="text-report-sms">
            {report.text}
          </pre>
        )}

        {/* Export actions sit at the bottom of the tile they export. */}
        {report && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-white/5 pt-3">
            <Button size="sm" variant="outline" className="gap-2" onClick={copyText} data-testid="button-report-copy-text">
              {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
              Copy as text
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-2" data-testid="button-report-download">
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {EXPORT_FORMATS.map((format) => (
                  <DropdownMenuItem key={format} asChild data-testid={`button-report-download-${format}`}>
                    <a href={reportUrl(leagueId, entry.id, effectiveScope, format)} download>
                      <FileText className="mr-2 h-4 w-4" />
                      {FORMAT_LABELS[format]}
                    </a>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CannedReports() {
  const { data: leagues, isLoading } = useLeagues();
  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [reportId, setReportId] = useState<ReportId>("standings_season");
  useEffect(() => {
    if (leagueId == null && leagues?.length) setLeagueId(leagues[0].id);
  }, [leagues, leagueId]);

  const { data: catalog } = useQuery<ReportCatalogEntry[]>({
    queryKey: ["/api/leagues", leagueId, "reports"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/reports`, { credentials: "include" });
      if (!res.ok) throw new Error("Couldn't load reports");
      return res.json();
    },
    enabled: leagueId != null,
  });

  if (isLoading) return <PageLoader />;
  if (!leagues?.length) {
    return <p className="py-12 text-center text-muted-foreground">Join or create a league to run reports on it.</p>;
  }
  const entry = catalog?.find((r) => r.id === reportId) ?? catalog?.[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={leagueId != null ? String(leagueId) : undefined} onValueChange={(v) => setLeagueId(Number(v))}>
          <SelectTrigger className="w-56 bg-background border-white/10" data-testid="select-report-league">
            <SelectValue placeholder="Choose a league" />
          </SelectTrigger>
          <SelectContent>
            {leagues.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <div className="space-y-2">
          {(catalog ?? []).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setReportId(r.id)}
              className={cn(
                "w-full rounded-xl border px-4 py-3 text-left transition-colors",
                entry?.id === r.id ? "border-primary/60 bg-primary/10" : "border-white/5 bg-card/40 hover:border-white/20",
              )}
              data-testid={`button-report-${r.id}`}
            >
              <p className="text-sm font-semibold">{r.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{r.description}</p>
            </button>
          ))}
        </div>
        {leagueId != null && entry && <ReportView key={`${leagueId}-${entry.id}`} leagueId={leagueId} entry={entry} />}
      </div>
    </div>
  );
}

/**
 * Reports: quick extracts of league data as a graphic or as text for the
 * group chat, each downloadable as CSV, JSON, XML or Markdown. Story Studio
 * (the AI-drafted weekly write-up) lives here too, as its own tab.
 */
export default function Reports() {
  const search = useSearch();
  const [location, navigate] = useLocation();
  const initial = location === "/story-studio" || new URLSearchParams(search).get("tab") === "story" ? "story" : "reports";
  const [tab, setTab] = useState(initial);

  return (
    <div className="mx-auto max-w-screen-xl space-y-6 pb-12">
      <div className="rounded-2xl border border-white/5 bg-card/30 p-6 backdrop-blur-sm">
        <h1 className="flex items-center gap-3 font-display text-3xl font-bold">
          <BarChart3 className="h-7 w-7 text-primary" />
          Reports
        </h1>
        <p className="mt-1 text-muted-foreground">Pull your league's numbers as a graphic, as text for the group chat, or as a file.</p>
      </div>
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v);
          navigate(v === "story" ? "/reports?tab=story" : "/reports", { replace: true });
        }}
        className="space-y-6"
      >
        <TabsList className="border border-white/5 bg-card/50">
          <TabsTrigger value="reports" data-testid="tab-reports">Reports</TabsTrigger>
          <TabsTrigger value="story" data-testid="tab-story-studio">Story Studio</TabsTrigger>
        </TabsList>
        <TabsContent value="reports"><CannedReports /></TabsContent>
        <TabsContent value="story">
          <Suspense fallback={<PageLoader />}><StoryStudio /></Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
