import React from "react";
import { Trophy, Flame, CheckCircle2, BookOpen, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  score: number;
  total: number;
  streakCount: number;
  bestStreak: number;
  onViewExplanations: () => void;
  onPracticeAgain?: () => void;
}

export function ResultModal({
  isOpen,
  onClose,
  score,
  total,
  streakCount,
  bestStreak,
  onViewExplanations,
  onPracticeAgain,
}: ResultModalProps) {
  const percentage = Math.round((score / Math.max(1, total)) * 100);
  const isPerfect = score === total;
  const isHighPass = score >= Math.ceil(total * 0.7);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md text-center p-6 space-y-4">
        <DialogHeader className="space-y-3">
          {/* Animated Celebration Icon */}
          <div className="mx-auto flex size-20 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 ring-8 ring-amber-500/5">
            {isPerfect ? (
              <Trophy className="size-10 animate-bounce text-amber-500" />
            ) : isHighPass ? (
              <CheckCircle2 className="size-10 text-emerald-500" />
            ) : (
              <BookOpen className="size-10 text-primary" />
            )}
          </div>

          <DialogTitle className="text-2xl font-bold tracking-tight text-foreground">
            {isPerfect
              ? "Perfect Score! 🌟"
              : isHighPass
                ? "Outstanding Effort! 🎯"
                : "Quiz Completed! 📚"}
          </DialogTitle>

          <DialogDescription className="text-sm text-muted-foreground">
            {isPerfect
              ? "Flawless knowledge recall across every question today."
              : isHighPass
                ? "Strong grasp of computer science core concepts."
                : "Great practice session. Daily revision builds mastery over time."}
          </DialogDescription>
        </DialogHeader>

        {/* Score & Streak Stats Cards */}
        <div className="grid grid-cols-2 gap-3 py-2">
          {/* Score metric */}
          <div className="rounded-xl border border-border bg-muted/40 p-4 flex flex-col items-center justify-center">
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Score
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-3xl font-extrabold text-foreground">
                {score}
              </span>
              <span className="text-sm font-medium text-muted-foreground">
                / {total}
              </span>
            </div>
            <Badge
              variant="secondary"
              className="mt-2 text-[10px] font-semibold bg-primary/10 text-primary border-none"
            >
              {percentage}% Accuracy
            </Badge>
          </div>

          {/* Streak metric */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex flex-col items-center justify-center">
            <span className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-300 font-medium flex items-center gap-1">
              <Flame className="size-3.5 fill-orange-500 text-orange-500" />
              Streak
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-3xl font-extrabold text-amber-600 dark:text-amber-400">
                {streakCount}
              </span>
              <span className="text-xs text-amber-700/80 dark:text-amber-300/80">
                {streakCount === 1 ? "day" : "days"}
              </span>
            </div>
            <span className="mt-2 text-[10px] text-muted-foreground">
              Best: {bestStreak} {bestStreak === 1 ? "day" : "days"}
            </span>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 pt-2">
          {onPracticeAgain ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onPracticeAgain}
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3.5" /> Practice Again
            </Button>
          ) : (
            <div />
          )}

          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="flex-1 sm:flex-none text-xs"
            >
              Done
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onClose();
                onViewExplanations();
              }}
              className="flex-1 sm:flex-none gap-1.5 text-xs"
            >
              <BookOpen className="size-3.5" /> View Explanations
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
