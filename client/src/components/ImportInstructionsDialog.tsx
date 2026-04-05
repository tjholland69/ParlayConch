import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, Download, ChevronRight, Info, Sparkles } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue: () => void;
}

const FIELDS = [
  {
    column: "week_id",
    required: true,
    type: "number",
    description: "The numeric ID of the NFL week the parlay belongs to.",
    example: "1",
  },
  {
    column: "member_email",
    required: true,
    type: "email",
    description: "The email address of the league member whose parlay this belongs to.",
    example: "player@example.com",
  },
  {
    column: "home_team",
    required: true,
    type: "text",
    description: "The home team's name or short name (e.g. \"Chiefs\" or \"Kansas City Chiefs\"). Use this or game_id.",
    example: "Chiefs",
  },
  {
    column: "away_team",
    required: true,
    type: "text",
    description: "The away team's name or short name (e.g. \"Bills\" or \"Buffalo Bills\"). Use this or game_id.",
    example: "Bills",
  },
  {
    column: "pick",
    required: true,
    type: "text",
    description: "Which side the member picked: \"home\" or \"away\" for spread/moneyline, or \"over\"/\"under\" for totals.",
    example: "home",
  },
  {
    column: "bet_type",
    required: false,
    type: "text",
    description: "The type of bet. Accepts: spread, moneyline, over, under. Defaults to \"spread\" if omitted.",
    example: "spread",
  },
  {
    column: "line",
    required: false,
    type: "text",
    description: "The line or odds at the time the bet was placed. Leave blank — it will be auto-filled from game data.",
    example: "-3.5",
  },
  {
    column: "result",
    required: false,
    type: "text",
    description: "The outcome of the leg. Accepts: win, loss, push. Leave blank — it will be auto-calculated from game scores.",
    example: "win",
  },
  {
    column: "status",
    required: false,
    type: "text",
    description: "The overall parlay status. Accepts: pending, approved, rejected. Defaults to \"approved\" if omitted.",
    example: "approved",
  },
  {
    column: "game_id",
    required: false,
    type: "number",
    description: "Alternative to home_team + away_team. Use the internal game ID if you have it (advanced / power-user).",
    example: "101",
  },
  {
    column: "player_name",
    required: false,
    type: "text",
    description: "For player prop bets (bet_type = player_prop): the player's full name. Leave blank for game bets.",
    example: "Travis Kelce",
  },
  {
    column: "prop_type",
    required: false,
    type: "text",
    description: "For player prop bets: the prop category. Common values: rush_yards, rec_yards, pass_yards, pass_tds, receptions, anytime_td, first_td, interceptions, sacks, kicking_pts.",
    example: "rec_yards",
  },
];

const TEMPLATE_ROWS = [
  "1,player@example.com,Chiefs,Bills,spread,home,-3.5,win,approved,,",
  "1,player@example.com,Chiefs,Bills,moneyline,home,-155,win,approved,,",
  "2,other@example.com,Eagles,Cowboys,spread,away,+3,,pending,,",
  "3,fan@example.com,49ers,Seahawks,over,over,47.5,,approved,,",
  "4,player@example.com,,,player_prop,over,72.5,,approved,Travis Kelce,rec_yards",
  "4,player@example.com,,,player_prop,yes,,,approved,Patrick Mahomes,anytime_td",
];

