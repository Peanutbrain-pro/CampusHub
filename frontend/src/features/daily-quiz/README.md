# Feature Guide: Daily CS Practice Quiz (`features/daily-quiz`)

The **Daily Quiz** feature provides daily computer science fundamentals questions to encourage consistent student revision. It features a timed multiple-choice player, instant grading with explanations, and streak tracking to reward consistent daily study habits.

- **Frontend Path:** `frontend/src/features/daily-quiz/`
- **Primary Route:** `/daily-quiz`
- **Backend Services:** Supabase RPCs (`get_today_quiz`, `submit_daily_quiz`) + PostgreSQL tables (`daily_quiz_questions`, `daily_quiz_assignments`, `user_streaks`, `daily_quiz_submissions`)

> [!IMPORTANT]
> **Feature Isolation Rule:**
> Nothing outside this folder may import from it, except `app/routes.tsx` which imports `dailyQuizRoute`. Imports are only permitted from `components/ui`, `lib/`, `shared/`, and this feature's own directory.

---

## 1. Backend Integration Details

This feature communicates directly with Supabase via Security Definer RPCs and PostgreSQL tables with Row-Level Security:

### Supabase RPCs
- **`public.get_today_quiz()`**:
  - Pinned to Indian Standard Time (`Asia/Kolkata`).
  - Checks if completed today; if not, deterministically assigns 5 questions from enrolled subjects (with top-up from general pool) and records snapshot in `public.daily_quiz_assignments`.
  - Returns question payloads without leaking correct answers or explanations.
- **`public.submit_daily_quiz(p_answers JSONB)`**:
  - Validates submitted question IDs match today's locked snapshot in `daily_quiz_assignments`.
  - Validates answer values are numbers, scores against backend questions, updates `user_streaks`, and returns detailed question explanations.


---

## 2. File & Directory Anatomy

```text
frontend/src/features/daily-quiz/
├── DailyQuizPage.tsx         # Main page coordinator (manages active question index, timer, and score state)
├── routes.tsx                # Route definition (/daily-quiz)
├── components/               # Sub-components isolated to daily quiz
│   ├── StreakBadge.tsx       # Flame icon and streak count display (with best streak metric)
│   ├── QuizPlayer.tsx        # Card holding the active question and option selector
│   ├── QuizTimer.tsx         # Countdown timer component (e.g. 5 minutes total)
│   ├── ExplanationDrawer.tsx # Bottom drawer displaying rationale after submission
│   └── ResultModal.tsx       # Celebration dialog showing final score and updated streak
├── services/                 # Data access layer
│   ├── types.ts              # DailyQuizService interface & data models
│   ├── mockService.ts        # Mock implementation returning simulated daily quiz and streak
│   ├── realService.ts        # FastAPI caller + Supabase streak tracker
│   └── index.ts              # Active service switcher governed by VITE_USE_MOCKS
└── README.md                 # This developer guide
```

---

## 3. Service Architecture & Mock vs Real Workflow

All data operations must be declared in `services/types.ts` and implemented in both `mockService.ts` and `realService.ts`.

### Step 1: Define Service Types (`services/types.ts`)
```typescript
import type { Result } from "@/shared/result";

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface TodayQuizResponse {
  date: string;
  questions: QuizQuestion[];
}

export interface QuizSubmissionResult {
  score: number;
  total: number;
  streakCount: number;
}

export interface UserStreak {
  currentStreak: number;
  bestStreak: number;
  lastCompletedDate: string | null;
}

export interface DailyQuizService {
  getTodayQuiz(): Promise<Result<TodayQuizResponse>>;
  submitQuiz(answers: Record<string, number>): Promise<Result<QuizSubmissionResult>>;
  getUserStreak(): Promise<Result<UserStreak>>;
}
```

