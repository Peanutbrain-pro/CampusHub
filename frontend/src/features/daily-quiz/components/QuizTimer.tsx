import React from "react";
import { Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuizTimerProps {
  secondsLeft: number;
  totalSeconds?: number;
  className?: string;
}

export function QuizTimer({
  secondsLeft,
  totalSeconds = 300,
  className,
}: QuizTimerProps) {
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const isCritical = secondsLeft <= 30;
  const isWarning = secondsLeft <= 60 && !isCritical;

  const percentLeft = Math.max(0, Math.min(100, (secondsLeft / totalSeconds) * 100));

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-1.5 transition-colors",
        isCritical
          ? "border-destructive/40 bg-destructive/10 text-destructive animate-pulse"
          : isWarning
            ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
            : "border-border bg-muted/30 text-muted-foreground",
        className,
      )}
      role="timer"
      aria-label={`Time remaining: ${formattedTime}`}
      aria-live="polite"
    >
      {isCritical ? (
        <AlertTriangle className="size-4 shrink-0" />
      ) : (
        <Clock className="size-4 shrink-0" />
      )}
      <span className="font-mono text-xs sm:text-sm font-semibold tracking-wide">
        {formattedTime}
      </span>
      <span className="hidden sm:inline text-xs opacity-75">remaining</span>

      {/* Visual micro progress indicator */}
      <div className="hidden md:block w-12 h-1.5 rounded-full bg-muted overflow-hidden ml-1">
        <div
          className={cn(
            "h-full transition-all duration-300",
            isCritical
              ? "bg-destructive"
              : isWarning
                ? "bg-amber-500"
                : "bg-primary",
          )}
          style={{ width: `${percentLeft}%` }}
        />
      </div>
    </div>
  );
}
