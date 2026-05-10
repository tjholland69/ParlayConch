import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { ActForBar } from "@/components/ActForBar";
import { useEffect } from "react";
import { useRoute } from "wouter";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";

import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import Picks from "@/pages/Picks";
import History from "@/pages/History";
import Leagues from "@/pages/Leagues";
import LeagueDetail from "@/pages/LeagueDetail";
import LeagueSettings from "@/pages/LeagueSettings";
import DemoDataEditor from "@/pages/DemoDataEditor";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";

function useApplyPrimaryColor(primaryColor: string | undefined) {
  useEffect(() => {
    const root = document.documentElement;
    if (primaryColor) {
      root.style.setProperty("--primary", primaryColor);
      root.style.setProperty("--ring", primaryColor);
      const lNum = parseFloat(primaryColor.split(" ")[2]);
      const foreground = lNum > 55 ? "220 15% 10%" : "0 0% 100%";
      root.style.setProperty("--primary-foreground", foreground);
    } else {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--ring");
      root.style.removeProperty("--primary-foreground");
    }
  }, [primaryColor]);
}

function useApplyTheme(theme: string | undefined) {
  useEffect(() => {
    const root = document.documentElement;

    const apply = (isDark: boolean) => {
      root.setAttribute("data-theme", isDark ? "dark" : "light");
    };

    if (!theme || theme === "dark") {
      apply(true);
      return;
    }
    if (theme === "light") {
      apply(false);
      return;
    }
    // "system" — follow OS preference
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    apply(mq.matches);
    const handler = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);
}

function AuthenticatedRealtimeSync() {
  const [m1, p1] = useRoute("/leagues/:id");
  const [m2, p2] = useRoute("/leagues/:id/settings");
  const [m3, p3] = useRoute("/leagues/:id/demo-data");
  const raw = (m1 && p1?.id) || (m2 && p2?.id) || (m3 && p3?.id);
  const leagueId = raw ? Number(raw) : undefined;
  useRealtimeSync(leagueId && Number.isFinite(leagueId) ? leagueId : undefined);
  return null;
}

function Router() {
  const { user, isLoading } = useAuth();
  useApplyPrimaryColor((user?.settings as any)?.primaryColor);
  useApplyTheme((user?.settings as any)?.theme);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route component={() => {
          window.location.href = "/";
          return null;
        }} />
      </Switch>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground font-body selection:bg-primary/30 selection:text-primary-foreground">
      <AuthenticatedRealtimeSync />
      <Sidebar />
      <div className="flex-1 md:ml-72 flex flex-col min-h-screen">
        {/* Desktop top bar with notification bell */}
        <div className="hidden md:flex items-center justify-end gap-3 px-8 py-3 sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-white/5">
          <ActForBar />
          <NotificationBell />
        </div>
        <main className="flex-1 p-4 md:px-8 md:py-6 pt-20 md:pt-6 overflow-y-auto">
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/picks" component={Picks} />
            <Route path="/history" component={History} />
            <Route path="/leagues" component={Leagues} />
            <Route path="/leagues/:id/settings" component={LeagueSettings} />
            <Route path="/leagues/:id/demo-data" component={DemoDataEditor} />
            <Route path="/leagues/:id" component={LeagueDetail} />
            <Route path="/settings" component={Settings} />
            <Route component={NotFound} />
          </Switch>
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
