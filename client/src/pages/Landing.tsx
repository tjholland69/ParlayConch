import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shell, Shield, Coins, ArrowRight, Trophy, Eye, EyeOff, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

function getNflSeasonInfo(): { inSeason: boolean; year: number } {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const year = now.getFullYear();

  if (month >= 9) return { inSeason: true, year };
  if (month === 1) return { inSeason: true, year: year - 1 };
  if (month === 2 && day <= 15) return { inSeason: true, year: year - 1 };
  return { inSeason: false, year };
}

type AuthMode = "landing" | "login" | "register";

interface AuthFormProps {
  mode: "login" | "register";
  onSuccess: () => void;
  onSwitch: () => void;
}

function AuthForm({ mode, onSuccess, onSwitch }: AuthFormProps) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLogin = mode === "login";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const endpoint = isLogin ? "/api/auth/login-local" : "/api/auth/register";
    const body: Record<string, string> = { email, password };
    if (!isLogin && firstName) body.firstName = firstName;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Something went wrong");
        return;
      }
      onSuccess();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-center">
        {isLogin ? "Welcome back" : "Create your account"}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {!isLogin && (
          <div className="space-y-1.5">
            <Label htmlFor="firstName">First name</Label>
            <Input
              id="firstName"
              placeholder="Pat"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
              className="bg-white/5 border-white/10"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="bg-white/5 border-white/10"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder={isLogin ? "Your password" : "At least 8 characters"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={isLogin ? "current-password" : "new-password"}
              className="bg-white/5 border-white/10 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold h-11"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isLogin ? (
            "Sign in"
          ) : (
            "Create account"
          )}
        </Button>
      </form>

      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-white/10" />
        </div>
        <div className="relative flex justify-center text-xs uppercase text-muted-foreground">
          <span className="bg-background px-2">or</span>
        </div>
      </div>

      <Button
        variant="outline"
        className="w-full border-white/10 hover:bg-white/5"
        onClick={() => { window.location.href = "/api/login"; }}
      >
        <Shell className="w-4 h-4 mr-2 text-blue-500" />
        Continue with Replit
      </Button>

      <p className="text-center text-sm text-muted-foreground mt-5">
        {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={onSwitch}
          className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
        >
          {isLogin ? "Sign up" : "Sign in"}
        </button>
      </p>
    </div>
  );
}

export default function Landing() {
  const [authMode, setAuthMode] = useState<AuthMode>("landing");
  const queryClient = useQueryClient();
  const { inSeason, year } = getNflSeasonInfo();

  const handleAuthSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
  };

  if (authMode === "login" || authMode === "register") {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden field-gradient">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] bg-blue-600/10 rounded-full blur-[100px]" />
        </div>

        <header className="relative z-10 container mx-auto px-6 py-6 flex justify-between items-center">
          <button
            onClick={() => setAuthMode("landing")}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <Shell className="w-8 h-8 text-blue-500" />
            <span className="text-2xl font-display font-bold tracking-tighter">PARLAYCONCH</span>
          </button>
        </header>

        <main className="relative z-10 flex-1 flex items-center justify-center px-6 pb-16">
          <div className="w-full max-w-sm bg-card/40 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
            <AuthForm
              mode={authMode}
              onSuccess={handleAuthSuccess}
              onSwitch={() => setAuthMode(authMode === "login" ? "register" : "login")}
            />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden field-gradient">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] bg-blue-600/10 rounded-full blur-[100px]" />
      </div>

      <header className="relative z-10 container mx-auto px-6 py-6 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Shell className="w-8 h-8 text-blue-500" />
          <span className="text-2xl font-display font-bold tracking-tighter">PARLAYCONCH</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            className="hover:bg-white/5 text-sm"
            onClick={() => setAuthMode("login")}
          >
            Sign in
          </Button>
          <Button
            onClick={() => setAuthMode("register")}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm"
          >
            Sign up
          </Button>
        </div>
      </header>

      <main className="relative z-10 flex-1 container mx-auto px-6 flex flex-col justify-center items-center text-center pb-20">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-8 backdrop-blur-sm animate-fade-in">
          <span className={`w-2 h-2 rounded-full ${inSeason ? "bg-blue-500 animate-pulse" : "bg-muted-foreground"}`} />
          <span className="text-sm font-medium text-foreground">
            {inSeason ? `${year} Season Live` : `Get Ready for the ${year} Season!`}
          </span>
        </div>

        <h1 className="text-5xl md:text-7xl lg:text-8xl font-display font-bold tracking-tight mb-12 leading-[0.9]">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 text-glow">
            MAKE YOUR PICKS
          </span>
        </h1>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => setAuthMode("register")}
            size="lg"
            className="h-16 px-10 rounded-2xl text-lg font-bold bg-blue-600 text-white hover:bg-blue-500 hover:scale-105 transition-all shadow-[0_0_30px_rgba(59,130,246,0.4)]"
          >
            Get Started <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
          <Button
            onClick={() => setAuthMode("login")}
            size="lg"
            variant="outline"
            className="h-16 px-8 rounded-2xl text-lg border-white/10 hover:bg-white/5"
          >
            Sign in
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24 w-full max-w-5xl">
          {[
            { icon: Trophy, title: "Weekly Picks", desc: "Make your picks every week." },
            { icon: Shield, title: "Track History", desc: "Detailed history of all your wins, losses, and pushes." },
            { icon: Coins, title: "Leaderboard", desc: "Live standings to see who really knows ball." }
          ].map((feature, i) => (
            <div key={i} className="bg-card/30 backdrop-blur-sm p-8 rounded-3xl border border-white/5 hover:border-blue-500/20 transition-colors group text-left">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-6 group-hover:bg-blue-500/20 transition-colors">
                <feature.icon className="w-6 h-6 text-blue-500" />
              </div>
              <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
              <p className="text-muted-foreground">{feature.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
