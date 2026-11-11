import React from "react";
import { ArrowLeft, ArrowRight, Check, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { QuizQuestion } from "../services";

interface QuizPlayerProps {
  question: QuizQuestion;
  questionIndex: number;
  totalQuestions: number;
  selectedAnswer: number | null;
  answers: Record<string, number>;
  questions: QuizQuestion[];
  onSelectOption: (optionIndex: number) => void;
  onNextQuestion: () => void;
  onPrevQuestion: () => void;
  onJumpToQuestion: (index: number) => void;
  onSubmitQuiz: () => void;
  isSubmitting: boolean;
  timerComponent?: React.ReactNode;
}

export function QuizPlayer({
  question,
  questionIndex,
  totalQuestions,
  selectedAnswer,
  answers,
  questions,
  onSelectOption,
  onNextQuestion,
  onPrevQuestion,
  onJumpToQuestion,
  onSubmitQuiz,
  isSubmitting,
  timerComponent,
}: QuizPlayerProps) {
  const isLastQuestion = questionIndex === totalQuestions - 1;
  const answeredCount = Object.keys(answers).filter(
    (k) => answers[k] !== undefined && answers[k] !== -1,
  ).length;

  const difficultyColors = {
    easy: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    medium: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
    hard: "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-400",
  };

  const difficultyKey = (question.difficulty?.toLowerCase() ||
    "medium") as keyof typeof difficultyColors;
  const difficultyBadgeClass =
    difficultyColors[difficultyKey] || difficultyColors.medium;

  return (
    <Card className="border-border bg-card shadow-sm overflow-hidden">
      {/* Question header with metadata & timer */}
      <CardHeader className="border-b border-border/70 p-4 sm:p-5 bg-muted/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-border bg-card font-semibold text-xs">
              Question {questionIndex + 1} of {totalQuestions}
            </Badge>

            {question.topic && (
              <Badge variant="secondary" className="text-xs font-medium">
                {question.topic}
              </Badge>
            )}

            {question.difficulty && (
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
                  difficultyBadgeClass,
                )}
              >
                {question.difficulty}
              </span>
            )}
          </div>

          {timerComponent && <div>{timerComponent}</div>}
        </div>

        {/* Question jumper tabs/pills */}
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/50 pt-3">
          <span className="text-xs text-muted-foreground font-medium">
            Jump to question:
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {questions.map((q, idx) => {
              const isCurrent = idx === questionIndex;
              const hasAnswered = answers[q.id] !== undefined && answers[q.id] !== -1;

              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => onJumpToQuestion(idx)}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-lg text-xs font-semibold transition-all",
                    isCurrent
                      ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30 ring-offset-1 ring-offset-background"
                      : hasAnswered
                        ? "bg-primary/20 text-primary hover:bg-primary/30"
                        : "border border-border bg-card text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                  )}
                  title={`Question ${idx + 1}${hasAnswered ? " (Answered)" : ""}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-6">
        {/* Question text */}
        <div className="space-y-1">
          <h2 className="text-base sm:text-lg font-medium leading-relaxed text-foreground">
            {question.question}
          </h2>
        </div>

        {/* Options list */}
        <div className="space-y-3" role="radiogroup" aria-label="Question options">
          {question.options.map((option, index) => {
            const isSelected = selectedAnswer === index;
            const letter = String.fromCharCode(65 + index);

            return (
              <button
                key={`${question.id}-${option}-${index}`}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onSelectOption(index)}
                className={cn(
                  "flex w-full cursor-pointer items-center justify-start rounded-xl border p-3.5 sm:p-4 text-left text-sm transition-all outline-none",
                  isSelected
                    ? "border-primary bg-primary/10 text-foreground font-medium shadow-sm ring-1 ring-primary"
                    : "border-border bg-card text-foreground hover:bg-muted/50 hover:border-border/80",
                )}
              >
                <span
                  className={cn(
                    "mr-3.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {letter}
                </span>

                <span className="flex-1 text-sm leading-snug">{option}</span>

                {isSelected && (
                  <Check className="size-4 shrink-0 text-primary ml-2" />
                )}
              </button>
            );
          })}
        </div>

        {/* Card bottom navigation */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={questionIndex === 0 || isSubmitting}
              onClick={onPrevQuestion}
              className="gap-1.5"
            >
              <ArrowLeft className="size-3.5" /> Previous
            </Button>
            <span className="text-xs text-muted-foreground ml-2">
              {answeredCount} of {totalQuestions} answered
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!isLastQuestion ? (
              <Button
                type="button"
                size="sm"
                onClick={onNextQuestion}
                disabled={isSubmitting}
                className="gap-1.5"
              >
                Next <ArrowRight className="size-3.5" />
              </Button>
            ) : null}

            {/* Show Submit button on last question or anytime all answered */}
            {(isLastQuestion || answeredCount === totalQuestions) && (
              <Button
                type="button"
                size="sm"
                variant={isLastQuestion ? "default" : "secondary"}
                disabled={isSubmitting}
                onClick={onSubmitQuiz}
                className="gap-1.5"
              >
                <Send className="size-3.5" />
                {isSubmitting ? "Submitting..." : "Submit Quiz"}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
