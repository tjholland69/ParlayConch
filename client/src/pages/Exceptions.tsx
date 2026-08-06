import { useState } from "react";
import { AlertOctagon, Image, Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useDisputes, useDisputeScreenshotUrl, useResolveDispute, type DisputeWithContext } from "@/hooks/use-exceptions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/SlidingCard";
import { formatPickLabel } from "@/lib/formatPick";

const REASON_LABELS: Record<string, string> = {
  result_wrong: "Result is wrong",
  entered_incorrectly: "Entered incorrectly",
};

function DisputeCard({ dispute }: { dispute: DisputeWithContext }) {
  const [notes, setNotes] = useState("");
  const getScreenshotUrl = useDisputeScreenshotUrl();
  const resolve = useResolveDispute();
  const isOpen = dispute.status === "open";

  return (
    <Card className="p-4 border-white/5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs px-1.5 py-0 font-normal">
              {REASON_LABELS[dispute.reasonType] ?? dispute.reasonType}
            </Badge>
            <span className="text-sm font-medium">{formatPickLabel(dispute.leg)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {dispute.leagueName} · {dispute.weekLabel} · raised by {dispute.raisedByName}
          </p>
          <p className="text-xs text-muted-foreground font-mono">
            parlay_id: {dispute.parlay.id} · parlay_leg_id: {dispute.parlayLegId}
          </p>
        </div>
        <Badge
          variant="outline"
          className={
            dispute.status === "open" ? "border-amber-500/40 text-amber-400" :
            dispute.status === "resolved" ? "border-emerald-500/40 text-emerald-400" :
            "border-muted-foreground/40 text-muted-foreground"
          }
        >
          {dispute.status}
        </Badge>
      </div>

      <p className="text-sm mt-3">{dispute.justification}</p>

      {dispute.screenshotKey && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 gap-2"
          disabled={getScreenshotUrl.isPending}
          onClick={() => getScreenshotUrl.mutate(dispute.id, {
            onSuccess: (data) => window.open(data.url, "_blank", "noopener,noreferrer"),
          })}
        >
          {getScreenshotUrl.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Image className="w-3.5 h-3.5" />}
          View screenshot
        </Button>
      )}

      {isOpen ? (
        <div className="mt-4 space-y-2 border-t border-white/5 pt-4">
          <Textarea
            className="min-h-[60px] text-sm"
            placeholder="Resolution notes (optional)…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate({ id: dispute.id, status: "resolved", notes })}
            >
              Mark Resolved
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate({ id: dispute.id, status: "dismissed", notes })}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : dispute.resolutionNotes ? (
        <p className="text-xs text-muted-foreground mt-3 border-t border-white/5 pt-3">
          Resolution: {dispute.resolutionNotes}
        </p>
      ) : null}
    </Card>
  );
}

export default function Exceptions() {
  const { user, isLoading: authLoading } = useAuth();
  const [status, setStatus] = useState("open");
  const { data: disputes, isLoading } = useDisputes(status === "all" ? undefined : status);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user?.isSuperUser) {
    return (
      <div className="max-w-lg mx-auto mt-16">
        <EmptyState icon={ShieldAlert} message="This page is restricted to support staff." />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
          <AlertOctagon className="w-6 h-6 text-accent" />
          Exceptions Queue
        </h1>
        <p className="text-sm text-muted-foreground">Member-filed disputes on parlay legs — review and clear them out.</p>
      </div>

      <Tabs value={status} onValueChange={setStatus}>
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
          <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading disputes…
        </div>
      ) : !disputes || disputes.length === 0 ? (
        <EmptyState icon={AlertOctagon} message="Nothing in this queue." />
      ) : (
        <div className="space-y-3">
          {disputes.map(d => <DisputeCard key={d.id} dispute={d} />)}
        </div>
      )}
    </div>
  );
}