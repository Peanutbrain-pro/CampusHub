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
  - Validates answer values are numbers (unanswered questions receive `-1`), scores against backend questions, updates `user_streaks`, and returns detailed question explanations.

---

## 2. File & Directory Anatomy

```text
frontend/src/features/daily-quiz/
├── DailyQuizPage.tsx         # Main page coordinator (manages active question index, timer, and score state)
├── routes.tsx                # Route definition (/daily-quiz)
├── components/               # Sub-components isolated to daily quiz
│   ├── index.ts              # Clean re-exports of all daily quiz components
│   ├── StreakBadge.tsx       # Flame icon and streak count display (with best streak metric)
│   ├── QuizPlayer.tsx        # Card holding the active question and option selector
│   ├── QuizTimer.tsx         # Countdown timer component (5 minutes total, mm:ss, alert states)
│   ├── ExplanationDrawer.tsx # Bottom drawer displaying rationale after submission
│   └── ResultModal.tsx       # Celebration dialog showing final score and updated streak
├── services/                 # Data access layer
│   ├── types.ts              # DailyQuizService interface & data models
│   ├── mockService.ts        # Mock implementation returning simulated daily quiz and streak
│   ├── realService.ts        # Supabase RPC client + streak tracker
│   └── index.ts              # Active service switcher governed by VITE_USE_MOCKS
└── README.md                 # This developer guide
```

---

## 3. Service Architecture & Mock vs Real Workflow

All data operations are declared in `services/types.ts` and implemented in both `mockService.ts` and `realService.ts`.

### Step 1: Service Types (`services/types.ts`)
```typescript
import type { Result } from "@/shared/result";

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswerIndex?: number;
  explanation?: string;
  subjectId?: string;
  topic?: string;
  difficulty?: "easy" | "medium" | "hard" | string;
}

export interface TodayQuizResponse {
  date: string;
  questions: QuizQuestion[];
  alreadySubmitted?: boolean;
}

export interface QuestionFeedbackItem {
  isCorrect: boolean;
  correctAnswerIndex: number;
  explanation: string;
}

export interface QuizSubmissionResult {
  score: number;
  total: number;
  streakCount: number;
  details?: Record<string, QuestionFeedbackItem>;
}

export interface UserStreak {
  currentStreak: number;
  bestStreak: number;
  lastCompletedDate: string | null;
}

export interface TodaySubmission {
  score: number;
  total: number;
  answers: Record<string, number>;
  completedAt: string;
  details?: Record<string, QuestionFeedbackItem>;
}

export interface DailyQuizService {
  getTodayQuiz(): Promise<Result<TodayQuizResponse>>;
  submitQuiz(answers: Record<string, number>): Promise<Result<QuizSubmissionResult>>;
  getUserStreak(): Promise<Result<UserStreak>>;
  getTodaySubmission(): Promise<Result<TodaySubmission | null>>;
  resetMockQuiz?(): Promise<void>;
}
```

---

## 4. How to Test

- **Timer Expiry:** Verify that when the timer reaches 00:00, the quiz automatically submits whatever answers have been selected (unselected questions default safely to `-1`).
- **Score Calculation:** Ensure submitting all correct options results in 100% score and triggers streak celebration modal.
- **Review Drawer:** Verify that clicking "Review Explanations" or "Review Today's Questions" opens the bottom `ExplanationDrawer` highlighting correct and student choices alongside clear rationales.
- **Type Checking & Build:**
  ```bash
  npm --prefix frontend run lint
  npm --prefix frontend run build
  ```