### Step 2: Implement Mock Service (`services/mockService.ts`)
Return mock questions and simulated streak state with 300ms latency to build the complete gameplay flow offline:
```typescript
import type { Result } from "@/shared/result";
import type { DailyQuizService, TodayQuizResponse, QuizSubmissionResult, UserStreak } from "./types";

export const mockDailyQuizService: DailyQuizService = {
  async getTodayQuiz(): Promise<Result<TodayQuizResponse>> {
    await new Promise((r) => setTimeout(r, 250));
    return {
      data: {
        date: new Date().toISOString().split("T")[0],
        questions: [
          {
            id: "q1",
            question: "Which of the following is a self-balancing binary search tree?",
            options: ["AVL Tree", "Binary Heap", "Trie", "Hash Table"],
            correctAnswerIndex: 0,
            explanation: "AVL trees maintain height balance with rotation operations.",
          },
        ],
      },
      error: null,
    };
  },
  async submitQuiz(_answers): Promise<Result<QuizSubmissionResult>> {
    await new Promise((r) => setTimeout(r, 300));
    return { data: { score: 1, total: 1, streakCount: 5 }, error: null };
  },
  async getUserStreak(): Promise<Result<UserStreak>> {
    await new Promise((r) => setTimeout(r, 150));
    return { data: { currentStreak: 4, bestStreak: 10, lastCompletedDate: null }, error: null };
  },
};
```

### Step 3: Implement Real Service (`services/realService.ts`)
Call FastAPI endpoints via `apiGet` and `apiPost`, and check Supabase for student streaks:
```typescript
import { apiGet, apiPost } from "@/lib/api-client";
import { supabase } from "@/lib/supabase";
import type { Result } from "@/shared/result";
import type { DailyQuizService, TodayQuizResponse, QuizSubmissionResult, UserStreak } from "./types";

export const realDailyQuizService: DailyQuizService = {
  async getTodayQuiz(): Promise<Result<TodayQuizResponse>> {
    return apiGet<TodayQuizResponse>("/api/v1/daily-quiz/today");
  },
  async submitQuiz(answers: Record<string, number>): Promise<Result<QuizSubmissionResult>> {
    return apiPost<QuizSubmissionResult>("/api/v1/daily-quiz/submit", { answers });
  },
  async getUserStreak(): Promise<Result<UserStreak>> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: { code: "UNAUTHENTICATED", message: "Not logged in" } };

    const { data, error } = await supabase.from("user_streaks").select("*").eq("user_id", user.id).single();
    if (error && error.code !== "PGRST116") return { data: null, error: { code: "INTERNAL", message: error.message } };

    return {
      data: {
        currentStreak: data?.current_streak || 0,
        bestStreak: data?.best_streak || 0,
        lastCompletedDate: data?.last_completed_date || null,
      },
      error: null,
    };
  },
};
```

### Step 4: Dispatch in `services/index.ts`
```typescript
import { mockDailyQuizService } from "./mockService";
import { realDailyQuizService } from "./realService";
import type { DailyQuizService } from "./types";

export * from "./types";

const isMock = import.meta.env.VITE_USE_MOCKS === "true";
export const dailyQuizService: DailyQuizService = isMock
  ? mockDailyQuizService
  : realDailyQuizService;
```

---

## 4. How to Develop

1. **Keep `VITE_USE_MOCKS=true`** in `frontend/.env`.
2. Open `DailyQuizPage.tsx`. Import `dailyQuizService` from `./services`.
3. Build `StreakBadge` and display the student's current streak.
4. Construct `QuizPlayer` with question progression (Question 1 of 5), option buttons, and a countdown timer.
5. On quiz finish, display `ResultModal` showing the score and the streak increment animation.
6. Set `VITE_USE_MOCKS=false` in `frontend/.env` to run live with the backend question generator and Supabase streaks.

---

## 5. How to Test

- **Timer Expiry:** Verify that when the timer reaches 00:00, the quiz automatically submits whatever answers have been selected.
- **Score Calculation:** Ensure submitting all correct options results in 100% score and triggers streak celebration.
- **Type Checking:** Run from `frontend/`:
  ```bash
  pnpm tsc --noEmit
  ```
