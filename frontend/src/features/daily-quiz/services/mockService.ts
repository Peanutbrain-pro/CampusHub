
/**
 * @file mockService.ts
 * @description Mock implementation of the Daily Quiz service.
 * @owner Daily Quiz Team
 */

import type { Result } from "@/shared/result";
import type {
  DailyQuizService,
  QuizQuestion,
  QuizSubmissionResult,
  TodayQuizResponse,
  UserStreak,
} from "./types";

const mockQuestions: QuizQuestion[] = [
  {
    id: "q1",
    question: "Which data structure follows the LIFO principle?",
    options: ["Queue", "Stack", "Linked List", "Tree"],
    correctAnswerIndex: 1,
    explanation:
      "A Stack follows Last In, First Out (LIFO). The last element inserted is the first one removed.",
  },
  {
    id: "q2",
    question: "Which of the following is not a Java primitive data type?",
    options: ["int", "boolean", "String", "char"],
    correctAnswerIndex: 2,
    explanation:
      "String is a Java class, not a primitive data type. int, boolean, and char are primitive types.",
  },
  {
    id: "q3",
    question: "What is the time complexity of binary search on a sorted array?",
    options: ["O(n)", "O(n²)", "O(log n)", "O(1)"],
    correctAnswerIndex: 2,
    explanation:
      "Binary search halves the search space at each step, giving it O(log n) time complexity.",
  },
  {
    id: "q4",
    question: "Which SQL command retrieves data from a database?",
    options: ["SELECT", "UPDATE", "DELETE", "INSERT"],
    correctAnswerIndex: 0,
    explanation: "SELECT retrieves data from one or more database tables.",
  },
  {
    id: "q5",
    question: "Which scheduling algorithm gives each process a fixed time slice?",
    options: [
      "First Come First Served",
      "Shortest Job First",
      "Round Robin",
      "Priority Scheduling",
    ],
    correctAnswerIndex: 2,
    explanation:
      "Round Robin assigns each process a fixed time slice, called a time quantum.",
  },
];

let mockStreak: UserStreak = {
  currentStreak: 0,
  bestStreak: 0,
  lastCompletedDate: null,
};

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

export const mockDailyQuizService: DailyQuizService = {
  async getTodayQuiz(): Promise<Result<TodayQuizResponse>> {
    await delay(300);

    return {
      data: {
        date: new Date().toISOString().slice(0, 10),
        questions: mockQuestions,
      },
      error: null,
    };
  },

  async submitQuiz(
    answers: Record<string, number>,
  ): Promise<Result<QuizSubmissionResult>> {
    await delay(300);

    const score = mockQuestions.reduce((total, question) => {
      return total +
        (answers[question.id] === question.correctAnswerIndex ? 1 : 0);
    }, 0);

    const total = mockQuestions.length;
    const today = new Date().toISOString().slice(0, 10);

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    if (mockStreak.lastCompletedDate !== today) {
      mockStreak.currentStreak =
        mockStreak.lastCompletedDate === yesterday
          ? mockStreak.currentStreak + 1
          : 1;

      mockStreak.bestStreak = Math.max(
        mockStreak.bestStreak,
        mockStreak.currentStreak,
      );

      mockStreak.lastCompletedDate = today;
    }

    return {
      data: {
        score,
        total,
        streakCount: mockStreak.currentStreak,
      },
      error: null,
    };
  },

  async getUserStreak(): Promise<Result<UserStreak>> {
    await delay(200);

    return {
      data: { ...mockStreak },
      error: null,
    };
  },
};