import { type GameWithBet } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Trophy, Clock, CheckCircle2 } from "lucide-react";

interface GameCardProps {
  game: GameWithBet;
  onPick: (gameId: number, pick: 'home' | 'away') => void;
  isPending: boolean;
}

export function GameCard({ game, onPick, isPending }: GameCardProps) {
  const isStarted = new Date(game.gameTime) < new Date();
  const isFinished = game.isFinished;
  
  const PickButton = ({ team, side }: { team: string, side: 'home' | 'away' }) => {
    const isSelected = game.userBet?.pick === side;
    const isWinner = isFinished && game.winner === side;
    const isLoser = isFinished && game.winner !== side && game.winner !== 'push';
    
    // Base styles
    let variantStyles = "bg-card hover:bg-secondary border-transparent";
    let textStyles = "text-muted-foreground";
    
    if (isSelected) {
      variantStyles = "bg-primary/20 border-primary ring-2 ring-primary/20";
      textStyles = "text-primary font-bold";
    }

    if (isFinished) {
      if (isWinner && isSelected) {
        variantStyles = "bg-green-500/20 border-green-500";
        textStyles = "text-green-400";
      } else if (isLoser && isSelected) {
        variantStyles = "bg-red-500/20 border-red-500";
        textStyles = "text-red-400 decoration-line-through";
      } else if (!isSelected) {
        variantStyles = "opacity-50 grayscale";
      }
    }

    return (
      <button
        disabled={isStarted || isPending}
        onClick={() => onPick(game.id, side)}
        className={cn(
          "flex-1 p-4 rounded-xl border transition-all duration-300 relative group overflow-hidden",
          variantStyles,
          !isStarted && !isSelected && "hover:-translate-y-1 hover:shadow-lg"
        )}
      >
        {/* Background Texture */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.2)_50%,transparent_75%)] bg-[length:250%_250%] bg-center group-hover:animate-[shimmer_2s_linear_infinite]" />
        
        <div className="relative z-10 flex flex-col items-center gap-2">
          <span className={cn("text-lg md:text-xl font-display uppercase tracking-wider transition-colors", textStyles)}>
            {team}
          </span>
          
          {side === 'away' && game.spread && (
             <span className="text-xs font-mono px-2 py-0.5 rounded bg-black/20 text-muted-foreground">
               {game.spread.startsWith('-') ? '' : '+'}{parseFloat(game.spread) * -1}
             </span>
          )}
          {side === 'home' && game.spread && (
             <span className="text-xs font-mono px-2 py-0.5 rounded bg-black/20 text-muted-foreground">
               {game.spread}
             </span>
          )}

          {isSelected && (
            <div className="absolute top-2 right-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
            </div>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="bg-card/40 backdrop-blur-sm border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-colors">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2 text-muted-foreground text-sm font-mono">
          <Clock className="w-4 h-4" />
          {format(new Date(game.gameTime), "EEE, MMM d • h:mm a")}
        </div>
        {isFinished && (
          <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Final
          </div>
        )}
      </div>

      <div className="flex gap-4 md:gap-8 items-center">
        <PickButton team={game.awayTeam} side="away" />
        
        <div className="text-center font-display text-muted-foreground font-bold text-xl px-2">
          VS
        </div>
        
        <PickButton team={game.homeTeam} side="home" />
      </div>
      
      {isFinished && (
        <div className="mt-4 pt-4 border-t border-white/5 flex justify-center gap-8 font-mono text-xl font-bold">
          <span className={game.winner === 'away' ? 'text-primary' : 'text-muted-foreground'}>
            {game.awayScore}
          </span>
          <span className="text-muted-foreground">-</span>
          <span className={game.winner === 'home' ? 'text-primary' : 'text-muted-foreground'}>
            {game.homeScore}
          </span>
        </div>
      )}
    </div>
  );
}
