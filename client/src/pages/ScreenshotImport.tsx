import { useState, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLeagues, useLeagueMembersWithUsers, useWeeks } from "@/hooks/use-bets";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getDisplayName } from "@/lib/displayName";
import {
  Upload,
  Image,
  X,
  ChevronDown,
  ChevronRight,
  Check,
  AlertCircle,
  Info,
  Loader2,
  Sparkles,
  ArrowLeft,
  Camera,
  FileImage,
  Eye,
  Edit3,
} from "lucide-react";
import { Link } from "wouter";
import { resultColor } from "@/lib/parlayStatusStyles";

interface ParsedLeg {
  betType: string;
  homeTeam: string | null;
  awayTeam: string | null;
  pick: string;
  line: string | null;
  odds: string | null;
  playerName: string | null;
  propType: string | null;
  result: string | null;
}

interface ParsedTicket {
  id: string;
  filename: string;
  imageUrl: string;
  sportsbook: string | null;
  legs: ParsedLeg[];
  totalOdds: string | null;
  extractionNotes: string | null;
  parseError: string | null;
}

interface ReviewTicket extends ParsedTicket {
  memberEmail: string;
  weekNumber: string;
  year: string;
  expanded: boolean;
  legs: ParsedLeg[];
}

type Step = "upload" | "processing" | "review" | "done";

const BET_TYPE_LABELS: Record<string, string> = {
  spread: "Spread",
  moneyline: "Moneyline",
  over: "Over",
  under: "Under",
  player_prop: "Prop",
};

function ticketStatus(t: ReviewTicket): "valid" | "needs-info" | "error" {
  if (t.parseError) return "error";
  if (!t.memberEmail || !t.weekNumber || !t.year) return "needs-info";
  if (t.legs.length === 0) return "needs-info";
  return "valid";
}