export function ImportInstructionsDialog({ open, onOpenChange, onContinue }: Props) {
  const [dontShow, setDontShow] = useState(false);

  const downloadTemplate = () => {
    const header = "week_id,member_email,home_team,away_team,bet_type,pick,line,result,status,player_name,prop_type";
    const content = [header, ...TEMPLATE_ROWS].join("\n");
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "parlay_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleContinue = async () => {
    if (dontShow) {
      try {
        await fetch("/api/users/me/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skipImportInstructions: true }),
          credentials: "include",
        });
      } catch {
        // Silently ignore — preference is best-effort
      }
    }
    onOpenChange(false);
    onContinue();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            How to Backload Historical Data
          </DialogTitle>
          <DialogDescription>
            Use a CSV file to import historical parlay records for your league members. Each row in the CSV represents one leg of a parlay. Multiple legs for the same member and week are grouped automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Auto-enrichment callout */}
          <div className="flex items-start gap-3 rounded-xl bg-primary/10 border border-primary/20 px-4 py-3">
            <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-foreground mb-0.5">Results & odds auto-filled</p>
              <p className="text-muted-foreground leading-snug">
                You don't need to manually enter <code className="font-mono text-xs">line</code> or <code className="font-mono text-xs">result</code>. After import, the system automatically calculates win/loss from game scores and fills in approximate odds from the game record.
              </p>
            </div>
          </div>

          {/* Download template */}
          <Button
            variant="outline"
            onClick={downloadTemplate}
            className="w-full border-dashed"
            data-testid="button-download-template-instructions"
          >
            <Download className="w-4 h-4 mr-2" />
            Download CSV Template
          </Button>

          {/* Field reference */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Required & Optional Columns</p>
            </div>

            <div className="rounded-xl border border-white/10 overflow-hidden">
              <div className="grid grid-cols-[auto_auto_auto_1fr] text-xs font-semibold text-muted-foreground bg-white/5 px-4 py-2 gap-3 border-b border-white/5">
                <span>Column</span>
                <span>Type</span>
                <span>Required</span>
                <span>Description</span>
              </div>
              {FIELDS.map((f, i) => (
                <div
                  key={f.column}
                  className={`grid grid-cols-[auto_auto_auto_1fr] px-4 py-3 gap-3 text-sm border-b border-white/5 last:border-0 ${i % 2 === 0 ? "" : "bg-white/[0.02]"}`}
                  data-testid={`field-row-${f.column}`}
                >
                  <code className="font-mono text-primary text-xs self-start pt-0.5 whitespace-nowrap">{f.column}</code>
                  <span className="text-muted-foreground text-xs self-start pt-0.5 whitespace-nowrap">{f.type}</span>
                  <span className="self-start pt-0.5">
                    {f.required ? (
                      <Badge className="text-[10px] px-1 py-0 h-4 bg-primary/20 text-primary border-primary/30">Required</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-muted-foreground">Optional</Badge>
                    )}
                  </span>
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-muted-foreground leading-snug">{f.description}</p>
                    <p className="text-xs text-muted-foreground/60">
                      Example: <code className="font-mono">{f.example}</code>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tips */}
          <div className="rounded-xl bg-white/5 border border-white/5 p-4 space-y-1.5 text-sm text-muted-foreground">
            <p className="font-medium text-foreground text-xs uppercase tracking-wider mb-2">Tips</p>
            <p>• One row per parlay leg. Multiple legs for the same member + week are automatically combined into one parlay.</p>
            <p>• The member's email must match their Parlayconch account email exactly.</p>
            <p>• Use either team name shorthand ("Chiefs") or the full name ("Kansas City Chiefs") — both work.</p>
            <p>• <code className="font-mono text-xs">home_team</code> + <code className="font-mono text-xs">away_team</code> are matched to games in your league. If no match is found, a placeholder game is created.</p>
            <p>• Leave <code className="font-mono text-xs">result</code> and <code className="font-mono text-xs">line</code> blank — they'll be auto-filled from game data after import.</p>
            <p>• Leave <code className="font-mono text-xs">status</code> blank to import as "approved".</p>
            <p>• For player prop bets, set <code className="font-mono text-xs">bet_type</code> to <code className="font-mono text-xs">player_prop</code> and fill in <code className="font-mono text-xs">player_name</code> and <code className="font-mono text-xs">prop_type</code>. The game columns can be left blank for props.</p>
            <p>• Common <code className="font-mono text-xs">prop_type</code> values: <code className="font-mono text-xs">rush_yards</code>, <code className="font-mono text-xs">rec_yards</code>, <code className="font-mono text-xs">pass_yards</code>, <code className="font-mono text-xs">pass_tds</code>, <code className="font-mono text-xs">receptions</code>, <code className="font-mono text-xs">anytime_td</code>, <code className="font-mono text-xs">first_td</code>, <code className="font-mono text-xs">interceptions</code>, <code className="font-mono text-xs">sacks</code>.</p>
          </div>

          {/* Opt-out */}
          <div className="flex items-center gap-2.5">
            <Checkbox
              id="dont-show-again"
              checked={dontShow}
              onCheckedChange={(v) => setDontShow(Boolean(v))}
              data-testid="checkbox-dont-show-again"
            />
            <Label htmlFor="dont-show-again" className="text-sm text-muted-foreground cursor-pointer">
              Don't show this guide again — take me straight to the import screen next time
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleContinue} data-testid="button-continue-to-import">
            Continue to Import
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
