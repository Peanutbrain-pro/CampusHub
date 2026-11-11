/**
 * @file realService.ts
 * @description Real service implementation for Daily Quiz feature using Supabase RPCs.
 * @owner Daily Quiz Team
 */

import { supabase } from "@/lib/supabase";
import type { Result } from "@/shared/result";
import type {
  DailyQuizService,
  QuestionFeedbackItem,
  QuizQuestion,
  QuizSubmissionResult,
  TodayQuizResponse,
  TodaySubmission,
  UserStreak,
} from "./types";

interface RpcTodayQuizResponse {
  date: string;
  already_submitted: boolean;
  questions: Array<{
    id: string;
    subject_id?: string;
    question: string;
    options: string[];
    difficulty?: string;
    topic?: string;
  }>;
}

interface RpcSubmitQuizResponse {
  score: number;
  total: number;
  streak_count: number;
  details?: Record<
    string,
    {
      is_correct: boolean;
      correct_answer_index: number;
      explanation: string;
    }
  >;
}

function getIstToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(),
  );
}

export const realDailyQuizService: DailyQuizService = {
  async getTodayQuiz(): Promise<Result<TodayQuizResponse>> {
    const { data, error } = await supabase.rpc("get_today_quiz");

    if (error) {
      return {
        data: null,
        error: {
          code: "INTERNAL",
          message: error.message,
          details: error,
        },
      };
    }

    const res = data as RpcTodayQuizResponse;

    return {
      data: {
        date: res.date,
        alreadySubmitted: res.already_submitted,
        questions: (res.questions || []).map(
          (q): QuizQuestion => ({
            id: q.id,
            question: q.question,
            options: q.options,
            subjectId: q.subject_id,
            difficulty: q.difficulty,
            topic: q.topic,
          }),
        ),
      },
      error: null,
    };
  },

  async submitQuiz(
    answers: Record<string, number>,
  ): Promise<Result<QuizSubmissionResult>> {
    // Ensure all numeric keys are passed with numbers
    const cleanedAnswers: Record<string, number> = {};
    for (const [key, val] of Object.entries(answers)) {
      cleanedAnswers[key] = typeof val === "number" ? val : -1;
    }

    const { data, error } = await supabase.rpc("submit_daily_quiz", {
      p_answers: cleanedAnswers,
    });

    if (error) {
      return {
        data: null,
        error: {
          code: "INTERNAL",
          message: error.message,
          details: error,
        },
      };
    }

    const res = data as RpcSubmitQuizResponse;

    const details: Record<string, QuestionFeedbackItem> = {};
    if (res.details) {
      Object.entries(res.details).forEach(([qid, item]) => {
        details[qid] = {
          isCorrect: item.is_correct,
          correctAnswerIndex: item.correct_answer_index,
          explanation: item.explanation,
        };
      });
    }

    return {
      data: {
        score: res.score,
        total: res.total,
        streakCount: res.streak_count,
        details,
      },
      error: null,
    };
  },

  async getUserStreak(): Promise<Result<UserStreak>> {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        data: null,
        error: {
          code: "UNAUTHENTICATED",
          message: "Please sign in to view your quiz streak.",
          details: authError,
        },
      };
    }

    const { data, error } = await supabase
      .from("user_streaks")
      .select("current_streak, best_streak, last_completed_date")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return {
        data: null,
        error: {
          code: "INTERNAL",
          message: error.message,
          details: error,
        },
      };
    }

    return {
      data: {
        currentStreak: data?.current_streak ?? 0,
        bestStreak: data?.best_streak ?? 0,
        lastCompletedDate: data?.last_completed_date ?? null,
      },
      error: null,
    };
  },

  async getTodaySubmission(): Promise<Result<TodaySubmission | null>> {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { data: null, error: null };
    }

    const today = getIstToday();

    const { data, error } = await supabase
      .from("daily_quiz_submissions")
      .select("score, total_questions, answers, completed_at")
      .eq("user_id", user.id)
      .eq("quiz_date", today)
      .maybeSingle();

    if (error) {
      return {
        data: null,
        error: {
          code: "INTERNAL",
          message: error.message,
          details: error,
        },
      };
    }

    if (!data) {
      return { data: null, error: null };
    }

    return {
      data: {
        score: data.score,
        total: data.total_questions,
        answers: (data.answers as Record<string, number>) || {},
        completedAt: data.completed_at,
      },
      error: null,
    };
  },
};
