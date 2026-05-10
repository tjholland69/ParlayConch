import { useState, useRef, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Papa from "papaparse";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLeagueMembersWithUsers } from "@/hooks/use-bets";
import { Upload, FileSpreadsheet, Download, AlertCircle, Check, Sparkles, ClipboardPaste, History, Trash2, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Upload, FileSpreadsheet, Download, AlertCircle, Check, Sparkles, Camera } from "lucide-react";
import { Link } from "wouter";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leagueId: number;
  onNavigate?: () => void;
}

interface CSVLeg {
  gameId?: number;
  homeTeam?: string;
  awayTeam?: string;
  betType: string;
  odds?: string;
  gameSegment?: string;
  pick: string;
  line?: string;
  result?: string;
  playerName?: string;
  propType?: string;
  notes?: string;
}

interface CSVRecord {
  weekNumber: number;
  year: number;
  memberEmail: string;
  status: string;
  legs: CSVLeg[];
}

interface ParsedRow {
  record: CSVRecord;
  warnings: string[];
  isDuplicate: boolean;
  memberName?: string;
  emailFound: boolean;
}

// Maps common column name variants to our canonical names
const COLUMN_ALIASES: Record<string, string> = {
  week: "week_id", week_number: "week_id", nfl_week: "week_id", wk: "week_id",
  season: "year", season_year: "year",
  email: "member_email", user_email: "member_email", player_email: "member_email",
  home: "home_team", team1: "home_team",
  away: "away_team", team2: "away_team",
  type: "bet_type", wager_type: "bet_type",
  selection: "pick", team_picked: "pick",
  spread: "line", total: "line", point_spread: "line",
  price: "odds", american_odds: "odds", moneyline_odds: "odds",
  outcome: "result", win_loss: "result",
  player: "player_name", athlete: "player_name",
  prop: "prop_type", stat_type: "prop_type",
  segment: "game_segment", half: "game_segment", quarter: "game_segment", period: "game_segment",
  comment: "notes", note: "notes",
};

function normalizeHeader(h: string): string {
  const key = h.trim().toLowerCase().replace(/[\s\-/]+/g, "_");
  return COLUMN_ALIASES[key] ?? key;
}

