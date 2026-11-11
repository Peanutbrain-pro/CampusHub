import React from "react";
import { Flame, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StreakBadgeProps {
  currentStreak: number;
  bestStreak?: number;
  className?: string;
  showBest?: boolean;
}

export function StreakBadge({
  currentStreak,
  bestStreak,
  className,
  showBest = true,
}: StreakBadgeProps) {
  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <Badge
        variant="secondary"
        className="flex items-center gap-1.5 border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400"
      >
        <Flame className="size-4 fill-orange-500 text-orange-500 animate-pulse" />
        <span>
          {currentStreak} {currentStreak === 1 ? "Day" : "Days"} Streak
        </span>
      </Badge>

      {showBest && typeof bestStreak === "number" && bestStreak > 0 && (
        <Badge
          variant="outline"
          className="hidden sm:inline-flex items-center gap-1 border-border/80 px-2.5 py-1 text-xs text-muted-foreground"
          title={`Best Streak: ${bestStreak} days`}
        >
          <Trophy className="size-3 text-amber-500" />
          <span>Best: {bestStreak}d</span>
        </Badge>
      )}
    </div>
  );
}
