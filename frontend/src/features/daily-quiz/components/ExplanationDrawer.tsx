import React from "react";
import { CheckCircle2, XCircle, Lightbulb, HelpCircle, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { QuestionFeedbackItem, QuizQuestion } from "../services";

interface ExplanationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  questions: QuizQuestion[];
  answers: Record<string, number>;
  feedbackDetails: Record<string, QuestionFeedbackItem>;
  score?: number;
  total?: number;
}

export function ExplanationDrawer({
  isOpen,
  onClose,
  questions,
  answers,
  feedbackDetails,
  score,
  total,
}: ExplanationDrawerProps) {
  const displayTotal = total ?? questions.length;
  const displayScore = score ?? 0;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="h-[90vh] max-h-[90vh] flex flex-col p-0 rounded-t-2xl border-t border-border bg-background shadow-2xl"
      >
        {/* Drawer Drag Notch Indicator */}
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-muted" />

        {/* Header */}
        <SheetHeader className="px-6 py-4 border-b border-border flex flex-row items-center justify-between space-y-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <SheetTitle className="text-lg sm:text-xl font-bold tracking-tight">
                Review & Explanations
              </SheetTitle>
              {typeof score === "number" && (
                <Badge variant="outline" className="text-xs font-semibold">
                  Score: {displayScore} / {displayTotal}
                </Badge>
              )}
            </div>
            <SheetDescription className="text-xs sm:text-sm text-muted-foreground">
              Examine the verified answers and rationales for today&apos;s daily quiz questions.
            </SheetDescription>
          </div>

          <SheetClose asChild>
            <Button variant="ghost" size="icon" className="size-8 rounded-full">
              <X className="size-4" />
              <span className="sr-only">Close review</span>
            </Button>
          </SheetClose>
        </SheetHeader>

        {/* Scrollable list of questions */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          {questions.map((question, idx) => {
            const feedback = feedbackDetails[question.id];
            const studentAnswer = answers[question.id];
            const hasStudentAnswer =
              studentAnswer !== undefined && studentAnswer !== -1;

            const isCorrect =
              feedback?.isCorrect ?? (hasStudentAnswer && studentAnswer === question.correctAnswerIndex);
            const correctIndex =
              feedback?.correctAnswerIndex ?? question.correctAnswerIndex ?? 0;
            const explanation =
              feedback?.explanation ?? question.explanation ?? "";

            return (
              <Card
                key={question.id}
                className={cn(
                  "border bg-card shadow-xs transition-colors",
                  isCorrect
                    ? "border-emerald-500/30 dark:border-emerald-500/20"
                    : "border-destructive/30 dark:border-destructive/20",
                )}
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 max-w-[85%]">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground mt-0.5">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {question.topic && (
                            <Badge variant="secondary" className="text-[10px] font-normal py-0">
                              {question.topic}
                            </Badge>
                          )}
                          {question.difficulty && (
                            <span className="text-[10px] text-muted-foreground capitalize">
                              • {question.difficulty}
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm sm:text-base font-semibold text-foreground leading-snug">
                          {question.question}
                        </h3>
                      </div>
                    </div>

                    <div>
                      {isCorrect ? (
                        <Badge
                          variant="secondary"
                          className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-none gap-1 text-xs"
                        >
                          <CheckCircle2 className="size-3.5" /> Correct
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-destructive/15 text-destructive border-none gap-1 text-xs"
                        >
                          <XCircle className="size-3.5" />{" "}
                          {hasStudentAnswer ? "Incorrect" : "Unanswered"}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-4 pt-2 space-y-3">
                  {/* Options list */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {question.options.map((option, optIdx) => {
                      const letter = String.fromCharCode(65 + optIdx);
                      const isCorrectChoice = optIdx === correctIndex;
                      const isStudentChoice = studentAnswer === optIdx;

                      let itemStyle = "border-border bg-muted/20 text-muted-foreground";
                      if (isCorrectChoice) {
                        itemStyle =
                          "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-medium ring-1 ring-emerald-500/30";
                      } else if (isStudentChoice && !isCorrectChoice) {
                        itemStyle =
                          "border-destructive/40 bg-destructive/10 text-destructive font-medium ring-1 ring-destructive/30";
                      }

                      return (
                        <div
                          key={`${question.id}-opt-${optIdx}`}
                          className={cn(
                            "flex items-center justify-between rounded-lg border p-2.5 transition-colors",
                            itemStyle,
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{letter}.</span>
                            <span>{option}</span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            {isCorrectChoice && (
                              <Badge
                                variant="outline"
                                className="border-emerald-500/40 text-[10px] text-emerald-700 dark:text-emerald-300 py-0"
                              >
                                Correct
                              </Badge>
                            )}
                            {isStudentChoice && !isCorrectChoice && (
                              <Badge
                                variant="outline"
                                className="border-destructive/40 text-[10px] text-destructive py-0"
                              >
                                Your choice
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Explanation rationale */}
                  {explanation ? (
                    <div className="rounded-xl border border-border/80 bg-muted/40 p-3 text-xs leading-relaxed">
                      <div className="flex items-center gap-1.5 font-semibold text-foreground mb-1">
                        <Lightbulb className="size-3.5 text-amber-500" />
                        <span>Explanation & Rationale</span>
                      </div>
                      <p className="text-muted-foreground">{explanation}</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground italic">
                      <HelpCircle className="size-3.5" />
                      <span>No additional explanation available for this question.</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex justify-end">
          <Button onClick={onClose} size="sm">
            Close Review
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
