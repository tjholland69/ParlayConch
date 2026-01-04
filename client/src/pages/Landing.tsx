import { Button } from "@/components/ui/button";
import { Trophy, Shield, Coins, ArrowRight } from "lucide-react";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden field-gradient">
      
      {/* Abstract Background Shapes */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] bg-accent/10 rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 container mx-auto px-6 py-6 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Trophy className="w-8 h-8 text-primary" />
          <span className="text-2xl font-display font-bold tracking-tighter">BET.LEAGUE</span>
        </div>
        <Button onClick={handleLogin} variant="outline" className="border-primary/20 hover:bg-primary/10">
          Login
        </Button>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 container mx-auto px-6 flex flex-col justify-center items-center text-center pb-20">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-8 backdrop-blur-sm animate-fade-in">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-sm font-medium text-primary-foreground">2024 Season Live</span>
        </div>
        
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-display font-bold tracking-tight mb-6 leading-[0.9]">
          MAKE YOUR <br/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-green-400 to-accent text-glow">
            WINNING PICKS
          </span>
        </h1>
        
        <p className="text-xl text-muted-foreground max-w-2xl mb-12">
          Compete with friends, track your stats, and climb the leaderboard. 
          The ultimate NFL pick'em league dashboard.
        </p>

        <Button 
          onClick={handleLogin} 
          size="lg" 
          className="h-16 px-10 rounded-2xl text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 transition-all shadow-[0_0_30px_rgba(34,197,94,0.4)]"
        >
          Start Playing <ArrowRight className="ml-2 w-5 h-5" />
        </Button>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24 w-full max-w-5xl">
          {[
            { icon: Trophy, title: "Weekly Picks", desc: "Make your picks against the spread every week." },
            { icon: Shield, title: "Track History", desc: "Detailed history of all your wins, losses, and pushes." },
            { icon: Coins, title: "Leaderboard", desc: "Live standings to see who really knows ball." }
          ].map((feature, i) => (
            <div key={i} className="bg-card/30 backdrop-blur-sm p-8 rounded-3xl border border-white/5 hover:border-primary/20 transition-colors group text-left">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors">
                <feature.icon className="w-6 h-6 text-primary" />
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
