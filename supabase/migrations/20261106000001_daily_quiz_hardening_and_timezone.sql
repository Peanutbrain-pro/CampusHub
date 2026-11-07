-- =============================================================================
-- Migration: 20261106000001_daily_quiz_hardening_and_timezone.sql
-- Description: Daily quiz snapshot assignments table, IST timezone pinning,
--              score validation hardening, and helper privilege revocation.
-- =============================================================================

-- 1. DAILY QUIZ ASSIGNMENTS TABLE (SNAPSHOT ISOLATION)
CREATE TABLE IF NOT EXISTS public.daily_quiz_assignments (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    quiz_date DATE NOT NULL,
    question_ids TEXT[] NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (user_id, quiz_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_quiz_assignments_user_date
    ON public.daily_quiz_assignments (user_id, quiz_date);

ALTER TABLE public.daily_quiz_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_quiz_assignments FROM PUBLIC, anon, authenticated;

-- Allow service_role full control
GRANT ALL ON public.daily_quiz_assignments TO service_role;


-- 2. INTERNAL QUESTION ALLOCATION HELPER
-- Computes the deterministic question IDs for a user on a given date.
-- Revoked from PUBLIC, anon, and authenticated to prevent unauthorized enumeration.
CREATE OR REPLACE FUNCTION public.compute_user_daily_quiz_ids(p_user_id UUID, p_quiz_date DATE)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_subjects TEXT[];
  v_subject_ids TEXT[] := '{}'::TEXT[];
  v_general_ids TEXT[] := '{}'::TEXT[];
  v_needed INT := 5;
BEGIN
  -- Collect user's enrolled subjects
  SELECT ARRAY_AGG(subject_id)
  INTO v_user_subjects
  FROM public.user_subjects
  WHERE user_id = p_user_id;

  -- 1. Candidate questions from enrolled subjects
  IF v_user_subjects IS NOT NULL AND CARDINALITY(v_user_subjects) > 0 THEN
    SELECT COALESCE(ARRAY_AGG(id), '{}'::TEXT[])
    INTO v_subject_ids
    FROM (
      SELECT q.id
      FROM public.daily_quiz_questions q
      WHERE q.status = 'approved'
        AND q.subject_id = ANY(v_user_subjects)
      ORDER BY
        -- Prefer questions not previously answered by this user
        (CASE WHEN EXISTS (
          SELECT 1 FROM public.daily_quiz_submissions sub
          WHERE sub.user_id = p_user_id AND (sub.answers ? q.id)
        ) THEN 1 ELSE 0 END) ASC,
        (CASE WHEN q.source = 'pyq' THEN 0 ELSE 1 END) ASC,
        md5(q.id || p_user_id::text || p_quiz_date::text) ASC
      LIMIT 5
    ) s;
  END IF;

  v_needed := 5 - CARDINALITY(v_subject_ids);

  -- 2. Top-up from general approved pool if user subjects yielded fewer than 5
  IF v_needed > 0 THEN
    SELECT COALESCE(ARRAY_AGG(id), '{}'::TEXT[])
    INTO v_general_ids
    FROM (
      SELECT q.id
      FROM public.daily_quiz_questions q
      WHERE q.status = 'approved'
        AND NOT (q.id = ANY(v_subject_ids))
      ORDER BY
        (CASE WHEN EXISTS (
          SELECT 1 FROM public.daily_quiz_submissions sub
          WHERE sub.user_id = p_user_id AND (sub.answers ? q.id)
        ) THEN 1 ELSE 0 END) ASC,
        (CASE WHEN q.source = 'pyq' THEN 0 ELSE 1 END) ASC,
        md5(q.id || p_user_id::text || p_quiz_date::text) ASC
      LIMIT v_needed
    ) g;
  END IF;

  RETURN (v_subject_ids || v_general_ids);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_user_daily_quiz_ids(UUID, DATE) FROM PUBLIC, anon, authenticated;


-- 3. GET_TODAY_QUIZ RPC (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_today_quiz()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_today DATE := (now() AT TIME ZONE 'Asia/Kolkata')::DATE;
  v_already_submitted BOOLEAN := false;
  v_assigned_ids TEXT[];
  v_computed_ids TEXT[];
  v_questions JSONB := '[]'::JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Check if user already submitted today
  SELECT EXISTS (
    SELECT 1 FROM public.daily_quiz_submissions
    WHERE user_id = v_user_id AND quiz_date = v_today
  ) INTO v_already_submitted;

  IF v_already_submitted THEN
    -- Read the exact question IDs from today's submission
    SELECT ARRAY(
      SELECT jsonb_object_keys(answers)
      FROM public.daily_quiz_submissions
      WHERE user_id = v_user_id AND quiz_date = v_today
      LIMIT 1
    ) INTO v_assigned_ids;
  ELSE
    -- Check existing snapshot assignment
    SELECT question_ids INTO v_assigned_ids
    FROM public.daily_quiz_assignments
    WHERE user_id = v_user_id AND quiz_date = v_today;

    -- If not assigned yet, compute and snapshot (only if pool has questions)
    IF v_assigned_ids IS NULL THEN
      v_computed_ids := public.compute_user_daily_quiz_ids(v_user_id, v_today);

      IF CARDINALITY(v_computed_ids) > 0 THEN
        INSERT INTO public.daily_quiz_assignments (user_id, quiz_date, question_ids)
        VALUES (v_user_id, v_today, v_computed_ids)
        ON CONFLICT (user_id, quiz_date) DO NOTHING;

        -- Read back assigned IDs
        SELECT question_ids INTO v_assigned_ids
        FROM public.daily_quiz_assignments
        WHERE user_id = v_user_id AND quiz_date = v_today;
      END IF;

      IF v_assigned_ids IS NULL THEN
        v_assigned_ids := v_computed_ids;
      END IF;
    END IF;
  END IF;

  -- Assemble question objects without correct_answer_index or explanation
  IF v_assigned_ids IS NOT NULL AND CARDINALITY(v_assigned_ids) > 0 THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'subject_id', q.subject_id,
          'question', q.question,
          'options', q.options,
          'difficulty', q.difficulty,
          'topic', q.topic
        )
        ORDER BY u.ord
      ),
      '[]'::jsonb
    )
    INTO v_questions
    FROM unnest(v_assigned_ids) WITH ORDINALITY AS u(id, ord)
    JOIN public.daily_quiz_questions q ON q.id = u.id;
  END IF;

  RETURN jsonb_build_object(
    'date', v_today::text,
    'already_submitted', v_already_submitted,
    'questions', v_questions
  );
