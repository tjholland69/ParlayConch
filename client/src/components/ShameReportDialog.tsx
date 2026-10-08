import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Copy, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { ParlayStory } from "@shared/parlayStory";

const SLIDE_MS = 10_000;
/** A press held this long pauses the timer instead of skipping the slide. */
const HOLD_MS = 180;
const SLIDE_COUNT = 2;
/** Slides export at phone-story size. */
const EXPORT_W = 1080;
const EXPORT_H = 1920;

/** A lost parlay's story is red, a won one's green. */
const THEME = {
  shame: { top: "#450a0a", accent: "#fca5a5", gradient: "from-red-950", accentClass: "text-red-300" },
  locks: { top: "#052e16", accent: "#6ee7b7", gradient: "from-emerald-950", accentClass: "text-emerald-300" },
} as const;

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/** Draws one slide to a canvas so it can be saved as an image and dropped
 * into the group chat. Mirrors the on-screen slides below. */
function drawSlide(story: ParlayStory, index: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_W;
  canvas.height = EXPORT_H;
  const ctx = canvas.getContext("2d")!;
  const bg = ctx.createLinearGradient(0, 0, 0, EXPORT_H);
  bg.addColorStop(0, THEME[story.kind].top);
  bg.addColorStop(1, "#0b0f19");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, EXPORT_W, EXPORT_H);
  ctx.textAlign = "center";
  const font = (weight: number, size: number) => `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const maxW = EXPORT_W - 160;
  const mid = EXPORT_W / 2;

  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = font(600, 44);
  ctx.fillText(`${story.weekLabel} · ${story.title}`.toUpperCase(), mid, 200);

  if (index === 0) {
    ctx.font = font(400, 260);
    ctx.fillText(story.emoji, mid, 680);
    ctx.fillStyle = THEME[story.kind].accent;
    ctx.font = font(700, 64);
    ctx.fillText(fitText(ctx, story.leadLabel.toUpperCase(), maxW), mid, 880);
    ctx.fillStyle = "#ffffff";
    ctx.font = font(800, 150);
    ctx.fillText(fitText(ctx, story.leadName, maxW), mid, 1080);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = font(500, 54);
    ctx.fillText(story.leadCaption, mid, 1230);
    ctx.fillStyle = "#ffffff";
    ctx.font = font(700, 64);
    ctx.fillText(fitText(ctx, story.leadPick, maxW), mid, 1330);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.font = font(800, 96);
    ctx.fillText(story.listTitle, mid, 400);
    // Shrinks the rows once there are too many to fit at full size.
    const rowH = Math.min(190, (EXPORT_H - 720) / Math.max(story.rows.length, 1));
    const scale = rowH / 190;
    story.rows.forEach((l, i) => {
      const y = 560 + i * rowH;
      ctx.fillStyle = l.highlight ? THEME[story.kind].accent : "#ffffff";
      ctx.font = font(700, 62 * scale);
      ctx.fillText(fitText(ctx, l.highlight ? `${story.emoji} ${l.name}` : l.name, maxW), mid, y);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = font(500, 46 * scale);
      ctx.fillText(fitText(ctx, l.pick, maxW), mid, y + 66 * scale);
    });
    const pending = story.footnote;
    if (pending) {
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = `italic ${font(500, 44)}`;
      ctx.fillText(pending, mid, EXPORT_H - 180);
    }
  }

  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = font(600, 36);
  ctx.fillText("PARLAY CONCH", mid, EXPORT_H - 90);
  return canvas;
}

function downloadSlides(story: ParlayStory) {
  const slug = story.weekLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  for (let i = 0; i < SLIDE_COUNT; i++) {
    const a = document.createElement("a");
    a.href = drawSlide(story, i).toDataURL("image/png");
    a.download = `${story.kind}-report-${slug}-${i + 1}.png`;
    a.click();
  }
}

/**
 * A parlay report as a two-slide story. The Shame Report: who ruined a lost
 * parlay, then every losing bet. The Locks Report: who brought a won parlay
 * home, then every bet in it. Each slide runs on a timer shown in the bar at the
 * top. Click to skip ahead, press and hold to pause. When the last slide runs
 * out the story closes; the report button on the card brings it back. The slides
 * can be saved as images or copied as text. Mirrors mobile's ShameReportModal.
 */
export function ShameReportDialog({
  story,
  open,
  onOpenChange,
}: {
  story: ParlayStory;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [slide, setSlide] = useState(0);
  const [copied, setCopied] = useState(false);
  const theme = THEME[story.kind];

  const [holding, setHolding] = useState(false);
  // Milliseconds of the current slide already played, so a pause resumes
  // where it stopped.
  const elapsed = useRef(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>();
  const wasHeld = useRef(false);

  const goTo = (next: number) => {
    elapsed.current = 0;
    setSlide(next);
  };
  const advance = () => {
    if (slide >= SLIDE_COUNT - 1) onOpenChange(false);
    else goTo(slide + 1);
  };

  useEffect(() => {
    if (open) {
      goTo(0);
      setHolding(false);
    }
  }, [open]);
  useEffect(() => {
    if (!open || holding) return;
    const startedAt = Date.now();
    const timer = setTimeout(advance, SLIDE_MS - elapsed.current);
    return () => {
      clearTimeout(timer);
      elapsed.current += Date.now() - startedAt;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, slide, holding]);

  const onPointerDown = () => {
    wasHeld.current = false;
    holdTimer.current = setTimeout(() => {
      wasHeld.current = true;
      setHolding(true);
    }, HOLD_MS);
  };
  const onPointerUp = () => {
    clearTimeout(holdTimer.current);
    setHolding(false);
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(story.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Couldn't copy", description: "Your browser blocked clipboard access.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" data-testid={`dialog-${story.kind}-report`}>
        <DialogHeader>
          <DialogTitle>{story.title}</DialogTitle>
          <DialogDescription>
            {story.weekLabel}: {story.kind === "shame" ? "who ruined it, and every losing bet." : "who brought it home, and every bet that hit."}
          </DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={() => { if (!wasHeld.current) advance(); }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onPointerCancel={onPointerUp}
          className={cn("relative mx-auto flex aspect-[9/16] w-full max-w-[280px] select-none flex-col overflow-hidden rounded-2xl bg-gradient-to-b to-background p-5 text-center", theme.gradient)}
          aria-label="Next slide"
          title="Click to skip, hold to pause"
          data-testid="button-shame-slide"
        >
          <div className="flex w-full gap-1">
            {Array.from({ length: SLIDE_COUNT }, (_, i) => (
              <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
                <div
                  key={`${i}-${slide}-${open}`}
                  className={cn("h-full bg-white", i < slide && "w-full", i > slide && "w-0")}
                  style={i === slide
                    ? { animation: `shame-progress ${SLIDE_MS}ms linear forwards`, animationPlayState: holding ? "paused" : "running" }
                    : undefined}
                />
              </div>
            ))}
          </div>
          <style>{"@keyframes shame-progress { from { width: 0% } to { width: 100% } }"}</style>
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-widest text-white/60">
            {story.weekLabel} · {story.title}
          </p>

          {slide === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-1" data-testid="slide-shame-loser">
              <span className="text-6xl" aria-hidden="true">{story.emoji}</span>
              <p className={cn("mt-3 text-sm font-bold uppercase tracking-wider", theme.accentClass)}>{story.leadLabel}</p>
              <p className="w-full break-words font-display text-4xl font-extrabold text-white">{story.leadName}</p>
              <p className="mt-3 text-xs text-white/70">{story.leadCaption}</p>
              <p className="text-sm font-semibold text-white">{story.leadPick}</p>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col" data-testid="slide-shame-list">
              <p className="mt-4 font-display text-xl font-extrabold text-white">{story.listTitle}</p>
              <ul className="mt-3 min-h-0 flex-1 space-y-2.5 overflow-y-auto">
                {story.rows.map((l) => (
                  <li key={l.legId}>
                    <p className={cn("text-sm font-bold", l.highlight ? theme.accentClass : "text-white")}>
                      {l.highlight && `${story.emoji} `}{l.name}
                    </p>
                    <p className="text-xs text-white/70">{l.pick}</p>
                  </li>
                ))}
              </ul>
              {story.footnote && (
                <p className="pt-2 text-xs italic text-white/60" data-testid="text-shame-pending">
                  {story.footnote}
                </p>
              )}
            </div>
          )}
        </button>

        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => downloadSlides(story)} data-testid="button-shame-download">
            <Download className="w-4 h-4" />
            Save slides
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={copyText} data-testid="button-shame-copy">
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            Copy text
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