// Returns the current NFL season year (NFL seasons start in September)
function currentNflSeason(): number {
  const now = new Date();
  return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_ROWS = 500;

export function ImportHistoryModal({ open, onOpenChange, leagueId }: Props) {
export function ImportHistoryModal({ open, onOpenChange, leagueId, onNavigate }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [activeTab, setActiveTab] = useState<"import" | "history">("import");
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null);

  const { data: members } = useLeagueMembersWithUsers(leagueId);

  const { data: importHistory, refetch: refetchHistory } = useQuery({
    queryKey: ["/api/leagues", leagueId, "imports"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/imports`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch import history");
      return res.json() as Promise<{ id: number; originalFilename: string; recordCount: number; uploadedAt: string }[]>;
    },
    enabled: open,
  });

  const memberEmailSet = new Set(
    (members ?? []).map(m => m.user?.email?.toLowerCase()).filter((e): e is string => !!e)
  );
  const memberNameByEmail = new Map(
    (members ?? []).map(m => [
      m.user?.email?.toLowerCase() ?? "",
      m.user?.firstName ?? m.user?.email ?? "Unknown",
    ])
  );

  const importMutation = useMutation({
    mutationFn: async (data: { filename: string; records: CSVRecord[] }) => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/import`, data);
      return res.json();
    },
    onSuccess: (data: any) => {
      const skipped = data.skipped ? ` (${data.skipped} skipped)` : "";
      toast({
        title: "Import Successful",
        description: `${data.message}${skipped}. Results & odds are being auto-filled in the background.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "parlays"] });
      refetchHistory();
      resetImport();
    },
    onError: (err: Error) => {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async (batchId: number) => {
      const res = await fetch(`/api/leagues/${leagueId}/imports/${batchId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Import rolled back", description: "All parlays from that batch have been removed." });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "parlays"] });
      refetchHistory();
      setRollbackTarget(null);
    },
    onError: (err: Error) => {
      toast({ title: "Rollback Failed", description: err.message, variant: "destructive" });
      setRollbackTarget(null);
    },
  });

  function resetImport() {
    setParsedRows([]);
    setParseError(null);
    setFileName("");
    setPasteText("");
    setShowPaste(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const parseCSV = useCallback((content: string, existingEmailSet: Set<string>): ParsedRow[] => {
    const result = Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      transformHeader: normalizeHeader,
    });

    if (result.errors.length > 0) {
      throw new Error(`CSV parse error: ${result.errors[0].message}`);
    }

    const rows = result.data as any[];
    if (rows.length === 0) throw new Error("CSV must have at least one data row");
    if (rows.length > MAX_ROWS) {
      throw new Error(`CSV has ${rows.length} rows — maximum is ${MAX_ROWS}. Split into multiple files.`);
    }

    const firstRow = rows[0];
    const missingBase = ["week_id", "year", "member_email"].filter(f => !(f in firstRow));
    if (missingBase.length > 0) {
      const found = Object.keys(firstRow).join(", ");
      throw new Error(`Missing required columns: ${missingBase.join(", ")}.\nColumns found: ${found}`);
    }

    const recordMap = new Map<string, { record: CSVRecord; rowWarnings: string[] }>();
    const seenKeys = new Map<string, number>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-based + header row

      const rawYear = row.year?.trim();
      const weekNumber = parseInt(row.week_id);
      const year = rawYear ? parseInt(rawYear) : currentNflSeason();
      const email = row.member_email?.trim().toLowerCase();
      const status = row.status?.trim() || "approved";
      const pick = row.pick?.trim();

      if (!weekNumber || !email) continue;

      const key = `${year}-${weekNumber}-${email}`;
      const rowWarnings: string[] = [];

      if (!rawYear) rowWarnings.push(`Row ${rowNum}: year defaulted to ${year} (current NFL season)`);

      if (status === "void" || status === "missed") {
        if (!recordMap.has(key)) {
          recordMap.set(key, { record: { weekNumber, year, memberEmail: email, status: "void", legs: [] }, rowWarnings });
        }
        continue;
      }

      if (!pick) { continue; }

      const betType = row.bet_type?.trim() || "spread";
      const isPlayerProp = betType === "player_prop";
      const hasGameId = "game_id" in firstRow;
      const hasTeamNames = "home_team" in firstRow && "away_team" in firstRow;
      const propLine = row.prop_line?.trim() || undefined;
      const line = isPlayerProp ? (propLine || row.line?.trim() || undefined) : (row.line?.trim() || undefined);

      const leg: CSVLeg = {
        betType,
        pick,
        line,
        odds: row.odds?.trim() || undefined,
        gameSegment: row.game_segment?.trim() || undefined,
        result: row.result?.trim() || undefined,
      };

      if (row.player_name?.trim()) leg.playerName = row.player_name.trim();
      if (row.prop_type?.trim()) leg.propType = row.prop_type.trim();
      if (row.notes?.trim()) leg.notes = row.notes.trim();

      if (hasGameId && row.game_id) {
        const gameId = parseInt(row.game_id);
        if (!isNaN(gameId)) leg.gameId = gameId;
      }
      if (hasTeamNames && row.home_team && row.away_team) {
        leg.homeTeam = row.home_team.trim();
        leg.awayTeam = row.away_team.trim();
      }

      if (!leg.gameId && !leg.homeTeam && !isPlayerProp) continue;

      if (!recordMap.has(key)) {
        recordMap.set(key, { record: { weekNumber, year, memberEmail: email, status, legs: [] }, rowWarnings });
        seenKeys.set(key, rowNum);
      }
      recordMap.get(key)!.record.legs.push(leg);
    }

    // Build ParsedRow array with per-record metadata
    const parsedRows: ParsedRow[] = [];
    const seenInBatch = new Set<string>();

    for (const [key, { record, rowWarnings }] of Array.from(recordMap.entries())) {
      const emailFound = existingEmailSet.has(record.memberEmail);
      const isDuplicate = seenInBatch.has(key);
      seenInBatch.add(key);

      const warnings = [...rowWarnings];
      if (!emailFound) warnings.push(`Email "${record.memberEmail}" not found in this league — will be skipped on import`);

      parsedRows.push({
        record,
        warnings,
        isDuplicate,
        emailFound,
        memberName: memberNameByEmail.get(record.memberEmail),
      });
    }

    return parsedRows;
  }, [memberNameByEmail]);

  function processContent(content: string, name: string) {
    setParseError(null);
    setParsedRows([]);
    try {
      const rows = parseCSV(content, memberEmailSet);
      setParsedRows(rows);
      setFileName(name);
    } catch (err: any) {
      setParseError(err.message);
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setParseError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 5 MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => processContent(event.target?.result as string, file.name);
    reader.readAsText(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv")) { setParseError("Only .csv files are supported."); return; }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setParseError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 5 MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => processContent(event.target?.result as string, file.name);
    reader.readAsText(file);
  }, [memberEmailSet]);

  const handlePasteParse = () => {
    if (!pasteText.trim()) return;
    processContent(pasteText.trim(), "pasted-data.csv");
  };

  const downloadTemplate = () => {
    const template = `week_id,year,member_email,home_team,away_team,bet_type,pick,line,odds,game_segment,result,status,player_name,prop_type,prop_line,notes
1,2024,player@example.com,Chiefs,Bills,spread,home,-3.5,-110,,win,approved,,,,
1,2024,player@example.com,Chiefs,Bills,moneyline,home,,-155,,win,approved,,,,"Great value"
1,2024,player@example.com,Chiefs,Bills,over,over,24.5,-110,First Half,win,approved,,,,"Both teams scored on opening drives"
2,2024,other@example.com,Eagles,Cowboys,spread,away,+3,,,pending,,,,
3,2023,fan@example.com,,,,,,,,void
4,2024,player@example.com,,,player_prop,over,,-115,,approved,Travis Kelce,rec_yards,72.5,
4,2024,player@example.com,,,player_prop,yes,,,,approved,Patrick Mahomes,anytime_td,,`;
    const blob = new Blob([template], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "parlay_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const validRows = parsedRows.filter(r => r.emailFound);
  const skippedRows = parsedRows.filter(r => !r.emailFound);
  const warningRows = parsedRows.filter(r => r.emailFound && r.warnings.length > 0);
  const totalLegs = validRows.reduce((sum, r) => sum + r.record.legs.length, 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetImport(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            Import Historical Data
          </DialogTitle>
          <DialogDescription>
            Upload a CSV to backload historical parlay data. Results and odds are auto-filled after import.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "import" | "history")}>
          <TabsList className="w-full">
            <TabsTrigger value="import" className="flex-1">Import</TabsTrigger>
            <TabsTrigger value="history" className="flex-1">
              <History className="w-3.5 h-3.5 mr-1.5" />
              History {importHistory && importHistory.length > 0 && `(${importHistory.length})`}
            </TabsTrigger>
          </TabsList>

          {/* ── IMPORT TAB ── */}
          <TabsContent value="import" className="space-y-4 pt-4">
            <Button variant="outline" onClick={downloadTemplate} className="w-full" data-testid="button-download-template">
              <Download className="w-4 h-4 mr-2" />
              Download CSV Template
            </Button>

            {/* Toggle: File upload vs paste */}
            <div className="flex gap-2">
              <Button
                variant={!showPaste ? "secondary" : "ghost"}
                size="sm"
                onClick={() => { setShowPaste(false); resetImport(); }}
                className="flex-1"
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                Upload file
              </Button>
              <Button
                variant={showPaste ? "secondary" : "ghost"}
                size="sm"
                onClick={() => { setShowPaste(true); resetImport(); }}
                className="flex-1"
              >
                <ClipboardPaste className="w-3.5 h-3.5 mr-1.5" />
                Paste CSV
              </Button>
            </div>

            {!showPaste ? (
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragging ? "border-primary bg-primary/5" : "border-muted hover:border-primary/50"
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileSelect}
                  data-testid="input-csv-file"
                />
                <Upload className={`w-8 h-8 mx-auto mb-2 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                <p className="text-sm text-muted-foreground">
                  {fileName
                    ? <span className="text-foreground font-medium">{fileName}</span>
                    : isDragging
                    ? <span className="text-primary font-medium">Drop CSV here</span>
                    : "Drag & drop a CSV file, or click to browse"}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">Max 500 rows · 5 MB</p>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  className="w-full h-36 bg-muted/30 border border-border rounded-lg p-3 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
                  placeholder="Paste CSV content here (including header row)…"
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  data-testid="input-paste-csv"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePasteParse}
                  disabled={!pasteText.trim()}
                  className="w-full"
                >
                  Parse
                </Button>
              </div>
            )}

            {parseError && (
              <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-lg text-destructive text-sm whitespace-pre-wrap">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {parseError}
              </div>
            )}

            {parsedRows.length > 0 && (
              <div className="space-y-3">
                {/* Summary bar */}
                <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      <span className="font-medium text-sm">Preview</span>
                    </div>
                    <div className="flex gap-3 text-sm text-muted-foreground">
                      <span>{validRows.filter(r => r.record.status !== "void").length} parlays</span>
                      <span>·</span>
                      <span>{totalLegs} legs</span>
                      {skippedRows.length > 0 && (
                        <>
                          <span>·</span>
                          <span className="text-destructive">{skippedRows.length} will skip</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Per-record table */}
                  <div className="rounded-md border border-white/10 overflow-hidden mt-1">
                    <div className="max-h-48 overflow-y-auto">
                      {parsedRows.map((row, i) => {
                        const isVoid = row.record.status === "void";
                        return (
                          <div
                            key={i}
                            className={`flex items-start gap-2.5 px-3 py-2 text-xs border-b border-white/5 last:border-0 ${
                              !row.emailFound ? "bg-destructive/5" : i % 2 === 0 ? "" : "bg-white/[0.02]"
                            }`}
                          >
                            {/* Status icon */}
                            <span className="mt-0.5 flex-shrink-0">
                              {!row.emailFound
                                ? <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                                : row.warnings.length > 0
                                ? <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
                                : <Check className="w-3.5 h-3.5 text-green-500" />}
                            </span>
                            {/* Identity */}
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-foreground">
                                {row.memberName ?? row.record.memberEmail}
                              </span>
                              {row.memberName && row.memberName !== row.record.memberEmail && (
                                <span className="text-muted-foreground/60 ml-1">({row.record.memberEmail})</span>
                              )}
                              <span className="text-muted-foreground ml-2">
                                Week {row.record.weekNumber} · {row.record.year}
                              </span>
                              {isVoid
                                ? <Badge variant="outline" className="ml-2 text-[9px] px-1 py-0 h-3.5">VOID</Badge>
                                : <span className="text-muted-foreground/60 ml-2">{row.record.legs.length} leg{row.record.legs.length !== 1 ? "s" : ""}</span>}
                              {/* Inline warnings */}
                              {row.warnings.filter(w => !w.includes("not found")).map((w, wi) => (
                                <p key={wi} className="text-yellow-500/80 mt-0.5">{w}</p>
                              ))}
                              {!row.emailFound && (
                                <p className="text-destructive/80 mt-0.5">Email not found in league — will be skipped</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-start gap-2 p-2 bg-primary/10 rounded text-xs text-primary">
                    <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span>After import, results and approximate odds will be auto-filled from game data where available.</span>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => { resetImport(); onOpenChange(false); }}>Cancel</Button>
              <Button
                onClick={() => importMutation.mutate({ filename: fileName, records: validRows.map(r => r.record) })}
                disabled={validRows.length === 0 || importMutation.isPending}
                data-testid="button-import-data"
              >
                {importMutation.isPending
                  ? "Importing…"
                  : `Import ${validRows.length} Record${validRows.length !== 1 ? "s" : ""}`}
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* ── HISTORY TAB ── */}
          <TabsContent value="history" className="pt-4 space-y-3">
            {!importHistory || importHistory.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                No imports yet for this league.
              </div>
            ) : (
              importHistory.map((batch) => (
                <div
                  key={batch.id}
                  className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3"
                >
                  <FileSpreadsheet className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{batch.originalFilename}</p>
                    <p className="text-xs text-muted-foreground">
                      {batch.recordCount} records · {formatDistanceToNow(new Date(batch.uploadedAt), { addSuffix: true })}
                    </p>
                  </div>
                  {rollbackTarget === batch.id ? (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-destructive font-medium">Delete all {batch.recordCount} records?</span>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => rollbackMutation.mutate(batch.id)}
                        disabled={rollbackMutation.isPending}
                        className="h-7 px-2 text-xs"
                      >
                        {rollbackMutation.isPending ? "Deleting…" : "Confirm"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRollbackTarget(null)}
                        className="h-7 px-2 text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRollbackTarget(batch.id)}
                      className="h-7 px-2 text-muted-foreground hover:text-destructive flex-shrink-0"
                      title="Roll back this import"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}