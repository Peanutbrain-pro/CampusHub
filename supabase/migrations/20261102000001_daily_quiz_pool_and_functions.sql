-- =============================================================================
-- Migration: 20261102000001_daily_quiz_pool_and_functions.sql
-- Description: Pool-based daily quiz questions, security-definer RPCs for quiz delivery and scoring, and streak tracking
-- =============================================================================

-- 1. EXTEND DAILY QUIZ QUESTIONS TABLE
ALTER TABLE public.daily_quiz_questions
  ALTER COLUMN quiz_date DROP NOT NULL;

ALTER TABLE public.daily_quiz_questions
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE public.daily_quiz_questions
  ADD COLUMN IF NOT EXISTS subject_id TEXT REFERENCES public.subjects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('ai', 'pyq', 'manual')),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS difficulty TEXT CHECK (difficulty IS NULL OR difficulty IN ('easy', 'medium', 'hard')),
  ADD COLUMN IF NOT EXISTS topic TEXT,
  ADD COLUMN IF NOT EXISTS source_snippet TEXT,
  ADD COLUMN IF NOT EXISTS source_note_id UUID REFERENCES public.notes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_daily_quiz_questions_subject_status
  ON public.daily_quiz_questions (subject_id, status);

CREATE INDEX IF NOT EXISTS idx_daily_quiz_questions_status
  ON public.daily_quiz_questions (status);


-- 2. HARDEN ROW-LEVEL SECURITY

-- Revoke direct user table read access to prevent answers & explanations leaking
DROP POLICY IF EXISTS "Authenticated users can read quiz questions" ON public.daily_quiz_questions;

-- Staff (admins and subject moderators) can review and curate questions
CREATE POLICY "Staff can view quiz questions"
  ON public.daily_quiz_questions FOR SELECT
  TO authenticated
  USING (
    public.is_admin() OR
    (subject_id IS NOT NULL AND public.is_staff_for(subject_id))
  );

CREATE POLICY "Staff can update quiz questions"
  ON public.daily_quiz_questions FOR UPDATE
  TO authenticated
  USING (
    public.is_admin() OR
    (subject_id IS NOT NULL AND public.is_staff_for(subject_id))
  )
  WITH CHECK (
    public.is_admin() OR
    (subject_id IS NOT NULL AND public.is_staff_for(subject_id))
  );

-- Direct client updates/inserts to user_streaks and submissions are forbidden (managed by submit_daily_quiz RPC)
DROP POLICY IF EXISTS "Users can insert their own quiz streak" ON public.user_streaks;
DROP POLICY IF EXISTS "Users can update their own quiz streak" ON public.user_streaks;
DROP POLICY IF EXISTS "Users can insert their own quiz submissions" ON public.daily_quiz_submissions;


