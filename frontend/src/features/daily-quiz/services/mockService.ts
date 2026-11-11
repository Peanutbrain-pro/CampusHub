/**
 * @file mockService.ts
 * @description Mock implementation of the Daily Quiz service.
 * @owner Daily Quiz Team
 */

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

const mockQuestions: QuizQuestion[] = [
  {
    id: "dbms-001",
    subjectId: "dbms",
    topic: "Normalization",
    difficulty: "medium",
    question: "Which normal form deals with removing transitive dependencies?",
    options: ["1NF", "2NF", "3NF", "BCNF"],
    correctAnswerIndex: 2,
    explanation:
      "Third Normal Form (3NF) requires removing transitive dependencies, ensuring non-prime attributes depend strictly on candidate keys.",
  },
  {
    id: "cn-002",
    subjectId: "cn",
    topic: "Congestion Control",
    difficulty: "hard",
    question: "In TCP congestion control, what triggers the Fast Retransmit mechanism?",
    options: [
      "Arrival of 3 duplicate ACKs",
      "A retransmission timer timeout",
      "A packet corruption checksum error",
      "An explicit ICMP Quench message",
    ],
    correctAnswerIndex: 0,
    explanation:
      "Receipt of 3 duplicate ACKs informs TCP sender that a segment was dropped, prompting retransmission before the timeout expires.",
  },
  {
    id: "os-001",
    subjectId: "os",
    topic: "Deadlocks",
    difficulty: "medium",
    question: "Which of the following is NOT one of Coffman's four conditions for deadlock?",
    options: ["Mutual Exclusion", "Hold and Wait", "Preemption", "Circular Wait"],
    correctAnswerIndex: 2,
    explanation:
      "The condition is 'No Preemption' (resources cannot be forcibly taken). Preemption actively prevents or breaks deadlock.",
  },
  {
    id: "dsa-001",
    subjectId: "dsa",
    topic: "Balanced Search Trees",
    difficulty: "medium",
    question: "What is the worst-case time complexity of finding an element in a Red-Black Tree with n nodes?",
    options: ["O(1)", "O(log n)", "O(n)", "O(n log n)"],
    correctAnswerIndex: 1,
    explanation:
      "Red-Black Trees maintain a balanced height of at most 2 * log2(n + 1), guaranteeing worst-case search in O(log n).",
  },
  {
    id: "daa-001",
    subjectId: "daa",
    topic: "Graph Algorithms",
    difficulty: "easy",
    question: "Which algorithmic design paradigm does Dijkstra's Single-Source Shortest Path algorithm follow?",
    options: ["Dynamic Programming", "Greedy Method", "Divide and Conquer", "Backtracking"],
    correctAnswerIndex: 1,
    explanation:
      "Dijkstra's algorithm repeatedly makes the locally optimal choice by selecting the unvisited node with minimum tentative distance.",
  },
];

const STREAK_STORAGE_KEY = "campushub:mock_quiz_streak";
const SUBMISSION_STORAGE_KEY = "campushub:mock_quiz_today_submission";

function getIstDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

function loadStreak(): UserStreak {
  try {
    const raw = localStorage.getItem(STREAK_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as UserStreak;
    }
  } catch {
    // Ignore storage errors
  }
  return {
    currentStreak: 3,
    bestStreak: 7,
    lastCompletedDate: null,
  };
}

function saveStreak(streak: UserStreak): void {
  try {
    localStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify(streak));
  } catch {
    // Ignore storage errors
  }
}

interface StoredSubmission extends TodaySubmission {
  date: string;
}

function loadSubmission(): StoredSubmission | null {
  try {
    const raw = localStorage.getItem(SUBMISSION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredSubmission;
      const today = getIstDate(0);
      if (parsed.date === today) {
        return parsed;
      }
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

function saveSubmission(submission: StoredSubmission): void {
  try {
    localStorage.setItem(SUBMISSION_STORAGE_KEY, JSON.stringify(submission));
  } catch {
    // Ignore storage errors
  }
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const mockDailyQuizService: DailyQuizService = {
  async getTodayQuiz(): Promise<Result<TodayQuizResponse>> {
    await delay(250);

    const streak = loadStreak();
    const today = getIstDate(0);
    const existingSubmission = loadSubmission();
    const alreadySubmitted =
      streak.lastCompletedDate === today || existingSubmission !== null;

    return {
      data: {
        date: today,
        alreadySubmitted,
        // In a real RPC, answers and explanations are omitted on initial fetch
        questions: mockQuestions.map((q) => ({
          id: q.id,
          subjectId: q.subjectId,
          topic: q.topic,
          difficulty: q.difficulty,
          question: q.question,
          options: q.options,
        })),
      },
      error: null,
    };
  },

  async submitQuiz(
    answers: Record<string, number>,
  ): Promise<Result<QuizSubmissionResult>> {
    await delay(300);

    const streak = loadStreak();
    const today = getIstDate(0);
    const existingSubmission = loadSubmission();

    if (streak.lastCompletedDate === today || existingSubmission !== null) {
      return {
        data: null,
        error: {
          code: "VALIDATION",
          message: "Daily quiz has already been completed for today.",
        },
      };
    }

    const details: Record<string, QuestionFeedbackItem> = {};
    let score = 0;

    mockQuestions.forEach((question) => {
      const studentAnswer = answers[question.id];
      const isCorrect =
        studentAnswer !== undefined &&
        studentAnswer !== -1 &&
        studentAnswer === question.correctAnswerIndex;

      if (isCorrect) {
        score += 1;
      }

      details[question.id] = {
        isCorrect,
        correctAnswerIndex: question.correctAnswerIndex ?? 0,
        explanation: question.explanation ?? "",
      };
    });

    const total = mockQuestions.length;
    const yesterday = getIstDate(-1);

    streak.currentStreak =
      streak.lastCompletedDate === yesterday ? streak.currentStreak + 1 : 1;

    streak.bestStreak = Math.max(streak.bestStreak, streak.currentStreak);
    streak.lastCompletedDate = today;
    saveStreak(streak);

    const submissionData: StoredSubmission = {
      date: today,
      score,
      total,
      answers,
      completedAt: new Date().toISOString(),
      details,
    };
    saveSubmission(submissionData);

    return {
      data: {
        score,
        total,
        streakCount: streak.currentStreak,
        details,
      },
      error: null,
    };
  },

  async getUserStreak(): Promise<Result<UserStreak>> {
    await delay(150);
    return {
      data: loadStreak(),
      error: null,
    };
  },

  async getTodaySubmission(): Promise<Result<TodaySubmission | null>> {
    await delay(150);
    const submission = loadSubmission();
    if (!submission) {
      return { data: null, error: null };
    }
    return {
      data: {
        score: submission.score,
        total: submission.total,
        answers: submission.answers,
        completedAt: submission.completedAt,
        details: submission.details,
      },
      error: null,
    };
  },

  async resetMockQuiz(): Promise<void> {
    try {
      localStorage.removeItem(SUBMISSION_STORAGE_KEY);
      const streak = loadStreak();
      streak.lastCompletedDate = null;
      saveStreak(streak);
    } catch {
      // Ignore
    }
  },
};
