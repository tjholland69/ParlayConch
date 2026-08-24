import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Loader2,
  ShieldAlert,
  ShieldCheck,
  CalendarPlus,
  AlertTriangle,
  Scale,
  ListChecks,
  Clock,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/SlidingCard";
import type { LucideIcon } from "lucide-react";

/**
 * Super-user-only admin landing page — a menu of every admin function, both
 * the ones with their own dedicated page (Season Admin, Exceptions) and the
 * one-off maintenance actions that previously had no UI at all (nflverse
 * sync, prop resolution, parlay status rollup, etc — all exist as
 * super-user-gated API routes in server/routes.ts but weren't reachable
 * from the browser before this page).
 */
export default function AdminHome() {
  const { user, isLoading: authLoading } = useAuth();

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
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-accent" />
          Admin
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every super-user function in one place.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <AdminLinkCard
          href="/admin/season"
          icon={CalendarPlus}
          title="Season & Schedule"
          description="Create weeks, import games/lines, activate a week, and check for a newly-released NFL season."
        />
        <AdminLinkCard
          href="/exceptions"
          icon={AlertTriangle}
          title="Exceptions"
          description="Review and resolve disputed parlay legs."
        />
      </div>

      <MaintenanceActionsCard />
    </div>
  );
}

function AdminLinkCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link href={href}>
      <Card className="border-white/5 h-full cursor-pointer transition-colors hover:bg-white/5">
        <CardContent className="p-5 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm flex items-center gap-1">
              {title}
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * Maintenance actions that only ever existed as raw API routes — resolving
 * props, rolling up parlay statuses, backfilling finish times. Fire-and-report
 * buttons rather than dedicated pages since none of them take input beyond
 * "run this now".
 */
function MaintenanceActionsCard() {
  const { toast } = useToast();
  const [running, setRunning] = useState<string | null>(null);

  const runAction = useMutation({
    mutationFn: async ({ key, path }: { key: string; path: string }) => {
      setRunning(key);
      const res = await apiRequest("POST", path);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Done", description: typeof data?.message === "string" ? data.message : "Action completed." });
    },
    onError: (err: Error) => toast({ title: "Action failed", description: err.message, variant: "destructive" }),
    onSettled: () => setRunning(null),
  });

  const actions: { key: string; path: string; icon: LucideIcon; label: string; description: string }[] = [
    {
      key: "rollup",
      path: "/api/admin/rollup-parlay-statuses",
      icon: ListChecks,
      label: "Rollup parlay statuses",
      description: "Recompute win/loss/push for parlays whose legs have all settled.",
    },
    {
      key: "resolve-props",
      path: "/api/admin/resolve-props",
      icon: Scale,
      label: "Resolve player props",
      description: "Settle player-prop legs against synced stats.",
    },
    {
      key: "backfill-finished-at",
      path: "/api/admin/backfill-game-finished-at",
      icon: Clock,
      label: "Backfill game finish times",
      description: "Fill in missing finishedAt timestamps on completed games.",
    },
  ];

  return (
    <Card className="border-white/5">
      <CardHeader className="pb-2 font-semibold text-sm">Maintenance actions</CardHeader>
      <CardContent className="space-y-2">
        {actions.map((action) => (
          <div
            key={action.key}
            className="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-0"
          >
            <div className="flex items-start gap-3 min-w-0">
              <action.icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{action.label}</p>
                <p className="text-xs text-muted-foreground">{action.description}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={runAction.isPending}
              onClick={() => runAction.mutate({ key: action.key, path: action.path })}
            >
              {runAction.isPending && running === action.key ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Run"
              )}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
