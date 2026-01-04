import { Button } from "@/components/ui/button";
import { Shell, Shield, Coins, ArrowRight, Trophy } from "lucide-react";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden field-gradient">
      
      {/* Abstract Background Shapes */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] bg-blue-600/10 rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 container mx-auto px-6 py-6 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Shell className="w-8 h-8 text-blue-500" />
          <span className="text-2xl font-display font-bold tracking-tighter">PARLAYCONCH</span>
        </div>
        <Button onClick={handleLogin} variant="outline" className="border-blue-500/20 hover:bg-blue-500/10">
          Login
        </Button>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 container mx-auto px-6 flex flex-col justify-center items-center text-center pb-20">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-8 backdrop-blur-sm animate-fade-in">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-sm font-medium text-foreground">2024 Season Live</span>
        </div>
        
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-display font-bold tracking-tight mb-12 leading-[0.9]">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 text-glow">
            MAKE YOUR PICKS
          </span>
        </h1>

        <Button 
          onClick={handleLogin} 
          size="lg" 
          className="h-16 px-10 rounded-2xl text-lg font-bold bg-blue-600 text-white hover:bg-blue-500 hover:scale-105 transition-all shadow-[0_0_30px_rgba(59,130,246,0.4)]"
        >
          Enter Pick <ArrowRight className="ml-2 w-5 h-5" />
        </Button>

        {/* Feature Grid */}
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
