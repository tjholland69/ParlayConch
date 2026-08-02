import { useState, useCallback, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SlidingCardSlide {
  label: string;
  content: ReactNode;
}

interface SlidingCardProps {
  slides: SlidingCardSlide[];
  headerExtra?: ReactNode;
}

export function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3">
      <Icon className="w-10 h-10 text-muted-foreground opacity-30" />
      <p className="text-muted-foreground text-sm text-center max-w-xs">{message}</p>
    </div>
  );
}

export function SlidingCard({ slides, headerExtra }: SlidingCardProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const totalSlides = slides.length;

  const goToSlide = useCallback((index: number) => {
    setCurrentSlide(index);
  }, []);

  const prev = useCallback(() => {
    setCurrentSlide((s) => (s - 1 + totalSlides) % totalSlides);
  }, [totalSlides]);

  const next = useCallback(() => {
    setCurrentSlide((s) => (s + 1) % totalSlides);
  }, [totalSlides]);

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-background to-background border border-primary/20">
      <div className="relative z-10 flex items-center justify-between gap-3 px-6 pt-5 flex-wrap">
        <div className="flex gap-0.5 bg-white/5 rounded-full p-1 border border-white/10">
          {slides.map((slide, i) => (
            <button
              key={i}
              onClick={() => goToSlide(i)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-semibold transition-all",
                currentSlide === i
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {slide.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {headerExtra}
          {totalSlides > 1 && (
            <div className="flex gap-1">
              <button
                onClick={prev}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={next}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${currentSlide * 100}%)` }}
        >
          {slides.map((slide, i) => (
            <div key={i} className="w-full shrink-0 p-6 md:p-10 min-h-[260px]">
              {slide.content}
            </div>
          ))}
        </div>
      </div>

      {totalSlides > 1 && (
        <div className="relative z-10 flex justify-center gap-2 pb-4 pt-1">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goToSlide(i)}
              className={cn(
                "rounded-full transition-all duration-300",
                currentSlide === i ? "w-6 h-2 bg-primary" : "w-2 h-2 bg-white/20 hover:bg-white/40"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
