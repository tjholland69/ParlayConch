import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";

import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import Picks from "@/pages/Picks";
import History from "@/pages/History";
import Leagues from "@/pages/Leagues";
import LeagueDetail from "@/pages/LeagueDetail";
import NotFound from "@/pages/not-found";

function Router() {
  const { user, isLoading } = useAuth();

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
      <Sidebar />
      <main className="flex-1 md:ml-72 p-4 md:p-8 pt-20 md:pt-8 overflow-y-auto">
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/picks" component={Picks} />
          <Route path="/history" component={History} />
          <Route path="/leagues" component={Leagues} />
          <Route path="/leagues/:id" component={LeagueDetail} />
          <Route component={NotFound} />
        </Switch>
      </main>
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