-- 3. GET_TODAY_QUIZ RPC (SECURITY DEFINER)
-- Fetches today's quiz for the authenticated user based on enrolled subjects without revealing answers or explanations.
CREATE OR REPLACE FUNCTION public.get_today_quiz()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_today DATE := CURRENT_DATE;
  v_already_submitted BOOLEAN := false;
  v_user_subjects TEXT[];
  v_questions JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Check if user already completed today's quiz
  SELECT EXISTS (
    SELECT 1 FROM public.daily_quiz_submissions
    WHERE user_id = v_user_id AND quiz_date = v_today
  ) INTO v_already_submitted;

  -- Collect user's enrolled subjects
  SELECT ARRAY_AGG(subject_id)
  INTO v_user_subjects
  FROM public.user_subjects
  WHERE user_id = v_user_id;

  -- Pick 5 approved questions deterministically seeded by user_id and current date
  WITH candidate_questions AS (
    SELECT
      q.id,
      q.subject_id,
      q.question,
      q.options,
      q.difficulty,
      q.topic,
      q.source,
      -- Check if question was answered before by this user
      EXISTS (
        SELECT 1
        FROM public.daily_quiz_submissions sub
        WHERE sub.user_id = v_user_id
          AND (sub.answers ? q.id)
      ) AS already_answered
    FROM public.daily_quiz_questions q
    WHERE q.status = 'approved'
      AND (
        v_user_subjects IS NULL
        OR CARDINALITY(v_user_subjects) = 0
        OR q.subject_id = ANY(v_user_subjects)
      )
  ),
  selected_questions AS (
    SELECT
      id,
      subject_id,
      question,
      options,
      difficulty,
      topic
    FROM candidate_questions
    ORDER BY
      -- 1. Prefer un-answered questions
      already_answered ASC,
      -- 2. Give priority to PYQ sources
      (CASE WHEN source = 'pyq' THEN 0 ELSE 1 END) ASC,
      -- 3. Deterministic pseudo-random seed per user per day
      md5(id || v_user_id::text || v_today::text) ASC
    LIMIT 5
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'subject_id', subject_id,
        'question', question,
        'options', options,
        'difficulty', difficulty,
        'topic', topic
      )
    ),
    '[]'::jsonb
  )
  INTO v_questions
  FROM selected_questions;

  -- Fallback: if user subjects yielded fewer than 5 questions, pull from general approved pool
  IF jsonb_array_length(v_questions) < 5 THEN
    WITH general_questions AS (
      SELECT
        id,
        subject_id,
        question,
        options,
        difficulty,
        topic
      FROM public.daily_quiz_questions
      WHERE status = 'approved'
      ORDER BY
        (CASE WHEN source = 'pyq' THEN 0 ELSE 1 END) ASC,
        md5(id || v_user_id::text || v_today::text) ASC
      LIMIT 5
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'subject_id', subject_id,
          'question', question,
          'options', options,
          'difficulty', difficulty,
          'topic', topic
        )
      ),
      '[]'::jsonb
    )
    INTO v_questions
    FROM general_questions;
  END IF;

  RETURN jsonb_build_object(
    'date', v_today::text,
    'already_submitted', v_already_submitted,
    'questions', v_questions
  );
END;
$$;


