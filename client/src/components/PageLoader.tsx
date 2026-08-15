import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type PageLoaderProps = {
  className?: string;
  /** Spinner size classes; defaults to the standard page spinner. */
  sizeClassName?: string;
};

export function PageLoader({
  className,
  sizeClassName = "w-10 h-10",
}: PageLoaderProps) {
  return (
    <div className={cn("flex items-center justify-center h-[50vh]", className)}>
      <Loader2 className={cn(sizeClassName, "text-primary animate-spin")} />
    </div>
  );
}
