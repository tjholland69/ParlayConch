import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Papa from "papaparse";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Upload, FileSpreadsheet, Download, AlertCircle, Check, Sparkles } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leagueId: number;
}

interface CSVLeg {
  gameId?: number;
  homeTeam?: string;
  awayTeam?: string;
  betType: string;
  pick: string;
  line?: string;
  result?: string;
}

interface CSVRecord {
  weekId: number;
  memberEmail: string;
  status: string;
  legs: CSVLeg[];
}

export function ImportHistoryModal({ open, onOpenChange, leagueId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedRecords, setParsedRecords] = useState<CSVRecord[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");

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
      onOpenChange(false);
      setParsedRecords([]);
      setFileName("");
    },
    onError: (err: Error) => {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    },
  });

  const parseCSV = (content: string): CSVRecord[] => {
    const result = Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
    });

    if (result.errors.length > 0) {
      throw new Error(`CSV parse error: ${result.errors[0].message}`);
    }

    const rows = result.data as any[];
    if (rows.length === 0) {
      throw new Error("CSV must have at least one data row");
    }

    const firstRow = rows[0];
    const hasGameId = "game_id" in firstRow;
    const hasTeamNames = "home_team" in firstRow && "away_team" in firstRow;

    if (!hasGameId && !hasTeamNames) {
      throw new Error(
        "CSV must include either 'game_id' or both 'home_team' + 'away_team' columns to identify each game."
      );
    }

    const requiredBase = ["week_id", "member_email", "pick"];
    const missingBase = requiredBase.filter(f => !(f in firstRow));
    if (missingBase.length > 0) {
      throw new Error(`CSV is missing required columns: ${missingBase.join(", ")}`);
    }

    const recordMap = new Map<string, CSVRecord>();

    for (const row of rows) {
      const weekId = parseInt(row.week_id);
      const email = row.member_email?.trim();
      const pick = row.pick?.trim();
      const betType = row.bet_type?.trim() || "spread";
      const status = row.status?.trim() || "approved";
      const line = row.line?.trim() || undefined;
      const legResult = row.result?.trim() || undefined;

      if (!weekId || !email || !pick) continue;

      const leg: CSVLeg = { betType, pick, line, result: legResult };

      if (hasGameId && row.game_id) {
        const gameId = parseInt(row.game_id);
        if (!isNaN(gameId)) leg.gameId = gameId;
      }

      if (hasTeamNames && row.home_team && row.away_team) {
        leg.homeTeam = row.home_team.trim();
        leg.awayTeam = row.away_team.trim();
      }

      if (!leg.gameId && !leg.homeTeam) continue;

      const key = `${weekId}-${email}`;
      if (!recordMap.has(key)) {
        recordMap.set(key, { weekId, memberEmail: email, status, legs: [] });
      }
      recordMap.get(key)!.legs.push(leg);
    }

    return Array.from(recordMap.values());
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParseError(null);
    setParsedRecords([]);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const records = parseCSV(content);
        setParsedRecords(records);
      } catch (err: any) {
        setParseError(err.message);
      }
    };
    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const template = `week_id,member_email,home_team,away_team,bet_type,pick,line,result,status
1,player@example.com,Chiefs,Bills,spread,home,-3.5,win,approved
1,player@example.com,Chiefs,Bills,moneyline,home,-155,win,approved
2,other@example.com,Eagles,Cowboys,spread,away,+3,,pending`;
    const blob = new Blob([template], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "parlay_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            Import Historical Data
          </DialogTitle>
          <DialogDescription>
            Upload a CSV file to import historical betting data for your league. Results and odds are auto-filled from game data after import.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Button variant="outline" onClick={downloadTemplate} className="w-full" data-testid="button-download-template">
            <Download className="w-4 h-4 mr-2" />
            Download CSV Template
          </Button>

          <div 
            className="border-2 border-dashed border-muted rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileSelect}
              data-testid="input-csv-file"
            />
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {fileName || "Click to select CSV file"}
            </p>
          </div>

          {parseError && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-lg text-destructive text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {parseError}
            </div>
          )}

          {parsedRecords.length > 0 && (
            <div className="bg-muted/30 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Check className="w-4 h-4 text-green-500" />
                <span className="font-medium">Ready to import</span>
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>{parsedRecords.length} parlays found</p>
                <p>{parsedRecords.reduce((sum, r) => sum + r.legs.length, 0)} total legs</p>
              </div>
              <div className="flex items-start gap-2 mt-2 p-2 bg-primary/10 rounded text-xs text-primary">
                <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>After import, results and approximate odds will be auto-filled from game data where available.</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button 
            onClick={() => importMutation.mutate({ filename: fileName, records: parsedRecords })}
            disabled={parsedRecords.length === 0 || importMutation.isPending}
            data-testid="button-import-data"
          >
            {importMutation.isPending ? "Importing..." : "Import Data"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
