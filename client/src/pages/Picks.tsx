import { useState, useEffect } from "react";
import { useWeeks, useGames, useCreateBet } from "@/hooks/use-bets";
import { GameCard } from "@/components/GameCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Calendar } from "lucide-react";

export default function Picks() {
  const { data: weeks, isLoading: isLoadingWeeks } = useWeeks();
  const [selectedWeekId, setSelectedWeekId] = useState<string | undefined>();
  
  // Set default week to first active one or just the first one
  useEffect(() => {
    if (weeks?.length && !selectedWeekId) {
      const activeWeek = weeks.find(w => w.isActive);
      setSelectedWeekId(activeWeek ? String(activeWeek.id) : String(weeks[0].id));
    }
  }, [weeks, selectedWeekId]);

  const { data: games, isLoading: isLoadingGames } = useGames(Number(selectedWeekId));
  const { mutate: placeBet, isPending: isBetting } = useCreateBet();

  if (isLoadingWeeks) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card/30 p-6 rounded-2xl border border-white/5 backdrop-blur-sm">
        <div>
          <h1 className="text-3xl font-display font-bold">Make Your Picks</h1>
          <p className="text-muted-foreground">Select winners for the week. Good luck!</p>
        </div>
        
        <div className="w-full md:w-64">
          <Select 
            value={selectedWeekId} 
            onValueChange={setSelectedWeekId}
          >
            <SelectTrigger className="bg-background border-white/10 h-12">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" />
                <SelectValue placeholder="Select Week" />
              </div>
            </SelectTrigger>
            <SelectContent>
              {weeks?.map((week) => (
                <SelectItem key={week.id} value={String(week.id)}>
                  {week.label} {week.isActive && "(Current)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoadingGames ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 rounded-2xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : games?.length === 0 ? (
        <div className="text-center py-12 bg-card/20 rounded-2xl border border-dashed border-white/10">
          <p className="text-muted-foreground">No games scheduled for this week yet.</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {games?.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              onPick={(gameId, pick) => placeBet({ gameId, pick })}
              isPending={isBetting}
            />
          ))}
        </div>
      )}
    </div>
  );
}