function LegRow({
  leg,
  index,
  onChange,
}: {
  leg: ParsedLeg;
  index: number;
  onChange: (index: number, updated: ParsedLeg) => void;
}) {
  const [editing, setEditing] = useState(false);

  const label =
    leg.betType === "player_prop"
      ? `${leg.playerName ?? "Player"} — ${leg.propType ?? "prop"}`
      : `${leg.homeTeam ?? "?"} vs ${leg.awayTeam ?? "?"} — ${
          BET_TYPE_LABELS[leg.betType] ?? leg.betType
        } ${leg.pick}${leg.line ? ` ${leg.line}` : ""}`;

  if (!editing) {
    return (
      <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/5 group">
        <div className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0 mt-0.5" />
        <span className="flex-1 text-sm text-foreground/80 truncate">{label}</span>
        {leg.odds && (
          <span className="text-xs text-muted-foreground font-mono shrink-0">{leg.odds}</span>
        )}
        {leg.result && (
          <span className={cn("text-xs font-semibold uppercase shrink-0", resultColor(leg.result))}>
            {leg.result}
          </span>
        )}
        <button
          onClick={() => setEditing(true)}
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        >
          <Edit3 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white/5 rounded-lg p-3 space-y-2 border border-white/10">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Bet Type</label>
          <Select
            value={leg.betType}
            onValueChange={(v) => onChange(index, { ...leg, betType: v })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["spread", "moneyline", "over", "under", "player_prop"].map((t) => (
                <SelectItem key={t} value={t} className="text-xs">
                  {BET_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Pick</label>
          <Select
            value={leg.pick}
            onValueChange={(v) => onChange(index, { ...leg, pick: v })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["home", "away", "over", "under", "yes", "no"].map((p) => (
                <SelectItem key={p} value={p} className="text-xs capitalize">
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Home Team</label>
          <Input
            value={leg.homeTeam ?? ""}
            onChange={(e) => onChange(index, { ...leg, homeTeam: e.target.value || null })}
            className="h-7 text-xs"
            placeholder="e.g. Chiefs"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Away Team</label>
          <Input
            value={leg.awayTeam ?? ""}
            onChange={(e) => onChange(index, { ...leg, awayTeam: e.target.value || null })}
            className="h-7 text-xs"
            placeholder="e.g. Bills"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Line</label>
          <Input
            value={leg.line ?? ""}
            onChange={(e) => onChange(index, { ...leg, line: e.target.value || null })}
            className="h-7 text-xs"
            placeholder="-3.5"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Odds</label>
          <Input
            value={leg.odds ?? ""}
            onChange={(e) => onChange(index, { ...leg, odds: e.target.value || null })}
            className="h-7 text-xs"
            placeholder="-110"
          />
        </div>
        {leg.betType === "player_prop" && (
          <>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Player</label>
              <Input
                value={leg.playerName ?? ""}
                onChange={(e) => onChange(index, { ...leg, playerName: e.target.value || null })}
                className="h-7 text-xs"
                placeholder="Patrick Mahomes"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Prop Type</label>
              <Input
                value={leg.propType ?? ""}
                onChange={(e) => onChange(index, { ...leg, propType: e.target.value || null })}
                className="h-7 text-xs"
                placeholder="pass_yards"
              />
            </div>
          </>
        )}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Result</label>
          <Select
            value={leg.result ?? "none"}
            onValueChange={(v) => onChange(index, { ...leg, result: v === "none" ? null : v })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className="text-xs">Pending</SelectItem>
              <SelectItem value="win" className="text-xs">Win</SelectItem>
              <SelectItem value="loss" className="text-xs">Loss</SelectItem>
              <SelectItem value="push" className="text-xs">Push</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <button
        onClick={() => setEditing(false)}
        className="text-xs text-primary hover:underline"
      >
        Done editing
      </button>
    </div>
  );
}

function TicketCard({
  ticket,
  members,
  onChange,
}: {
  ticket: ReviewTicket;
  members: any[];
  onChange: (id: string, updates: Partial<ReviewTicket>) => void;
}) {
  const status = ticketStatus(ticket);

  const statusConfig = {
    valid: {
      label: "Ready",
      icon: Check,
      badge: "bg-green-500/15 text-green-400 border-green-500/20",
      border: "border-green-500/20",
    },
    "needs-info": {
      label: "Needs Info",
      icon: AlertCircle,
      badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
      border: "border-yellow-500/20",
    },
    error: {
      label: "Parse Error",
      icon: X,
      badge: "bg-red-500/15 text-red-400 border-red-500/20",
      border: "border-red-500/20",
    },
  }[status];

  const StatusIcon = statusConfig.icon;

  return (
    <Card
      className={cn(
        "border overflow-hidden transition-all duration-200",
        ticket.expanded ? statusConfig.border : "border-white/8"
      )}
    >
      {/* Ticket header — always visible */}
      <button
        className="w-full text-left"
        onClick={() => onChange(ticket.id, { expanded: !ticket.expanded })}
      >
        <div className="flex items-center gap-3 p-4">
          {/* Thumbnail */}
          <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-white/10">
            <img
              src={ticket.imageUrl}
              alt={ticket.filename}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {ticket.sportsbook && (
                <span className="text-xs font-semibold text-primary uppercase tracking-wide">
                  {ticket.sportsbook}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {ticket.filename}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-muted-foreground">
                {ticket.legs.length} leg{ticket.legs.length !== 1 ? "s" : ""}
              </span>
              {ticket.totalOdds && (
                <span className="text-xs font-mono text-muted-foreground">
                  {ticket.totalOdds}
                </span>
              )}
              {ticket.memberEmail && (
                <span className="text-xs text-foreground/60 truncate max-w-[120px]">
                  → {ticket.memberEmail}
                </span>
              )}
            </div>
          </div>

          {/* Status + expand */}
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border",
                statusConfig.badge
              )}
            >
              <StatusIcon className="w-3 h-3" />
              {statusConfig.label}
            </span>
            {ticket.expanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </button>

      {/* Expanded body */}
      {ticket.expanded && (
        <div className="border-t border-white/8 px-4 pb-4 pt-3 space-y-4">
          {ticket.parseError ? (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 rounded-lg text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Extraction failed</p>
                <p className="text-xs mt-0.5 text-red-300/80">{ticket.parseError}</p>
              </div>
            </div>
          ) : null}

          {/* Assignment row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3 sm:col-span-1">
              <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1.5 block">
                Assign to Member
              </label>
              <Select
                value={ticket.memberEmail}
                onValueChange={(v) => onChange(ticket.id, { memberEmail: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select member…" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m: any) => {
                    const email = m.user?.email ?? m.userId;
                    const name = getDisplayName(m.user, email);
                    return (
                      <SelectItem key={m.userId} value={email}>
                        {name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1.5 block">
                NFL Week
              </label>
              <Input
                type="number"
                min={1}
                max={22}
                value={ticket.weekNumber}
                onChange={(e) => onChange(ticket.id, { weekNumber: e.target.value })}
                placeholder="e.g. 4"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1.5 block">
                Season Year
              </label>
              <Input
                type="number"
                min={2020}
                max={2030}
                value={ticket.year}
                onChange={(e) => onChange(ticket.id, { year: e.target.value })}
                placeholder="e.g. 2024"
              />
            </div>
          </div>

          {/* Legs */}
          {ticket.legs.length > 0 ? (
            <div>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-2">
                Parsed Legs
              </p>
              <div className="space-y-1">
                {ticket.legs.map((leg, i) => (
                  <LegRow
                    key={i}
                    leg={leg}
                    index={i}
                    onChange={(idx, updated) => {
                      const newLegs = [...ticket.legs];
                      newLegs[idx] = updated;
                      onChange(ticket.id, { legs: newLegs });
                    }}
                  />
                ))}
              </div>
            </div>
          ) : !ticket.parseError ? (
            <p className="text-sm text-muted-foreground italic">No legs extracted</p>
          ) : null}

          {/* Notes from AI */}
          {ticket.extractionNotes && (
            <div className="flex items-start gap-2 p-3 bg-blue-500/10 rounded-lg text-sm text-blue-300">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{ticket.extractionNotes}</span>
            </div>
          )}

          {/* Preview link */}
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => window.open(ticket.imageUrl, "_blank")}
          >
            <Eye className="w-3.5 h-3.5" />
            View full screenshot
          </button>
        </div>
      )}
    </Card>
  );
}

export default function ScreenshotImport() {
  const [, params] = useRoute("/leagues/:id/screenshot-import");
  const [, navigate] = useLocation();
  const leagueId = Number(params?.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: leagues } = useLeagues();
  const league = leagues?.find((l) => l.id === leagueId);
  const { data: members = [] } = useLeagueMembersWithUsers(leagueId);

  const [step, setStep] = useState<Step>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [processingStatuses, setProcessingStatuses] = useState<string[]>([]);
  const [tickets, setTickets] = useState<ReviewTicket[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── File selection ───────────────────────────────────────
  const addFiles = useCallback((newFiles: File[]) => {
    const imageFiles = newFiles.filter((f) =>
      f.type.startsWith("image/")
    );
    if (imageFiles.length !== newFiles.length) {
      toast({
        title: "Images only",
        description: "Only image files (JPG, PNG, WEBP) are supported. Video support is coming soon.",
      });
    }
    setFiles((prev) => {
      const combined = [...prev, ...imageFiles].slice(0, 20);
      const previews = combined.map((f) => URL.createObjectURL(f));
      setFilePreviews(previews);
      return combined;
    });
  }, [toast]);

  const removeFile = (i: number) => {
    setFiles((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      setFilePreviews(next.map((f) => URL.createObjectURL(f)));
      return next;
    });
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      addFiles(Array.from(e.dataTransfer.files));
    },
    [addFiles]
  );

  // ─── Parsing ──────────────────────────────────────────────
  const parseMutation = useMutation({
    mutationFn: async (filesToParse: File[]) => {
      setProcessingStatuses(filesToParse.map(() => "pending"));

      const formData = new FormData();
      filesToParse.forEach((f) => formData.append("images", f));

      setProcessingStatuses(filesToParse.map(() => "processing"));

      const res = await fetch(`/api/leagues/${leagueId}/import/screenshots`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || "Upload failed");
      }

      return res.json() as Promise<ParsedTicket[]>;
    },
    onSuccess: (parsed) => {
      setProcessingStatuses(parsed.map(() => "done"));
      const currentYear = new Date().getFullYear();
      const reviewTickets: ReviewTicket[] = parsed.map((t) => ({
        ...t,
        memberEmail: "",
        weekNumber: "",
        year: String(currentYear),
        expanded: true,
      }));
      setTickets(reviewTickets);
      setStep("review");
    },
    onError: (err: Error) => {
      setStep("upload");
      toast({
        title: "Parsing failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleParse = () => {
    if (files.length === 0) return;
    setStep("processing");
    parseMutation.mutate(files);
  };

  // ─── Ticket editing ───────────────────────────────────────
  const updateTicket = (id: string, updates: Partial<ReviewTicket>) => {
    setTickets((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
  };

  const removeTicket = (id: string) => {
    setTickets((prev) => prev.filter((t) => t.id !== id));
  };

  // ─── Submission ───────────────────────────────────────────
  const submitMutation = useMutation({
    mutationFn: async () => {
      const valid = tickets.filter((t) => ticketStatus(t) === "valid");
      const records = valid.map((t) => ({
        weekNumber: parseInt(t.weekNumber),
        year: parseInt(t.year),
        memberEmail: t.memberEmail,
        status: "approved",
        legs: t.legs.map((leg) => ({
          homeTeam: leg.homeTeam || undefined,
          awayTeam: leg.awayTeam || undefined,
          betType: leg.betType,
          pick: leg.pick,
          line: leg.line || undefined,
          odds: leg.odds || undefined,
          result: leg.result || undefined,
          playerName: leg.playerName || undefined,
          propType: leg.propType || undefined,
        })),
      }));

      const res = await fetch(`/api/leagues/${leagueId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ filename: "screenshot-import", records }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || "Import failed");
      }

      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "parlays"] });
      setStep("done");
      toast({
        title: "Import successful",
        description: `${data.message}. Results and odds are being auto-filled in the background.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  // ─── Computed stats ───────────────────────────────────────
  const validCount = tickets.filter((t) => ticketStatus(t) === "valid").length;
  const needsInfoCount = tickets.filter((t) => ticketStatus(t) === "needs-info").length;
  const errorCount = tickets.filter((t) => ticketStatus(t) === "error").length;

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-4">
        <Link href={`/leagues/${leagueId}`}>
          <Button variant="ghost" size="icon" className="shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <Camera className="w-6 h-6 text-primary" />
            Screenshot Import
          </h1>
          {league && (
            <p className="text-sm text-muted-foreground mt-0.5">{league.name}</p>
          )}
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1.5">
        {(["upload", "processing", "review"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-1.5">
            <div
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border",
                step === s
                  ? "bg-primary border-primary text-white"
                  : (step === "processing" && i === 0) ||
                    (step === "review" && i <= 1) ||
                    step === "done"
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "bg-muted border-border text-muted-foreground"
              )}
            >
              {(step === "review" && i < 2) || step === "done" ? (
                <Check className="w-3 h-3" />
              ) : (
                i + 1
              )}
            </div>
            <span
              className={cn(
                "text-xs font-medium capitalize",
                step === s ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {s === "upload" ? "Upload" : s === "processing" ? "Analyze" : "Review"}
            </span>
            {i < 2 && <div className="w-6 h-px bg-border mx-0.5" />}
          </div>
        ))}
      </div>

      {/* ── STEP 1: Upload ─────────────────────────────────── */}
      {step === "upload" && (
        <div className="space-y-5">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200",
              dragging
                ? "border-primary bg-primary/10 scale-[1.01]"
                : "border-white/15 hover:border-primary/50 hover:bg-white/3"
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
            />
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center">
                <FileImage className="w-8 h-8 text-primary" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">
                  Drop screenshots here, or click to browse
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  JPG, PNG, WEBP · Up to 20 files at once
                </p>
              </div>
            </div>
          </div>

          {/* Video note */}
          <div className="flex items-start gap-3 p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-sm">
            <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
            <div className="text-blue-300/90">
              <span className="font-semibold text-blue-300">Large tickets:</span>{" "}
              If your parlay doesn't fit in one screenshot, take multiple screenshots while scrolling
              through the ticket — then upload them all here. Video import is coming soon.
            </div>
          </div>

          {/* Thumbnails grid */}
          {files.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {files.length} file{files.length !== 1 ? "s" : ""} selected
              </p>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {files.map((f, i) => (
                  <div key={i} className="relative group aspect-square">
                    <img
                      src={filePreviews[i]}
                      alt={f.name}
                      className="w-full h-full object-cover rounded-lg border border-white/10"
                    />
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                    <div className="absolute inset-0 bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white text-xs font-medium px-1 text-center truncate max-w-full px-2">
                        {f.name}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            className="w-full h-12 text-base font-semibold gap-2"
            disabled={files.length === 0}
            onClick={handleParse}
          >
            <Sparkles className="w-5 h-5" />
            Analyze {files.length > 0 ? `${files.length} Screenshot${files.length !== 1 ? "s" : ""}` : "Screenshots"}
          </Button>
        </div>
      )}

      {/* ── STEP 2: Processing ─────────────────────────────── */}
      {step === "processing" && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <p className="font-semibold">AI is analyzing your screenshots…</p>
            </div>
            <p className="text-sm text-muted-foreground">
              This may take 10–30 seconds depending on the number of images.
            </p>
            <div className="space-y-2 mt-4">
              {files.map((f, i) => {
                const status = processingStatuses[i] ?? "pending";
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white/5"
                  >
                    <img
                      src={filePreviews[i]}
                      alt={f.name}
                      className="w-9 h-9 rounded-lg object-cover border border-white/10 shrink-0"
                    />
                    <span className="flex-1 text-sm text-foreground/80 truncate">{f.name}</span>
                    <span className="shrink-0">
                      {status === "done" ? (
                        <Check className="w-4 h-4 text-green-400" />
                      ) : status === "processing" ? (
                        <Loader2 className="w-4 h-4 text-primary animate-spin" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-white/20" />
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 3: Review ─────────────────────────────────── */}
      {step === "review" && (
        <div className="space-y-4">
          {/* Summary banner */}
          <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/8 flex-wrap">
            <span className="font-semibold text-sm">
              {tickets.length} ticket{tickets.length !== 1 ? "s" : ""} parsed
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {validCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500/15 text-green-400 border border-green-500/20">
                  <Check className="w-3 h-3" />
                  {validCount} ready
                </span>
              )}
              {needsInfoCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">
                  <AlertCircle className="w-3 h-3" />
                  {needsInfoCount} need info
                </span>
              )}
              {errorCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/20">
                  <X className="w-3 h-3" />
                  {errorCount} error{errorCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setStep("upload"); setTickets([]); }}
            >
              ← Upload more
            </Button>
          </div>

          {needsInfoCount > 0 && (
            <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-sm text-yellow-300">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Expand tickets marked "Needs Info" and assign them to a league member, week, and year before importing.
              </span>
            </div>
          )}

          {/* Ticket cards */}
          <div className="space-y-3">
            {tickets.map((ticket) => (
              <div key={ticket.id} className="relative group">
                <TicketCard
                  ticket={ticket}
                  members={members}
                  onChange={updateTicket}
                />
                <button
                  onClick={() => removeTicket(ticket.id)}
                  className="absolute top-3 right-12 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  title="Remove ticket"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground hover:text-red-400 transition-colors" />
                </button>
              </div>
            ))}
          </div>

          {/* AI enrichment note */}
          <div className="flex items-start gap-2 p-3.5 bg-primary/10 border border-primary/20 rounded-xl text-sm text-primary">
            <Sparkles className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              After import, game results and missing odds will be auto-filled from NFL data where available.
            </span>
          </div>

          <Button
            className="w-full h-12 text-base font-semibold gap-2"
            disabled={validCount === 0 || submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
          >
            {submitMutation.isPending ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Importing…</>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                Import {validCount} Ticket{validCount !== 1 ? "s" : ""}
              </>
            )}
          </Button>
        </div>
      )}

      {/* ── Done ───────────────────────────────────────────── */}
      {step === "done" && (
        <Card>
          <CardContent className="p-10 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
              <Check className="w-8 h-8 text-green-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground mb-1">Import Complete</h2>
              <p className="text-muted-foreground text-sm">
                Your parlay history has been imported. Results and odds will be auto-filled
                from game data in the background.
              </p>
            </div>
            <div className="flex gap-3 mt-2">
              <Link href={`/leagues/${leagueId}`}>
                <Button>View League</Button>
              </Link>
              <Button
                variant="outline"
                onClick={() => {
                  setStep("upload");
                  setFiles([]);
                  setFilePreviews([]);
                  setTickets([]);
                }}
              >
                Import More
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