-- 4. SUBMIT_DAILY_QUIZ RPC (SECURITY DEFINER)
-- Evaluates submitted answers, scores against backend questions, updates user streaks, and logs submission
CREATE OR REPLACE FUNCTION public.submit_daily_quiz(p_answers JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_today DATE := CURRENT_DATE;
  v_yesterday DATE := CURRENT_DATE - 1;
  v_score INT := 0;
  v_total INT := 0;
  v_cur_streak INT := 0;
  v_best_streak INT := 0;
  v_last_date DATE;
  v_new_streak INT := 1;
  v_new_best INT := 1;
  v_details JSONB := '{}'::jsonb;
  r_q RECORD;
  v_selected_idx INT;
  v_is_correct BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'Answers must be a JSON object mapping question IDs to option indexes.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Enforce one submission per day
  IF EXISTS (
    SELECT 1 FROM public.daily_quiz_submissions
    WHERE user_id = v_user_id AND quiz_date = v_today
  ) THEN
    RAISE EXCEPTION 'Daily quiz has already been completed for today.'
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Score the submitted answers against stored correct answers
  FOR r_q IN
    SELECT q.id, q.correct_answer_index, q.explanation
    FROM public.daily_quiz_questions q
    WHERE q.id IN (SELECT jsonb_object_keys(p_answers))
  LOOP
    v_total := v_total + 1;
    v_selected_idx := (p_answers->>r_q.id)::INT;
    v_is_correct := (v_selected_idx = r_q.correct_answer_index);

    IF v_is_correct THEN
      v_score := v_score + 1;
    END IF;

    v_details := jsonb_set(
      v_details,
      ARRAY[r_q.id],
      jsonb_build_object(
        'is_correct', v_is_correct,
        'correct_answer_index', r_q.correct_answer_index,
        'explanation', r_q.explanation
      )
    );
  END LOOP;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'No recognized questions in submission.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Atomically compute and update streak
  SELECT current_streak, best_streak, last_completed_date
  INTO v_cur_streak, v_best_streak, v_last_date
  FROM public.user_streaks
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    v_new_streak := 1;
    v_new_best := 1;
    INSERT INTO public.user_streaks (
      user_id,
      current_streak,
      best_streak,
      last_completed_date,
      updated_at
    ) VALUES (
      v_user_id,
      v_new_streak,
      v_new_best,
      v_today,
      timezone('utc'::text, now())
    );
  ELSE
    IF v_last_date = v_yesterday THEN
      v_new_streak := v_cur_streak + 1;
    ELSIF v_last_date = v_today THEN
      v_new_streak := v_cur_streak;
    ELSE
      v_new_streak := 1;
    END IF;

    v_new_best := GREATEST(v_best_streak, v_new_streak);

    UPDATE public.user_streaks
    SET
      current_streak = v_new_streak,
      best_streak = v_new_best,
      last_completed_date = v_today,
      updated_at = timezone('utc'::text, now())
    WHERE user_id = v_user_id;
  END IF;

  -- Record the submission
  INSERT INTO public.daily_quiz_submissions (
    user_id,
    quiz_date,
    score,
    total_questions,
    answers,
    completed_at
  ) VALUES (
    v_user_id,
    v_today,
    v_score,
    v_total,
    p_answers,
    timezone('utc'::text, now())
  );

  RETURN jsonb_build_object(
    'score', v_score,
    'total', v_total,
    'streak_count', v_new_streak,
    'details', v_details
  );
END;
$$;


-- 5. PERMISSIONS & GRANTS
GRANT EXECUTE ON FUNCTION public.get_today_quiz() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_daily_quiz(JSONB) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_today_quiz() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_daily_quiz(JSONB) FROM anon, PUBLIC;


-- 6. SEED INITIAL APPROVED QUESTIONS POOL
-- Providing foundational questions across core subjects to guarantee immediate availability on Day 1.
INSERT INTO public.daily_quiz_questions (
  id,
  subject_id,
  question,
  options,
  correct_answer_index,
  explanation,
  source,
  status,
  difficulty,
  topic,
  source_snippet
) VALUES
  (
    'dbms-001',
    'dbms',
    'Which normal form deals with removing transitive dependencies?',
    '["1NF", "2NF", "3NF", "BCNF"]'::jsonb,
    2,
    'Third Normal Form (3NF) requires removing transitive dependencies, ensuring non-prime attributes depend only on candidate keys.',
    'pyq',
    'approved',
    'medium',
    'Normalization',
    'A relation is in 3NF if it is in 2NF and no non-prime attribute is transitively dependent on every candidate key.'
  ),
  (
    'dbms-002',
    'dbms',
    'What does the ACID property "Isolation" ensure in a relational database?',
    '["Transactions are saved permanently", "Transactions execute concurrently without interference", "All operations in a transaction succeed or all fail", "Data meets all defined constraints"]'::jsonb,
    1,
    'Isolation guarantees that concurrent execution of transactions leaves the database in the same state that would have been obtained if the transactions were executed sequentially.',
    'manual',
    'approved',
    'easy',
    'Transactions',
    'Isolation prevents uncommitted changes in one transaction from being visible to other transactions.'
  ),
  (
    'cn-001',
    'cn',
    'Which layer in the OSI model is responsible for end-to-end packet routing across networks?',
    '["Data Link Layer", "Transport Layer", "Network Layer", "Session Layer"]'::jsonb,
    2,
    'The Network Layer (Layer 3) handles logical addressing (IP) and routing packets across intermediate networks.',
    'pyq',
    'approved',
    'easy',
    'OSI Model',
    'Layer 3 determines the best path to move packets from source to destination across multiple networks.'
  ),
  (
    'cn-002',
    'cn',
    'In TCP congestion control, what triggers the Fast Retransmit mechanism?',
    '["Arrival of 3 duplicate ACKs", "A retransmission timer timeout", "A packet corruption checksum error", "An explicit ICMP Quench message"]'::jsonb,
    0,
    'Receipt of three duplicate ACKs informs TCP that a packet was lost without having to wait for the retransmission timeout to expire.',
    'pyq',
    'approved',
    'hard',
    'Congestion Control',
    'Fast Retransmit: 3 duplicate ACKs prompt retransmission of missing segment before timer expiration.'
  ),
  (
    'os-001',
    'os',
    'Which of the following is NOT one of Coffman''s four conditions for deadlock?',
    '["Mutual Exclusion", "Hold and Wait", "Preemption", "Circular Wait"]'::jsonb,
    2,
    'The condition is "No Preemption" (resources cannot be forcibly taken). Preemption actually breaks deadlock.',
    'pyq',
    'approved',
    'medium',
    'Deadlocks',
    'Coffman conditions: Mutual Exclusion, Hold and Wait, No Preemption, Circular Wait.'
  ),
  (
    'os-002',
    'os',
    'What is Belady''s Anomaly in operating systems page replacement algorithms?',
    '["More page frames can cause more page faults in FIFO", "LRU degrades to O(n) under heavy thrashing", "Virtual memory exceeds physical memory size", "A process deadlocks while waiting for disk I/O"]'::jsonb,
    0,
    'Belady''s Anomaly is the phenomenon in which increasing the number of page frames results in an increase in the number of page faults for certain access patterns using FIFO.',
    'manual',
    'approved',
    'medium',
    'Memory Management',
    'FIFO replacement algorithm can suffer from Belady''s anomaly where increasing frames increases faults.'
  ),
  (
    'dsa-001',
    'dsa',
    'What is the worst-case time complexity of finding an element in an unweighted Red-Black Tree with n nodes?',
    '["O(1)", "O(log n)", "O(n)", "O(n log n)"]'::jsonb,
    1,
    'Red-Black Trees maintain a balanced height of at most 2 * log2(n + 1), guaranteeing worst-case search in O(log n).',
    'pyq',
    'approved',
    'medium',
    'Balanced Search Trees',
    'Search in a Red-Black tree has an absolute upper bound of O(log n) time.'
  ),
  (
    'dsa-002',
    'dsa',
    'Which sorting algorithm achieves O(n) time complexity for sorting integers in a known small range [0..k]?',
    '["Merge Sort", "Counting Sort", "Quick Sort", "Heap Sort"]'::jsonb,
    1,
    'Counting sort runs in O(n + k) time by counting frequencies of each key, achieving linear time when k = O(n).',
    'manual',
    'approved',
    'easy',
    'Sorting Algorithms',
    'Counting Sort sorts elements in O(n + k) without comparison.'
  ),
  (
    'daa-001',
    'daa',
    'Which algorithmic design paradigm does Dijkstra''s Single-Source Shortest Path algorithm follow?',
    '["Dynamic Programming", "Greedy Method", "Divide and Conquer", "Backtracking"]'::jsonb,
    1,
    'Dijkstra''s algorithm iteratively makes the locally optimal choice by picking the unvisited node with minimum tentative distance (Greedy).',
    'pyq',
    'approved',
    'easy',
    'Graph Algorithms',
    'Dijkstra algorithm is a greedy algorithm solving single source shortest path for non-negative weights.'
  ),
  (
    'dm-001',
    'dm',
    'If a relation R on set A is reflexive, symmetric, and transitive, what is R classified as?',
    '["Partial Order Relation", "Equivalence Relation", "Strict Order", "Bijective Mapping"]'::jsonb,
    1,
    'A binary relation that satisfies reflexivity, symmetry, and transitivity is defined as an Equivalence Relation.',
    'manual',
    'approved',
    'easy',
    'Set Theory & Relations',
    'Equivalence relation: reflexive, symmetric, and transitive.'
  )
ON CONFLICT (id) DO NOTHING;