END;
$$;


-- 4. SUBMIT_DAILY_QUIZ RPC (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.submit_daily_quiz(p_answers JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_today DATE := (now() AT TIME ZONE 'Asia/Kolkata')::DATE;
  v_yesterday DATE := v_today - 1;
  v_assigned_ids TEXT[];
  v_assigned_count INT;
  v_submitted_ids TEXT[];
  v_submitted_count INT;
  v_score INT := 0;
  v_cur_streak INT := 0;
  v_best_streak INT := 0;
  v_last_date DATE;
  v_new_streak INT := 1;
  v_new_best INT := 1;
  v_details JSONB := '{}'::jsonb;
  r_qid TEXT;
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

  -- Read today's assigned snapshot
  SELECT question_ids INTO v_assigned_ids
  FROM public.daily_quiz_assignments
  WHERE user_id = v_user_id AND quiz_date = v_today;

  v_assigned_ids := COALESCE(v_assigned_ids, '{}'::TEXT[]);
  v_assigned_count := CARDINALITY(v_assigned_ids);

  IF v_assigned_count = 0 THEN
    RAISE EXCEPTION 'No daily quiz assignment found for today. Please initiate the quiz first.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Extract submitted question IDs
  SELECT COALESCE(ARRAY_AGG(k), '{}'::TEXT[])
  INTO v_submitted_ids
  FROM jsonb_object_keys(p_answers) AS k;

  v_submitted_count := CARDINALITY(v_submitted_ids);

  -- Validate exact question ID match
  IF v_submitted_count <> v_assigned_count
     OR NOT (v_assigned_ids <@ v_submitted_ids AND v_submitted_ids <@ v_assigned_ids) THEN
    RAISE EXCEPTION 'Submitted questions do not match today''s assigned quiz.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Validate answer values are numbers
  FOREACH r_qid IN ARRAY v_assigned_ids LOOP
    IF jsonb_typeof(p_answers->r_qid) <> 'number' THEN
      RAISE EXCEPTION 'Answer for question % must be a number.', r_qid
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
  END LOOP;

  -- Score against the locked snapshot (independent of mid-day status updates)
  FOR r_q IN
    SELECT q.id, q.correct_answer_index, q.explanation
    FROM public.daily_quiz_questions q
    WHERE q.id = ANY(v_assigned_ids)
  LOOP
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

  -- Fetch current user streak info
  SELECT current_streak, best_streak, last_completed_date
  INTO v_cur_streak, v_best_streak, v_last_date
  FROM public.user_streaks
  WHERE user_id = v_user_id;

  -- Calculate new streaks based on IST dates
  IF v_last_date = v_yesterday THEN
    v_new_streak := COALESCE(v_cur_streak, 0) + 1;
  ELSE
    v_new_streak := 1;
  END IF;

  v_new_best := GREATEST(COALESCE(v_best_streak, 0), v_new_streak);

  -- Upsert streak record
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
  )
  ON CONFLICT (user_id) DO UPDATE SET
    current_streak = EXCLUDED.current_streak,
    best_streak = EXCLUDED.best_streak,
    last_completed_date = EXCLUDED.last_completed_date,
    updated_at = EXCLUDED.updated_at;

  -- Record submission row
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
    v_assigned_count,
    p_answers,
    timezone('utc'::text, now())
  );

  RETURN jsonb_build_object(
    'score', v_score,
    'total', v_assigned_count,
    'streak_count', v_new_streak,
    'details', v_details
  );
END;
$$;


-- 5. FUNCTION PERMISSIONS
GRANT EXECUTE ON FUNCTION public.get_today_quiz() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_today_quiz() FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.submit_daily_quiz(JSONB) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.submit_daily_quiz(JSONB) FROM anon, PUBLIC;

