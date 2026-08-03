import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useSetUserDemo } from "@/hooks/use-bets";
import { 
  LayoutDashboard, 
  Trophy, 
  History, 
  LogOut, 
  Menu,
  User,
  Users,
  FlaskConical,
  Settings,
  Shell,
  TrendingUp,
  ChevronDown,
  Newspaper
} from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getDisplayName } from "@/lib/displayName";
import { NotificationBell } from "@/components/NotificationBell";
import { ActForBar } from "@/components/ActForBar";

type NavLeaf = { label: string; href: string; icon: typeof LayoutDashboard };
type NavGroup = { label: string; icon: typeof LayoutDashboard; children: { label: string; href: string }[] };
type NavItem = NavLeaf | NavGroup;

const isGroup = (item: NavItem): item is NavGroup => "children" in item;

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "My Leagues", href: "/leagues", icon: Users },
  { label: "Quick Picks", href: "/picks", icon: Trophy },
  { label: "My History", href: "/history", icon: History },
  { label: "Story Studio", href: "/story-studio", icon: Newspaper },
  {
    label: "Index",
    icon: TrendingUp,
    children: [
      { label: "Advanced Filters", href: "/index/advanced" },
      { label: "Custom Indexes", href: "/index/custom" },
    ],
  },
  { label: "Settings", href: "/settings", icon: Settings },
];

const testId = (label: string) => `nav-${label.toLowerCase().replace(/ /g, '-')}`;

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const setUserDemo = useSetUserDemo();
  const [open, setOpen] = useState(false);
  // Explicit per-group disclosure state. Unset groups fall back to
  // "expanded if one of my children is the active route".
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (label: string, next: boolean) =>
    setOpenGroups((prev) => ({ ...prev, [label]: next }));

  const NavContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-6">
        <h1 className="text-2xl font-bold tracking-tighter text-primary flex items-center gap-2">
          <Shell className="w-8 h-8 text-blue-500" />
          <span className="text-glow">PARLAYCONCH</span>
        </h1>
        <p className="text-xs text-muted-foreground mt-1 font-mono uppercase tracking-widest">
          NFL Parlay Tracker
        </p>
      </div>

      <nav className="flex-1 px-4 space-y-2">
        {NAV_ITEMS.map((item) => {
          if (!isGroup(item)) {
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer group",
                    location === item.href
                      ? "bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  )}
                  onClick={() => setOpen(false)}
                  data-testid={testId(item.label)}
                >
                  <item.icon className={cn(
                    "w-5 h-5 transition-transform group-hover:scale-110",
                    location === item.href ? "animate-pulse" : ""
                  )} />
                  <span className="font-display tracking-wide">{item.label}</span>
                </div>
              </Link>
            );
          }

          const hasActiveChild = item.children.some((child) => location === child.href);
          const expanded = openGroups[item.label] ?? hasActiveChild;

          return (
            <div key={item.label}>
              <button
                type="button"
                onClick={() => toggleGroup(item.label, !expanded)}
                aria-expanded={expanded}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer group",
                  hasActiveChild
                    ? "text-foreground font-bold"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
                data-testid={testId(item.label)}
              >
                <item.icon className="w-5 h-5 transition-transform group-hover:scale-110" />
                <span className="font-display tracking-wide flex-1 text-left">{item.label}</span>
                <ChevronDown className={cn("w-4 h-4 transition-transform", expanded ? "rotate-180" : "")} />
              </button>
              {expanded && (
                <div className="mt-1 ml-4 pl-3 border-l border-white/10 space-y-1">
                  {item.children.map((child) => (
                    <Link key={child.href} href={child.href}>
                      <div
                        className={cn(
                          "flex items-center gap-3 px-4 py-2 rounded-xl transition-all duration-200 cursor-pointer",
                          location === child.href
                            ? "bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20"
                            : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                        )}
                        onClick={() => setOpen(false)}
                        data-testid={testId(child.label)}
                      >
                        <span className="font-display tracking-wide text-sm">{child.label}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/5">
        <div className="bg-card/50 rounded-xl p-4 mb-4 backdrop-blur-sm border border-white/5">
          <div className="flex items-center gap-3 mb-3">
            {user?.profileImageUrl ? (
              <img src={user.profileImageUrl} alt="" className="w-10 h-10 rounded-full" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-primary-foreground font-bold text-lg shadow-lg">
                {getDisplayName(user, "")[0] || <User className="w-5 h-5" />}
              </div>
            )}
            <div className="overflow-hidden flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold truncate text-foreground">
                  {getDisplayName(user, "Player")}
                </p>
                {user?.isDemo && (
                  <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] px-1 py-0 h-4 shrink-0" data-testid="badge-user-demo">
                    DEMO
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {user?.email}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full justify-start text-xs mb-1",
              user?.isDemo
                ? "text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10"
                : "text-muted-foreground hover:text-yellow-400 hover:bg-yellow-500/10"
            )}
            onClick={() => setUserDemo.mutate(!user?.isDemo)}
            disabled={setUserDemo.isPending}
            data-testid="button-toggle-user-demo"
          >
            <FlaskConical className="w-3 h-3 mr-2" />
            {user?.isDemo ? "Remove Demo Flag" : "Mark as Demo Account"}
          </Button>
          <Button 
            variant="ghost" 
            className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => logout()}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Trigger */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 p-4 bg-background/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shell className="w-6 h-6 text-blue-500" />
          <span className="font-bold font-display text-lg tracking-tight">PARLAYCONCH</span>
        </div>
        <div className="flex items-center gap-1">
          <ActForBar />
          <NotificationBell />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-mobile-menu">
                <Menu className="w-6 h-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 bg-background border-r border-white/5 w-80">
              <NavContent />
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-72 flex-col fixed inset-y-0 left-0 border-r border-white/5 bg-background/95 backdrop-blur-xl z-50">
        <NavContent />
      </aside>
    </>
  );
}
