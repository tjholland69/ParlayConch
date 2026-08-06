import { useState, useEffect } from "react";
import { useLeagues, useWeeks } from "@/hooks/use-bets";
import {
  useStoryAnalytics,
  useStoryCandidates,
  useCreateStoryReport,
  useStoryReport,
  useGenerateSection,
  useSaveSection,
  exportStoryReportMarkdown,
} from "@/hooks/use-story-studio";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Newspaper, Loader2, Sparkles, Copy, Check, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { StoryCandidate, StorySectionKind } from "@shared/schema";

const TONES = [
  { value: "hype", label: "Hype" },
  { value: "analytical", label: "Analytical" },
  { value: "snarky", label: "Snarky" },
  { value: "straightforward", label: "Straightforward" },
];

const SECTION_LABELS: Record<StorySectionKind, string> = {
  headline: "Headline",
  opening: "Opening",
  winnerSummary: "Winner Summary",
  closing: "Closing",
};
const SECTION_ORDER: StorySectionKind[] = ["headline", "opening", "winnerSummary", "closing"];

function SectionEditor({
  kind,
  content,
  isGenerating,
  onGenerate,
  onSave,
}: {
  kind: StorySectionKind;
  content: string;
  isGenerating: boolean;
  onGenerate: () => void;
  onSave: (content: string) => void;
}) {
  const [draft, setDraft] = useState(content);
  useEffect(() => setDraft(content), [content]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{SECTION_LABELS[kind]}</label>
        <Button variant="ghost" size="sm" onClick={onGenerate} disabled={isGenerating} data-testid={`button-generate-${kind}`}>
          {isGenerating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
          {content ? "Regenerate" : "Generate"}
        </Button>
      </div>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== content) onSave(draft); }}
        placeholder={`Click "Generate" to draft the ${SECTION_LABELS[kind].toLowerCase()}...`}
        rows={kind === "headline" ? 1 : 4}
        data-testid={`textarea-section-${kind}`}
      />
    </div>
  );
}

export default function StoryStudio() {
  const { data: leagues } = useLeagues();
  const { data: weeks } = useWeeks();

  const [leagueId, setLeagueId] = useState<number | undefined>();
  const [year, setYear] = useState<number | undefined>();
  const [weekId, setWeekId] = useState<number | undefined>();
  const [selectedCandidate, setSelectedCandidate] = useState<StoryCandidate | null>(null);
  const [thesis, setThesis] = useState("");
  const [tone, setTone] = useState("straightforward");
  const [reportId, setReportId] = useState<number | undefined>();

  const activeWeek = weeks?.find((w) => w.isActive);
  const effectiveYear = year ?? activeWeek?.season;
  const years = Array.from(new Set((weeks ?? []).map((w) => w.season))).sort((a, b) => b - a);
  const weeksForYear = (weeks ?? []).filter((w) => w.season === effectiveYear);
  const effectiveWeekId = weekId ?? (effectiveYear === activeWeek?.season ? activeWeek?.id : undefined);

  const { data: analytics, isLoading: analyticsLoading } = useStoryAnalytics(leagueId, effectiveWeekId);
  const { data: candidates, isLoading: candidatesLoading } = useStoryCandidates(leagueId, effectiveWeekId);
  const createReport = useCreateStoryReport();
  const { data: report } = useStoryReport(reportId);
  const generateSection = useGenerateSection(reportId);
  const saveSection = useSaveSection(reportId);
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const step = !leagueId || !effectiveWeekId ? 1 : !reportId ? 2 : 3;

  async function handleStartReport() {
    if (!leagueId || !effectiveWeekId || !selectedCandidate || !thesis.trim()) return;
    const created = await createReport.mutateAsync({
      leagueId,
      weekId: effectiveWeekId,
      selectedStory: selectedCandidate,
      thesis: thesis.trim(),
      tone,
    });
    setReportId(created.id);
  }

  async function handleExport() {
    if (!reportId) return;
    const markdown = await exportStoryReportMarkdown(reportId);
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    toast({ title: "Copied to clipboard", description: "Markdown export copied." });
    setTimeout(() => setCopied(false), 2000);
  }

  const sectionByKind = new Map((report?.sections ?? []).map((s) => [s.kind as StorySectionKind, s]));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Newspaper className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight">Story Studio</h1>
          <p className="text-sm text-muted-foreground">Turn this week's data into a weekly recap your league will actually read.</p>
        </div>
      </div>

      {/* Step 1: League + Week */}
      <Card>
        <CardHeader className="font-bold text-sm text-muted-foreground uppercase tracking-wide">1. Choose League & Week</CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <Select value={leagueId?.toString()} onValueChange={(v) => { setLeagueId(Number(v)); setReportId(undefined); }}>
            <SelectTrigger className="w-56" data-testid="select-story-league">
              <SelectValue placeholder="Select a league" />
            </SelectTrigger>
            <SelectContent>
              {leagues?.map((l) => (
                <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={effectiveYear?.toString()}
            onValueChange={(v) => { setYear(Number(v)); setWeekId(undefined); setReportId(undefined); }}
          >
            <SelectTrigger className="w-32" data-testid="select-story-year">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={effectiveWeekId?.toString()} onValueChange={(v) => { setWeekId(Number(v)); setReportId(undefined); }}>
            <SelectTrigger className="w-56" data-testid="select-story-week">
              <SelectValue placeholder="Select a week" />
            </SelectTrigger>
            <SelectContent>
              {weeksForYear.map((w) => (
                <SelectItem key={w.id} value={w.id.toString()}>{w.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Step 2: Story candidates + thesis/tone */}
      {step >= 2 && (
        <Card>
          <CardHeader className="font-bold text-sm text-muted-foreground uppercase tracking-wide">2. Pick a Story Angle</CardHeader>
          <CardContent className="space-y-4">
            {(analyticsLoading || candidatesLoading) && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Crunching this week's numbers...
              </div>
            )}

            {!analyticsLoading && analytics && analytics.totalLegsDecided === 0 && (
              <p className="text-sm text-muted-foreground">No decided legs for this week yet — check back once results are in.</p>
            )}

            {candidates && candidates.length === 0 && analytics && analytics.totalLegsDecided > 0 && (
              <p className="text-sm text-muted-foreground">Nothing statistically unusual jumped out this week. Try another week, or write a custom thesis below.</p>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              {candidates?.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedCandidate(c); setThesis((t) => t || c.title); }}
                  className={`text-left p-4 rounded-xl border transition-all ${
                    selectedCandidate?.id === c.id
                      ? "border-primary bg-primary/10"
                      : "border-white/10 hover:border-white/20 hover:bg-white/5"
                  }`}
                  data-testid={`card-story-candidate-${c.id}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm">{c.title}</span>
                    <Badge variant="outline" className="text-xs">{c.confidence}% match</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{c.summary}</p>
                </button>
              ))}
            </div>

            {selectedCandidate && (
              <div className="space-y-3 pt-2">
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Your Thesis</label>
                  <Textarea
                    value={thesis}
                    onChange={(e) => setThesis(e.target.value)}
                    placeholder="What's the angle you want this report to drive home?"
                    className="mt-1"
                    data-testid="input-story-thesis"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Tone</label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger className="w-48 mt-1" data-testid="select-story-tone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TONES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleStartReport}
                  disabled={!thesis.trim() || createReport.isPending}
                  data-testid="button-start-report"
                >
                  {createReport.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  Start Drafting
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Sections */}
      {step === 3 && report && (
        <Card>
          <CardHeader className="font-bold text-sm text-muted-foreground uppercase tracking-wide flex items-center justify-between">
            <span>3. Draft & Edit Sections</span>
            <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-export-markdown">
              {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
              Copy Markdown
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            {SECTION_ORDER.map((kind) => (
              <SectionEditor
                key={kind}
                kind={kind}
                content={sectionByKind.get(kind)?.content ?? ""}
                isGenerating={generateSection.isPending}
                onGenerate={() => generateSection.mutate(kind)}
                onSave={(content) => saveSection.mutate({ kind, content })}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
