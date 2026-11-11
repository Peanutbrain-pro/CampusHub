-- =============================================================================
-- Migration: 20261111000001_fix_storage_upload_rls.sql
-- Description: Fix storage.objects RLS policies, personal quota lifecycle,
--              and notes_tag_check constraint compatibility.
-- =============================================================================

-- 1. Fix subject-notes INSERT RLS Policy
-- When Supabase Storage API creates the storage.objects row during upload, metadata
-- is not yet populated with 'size'. Requiring '(metadata->>size) IS NOT NULL' causes
-- PostgreSQL RLS to reject all student uploads with 'new row violates row-level security policy'.
DROP POLICY IF EXISTS "Users can upload own notes to subject-notes with quota verification" ON storage.objects;

CREATE POLICY "Users can upload own notes to subject-notes with quota verification"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'subject-notes' AND
    (auth.uid()::text = (storage.foldername(name))[1]) AND
    (
      (metadata->>'size') IS NULL OR
      public.check_subject_notes_quota(auth.uid(), (metadata->>'size')::bigint)
    )
  );

-- 2. Update quota function to exclude approved shared community notes from student quota
-- Once approved, notes belong to the community and must release the student's personal 50MB quota.
CREATE OR REPLACE FUNCTION public.check_subject_notes_quota(p_owner uuid, p_new_size bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  v_global_used bigint;
  v_user_used bigint;
  v_user_count bigint;
  c_global_limit CONSTANT bigint := 524288000; -- 500 MB
  c_user_limit   CONSTANT bigint := 52428800;  -- 50 MB
  c_user_file_limit CONSTANT bigint := 30;
BEGIN
  -- Check user file count ceiling (excluding approved community notes)
  SELECT COUNT(*) INTO v_user_count
  FROM storage.objects o
  WHERE o.bucket_id = 'subject-notes'
    AND (storage.foldername(o.name))[1] = p_owner::text
    AND NOT EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.storage_path = o.name AND n.is_shared = true AND n.status = 'approved'
    );

  IF v_user_count >= c_user_file_limit THEN
    RETURN false;
  END IF;

  -- Sum global usage in subject-notes bucket
  SELECT COALESCE(SUM((metadata->>'size')::bigint), 0) INTO v_global_used
  FROM storage.objects
  WHERE bucket_id = 'subject-notes';

  IF (v_global_used + COALESCE(p_new_size, 0)) > c_global_limit THEN
    RETURN false;
  END IF;

  -- Sum user usage in subject-notes bucket (excluding approved community notes)
  SELECT COALESCE(SUM((metadata->>'size')::bigint), 0) INTO v_user_used
  FROM storage.objects o
  WHERE o.bucket_id = 'subject-notes'
    AND (storage.foldername(o.name))[1] = p_owner::text
    AND NOT EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.storage_path = o.name AND n.is_shared = true AND n.status = 'approved'
    );

  IF (v_user_used + COALESCE(p_new_size, 0)) > c_user_limit THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- 3. Fix get_my_storage_usage to also exclude approved shared notes
CREATE OR REPLACE FUNCTION public.get_my_storage_usage()
RETURNS TABLE (
  user_used bigint,
  user_max bigint,
  global_used bigint,
  global_max bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  c_global_limit CONSTANT bigint := 524288000; -- 500 MB
  c_user_limit   CONSTANT bigint := 52428800;  -- 50 MB
BEGIN
  RETURN QUERY
  SELECT
    COALESCE((
      SELECT SUM((metadata->>'size')::bigint)
      FROM storage.objects o
      WHERE o.bucket_id = 'subject-notes'
        AND (storage.foldername(o.name))[1] = v_user_id::text
        AND NOT EXISTS (
          SELECT 1 FROM public.notes n
          WHERE n.storage_path = o.name AND n.is_shared = true AND n.status = 'approved'
        )
    ), 0)::bigint AS user_used,
    c_user_limit AS user_max,
    COALESCE((
      SELECT SUM((metadata->>'size')::bigint)
      FROM storage.objects
      WHERE bucket_id = 'subject-notes'
    ), 0)::bigint AS global_used,
    c_global_limit AS global_max;
END;
$$;

-- 4. Fix Avatars SELECT Policy for upsert: true
-- Migration 20261105000003 dropped the public SELECT policy on avatars to prevent file enumeration.
-- However, avatarService.ts uploads with 'upsert: true', which runs INSERT ... ON CONFLICT ... RETURNING *.
-- Without a SELECT policy for the file owner, Postgres blocks the RETURNING phase and throws an RLS error.
DROP POLICY IF EXISTS "Users can read own avatar object" ON storage.objects;

CREATE POLICY "Users can read own avatar object"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- 5. Expand notes_tag_check constraint for full backward and forward compatibility
-- Migration 20261101000010 restricted notes_tag_check to ('Lecture / Day wise', 'Unit wise', 'Other', 'PYQ', 'Private').
-- Allowing both 'Lecture' and 'Lecture / Day wise' prevents check constraint violations from legacy callers.
ALTER TABLE public.notes DROP CONSTRAINT IF EXISTS notes_tag_check;
ALTER TABLE public.notes
  ADD CONSTRAINT notes_tag_check
  CHECK (tag IN ('Lecture', 'Lecture / Day wise', 'Unit wise', 'Summary', 'Other', 'PYQ', 'Private'));

-- 6. Update direct_publish_note RPC default tag
CREATE OR REPLACE FUNCTION public.direct_publish_note(
  p_subject_id TEXT,
  p_title TEXT,
  p_tag TEXT DEFAULT 'Lecture / Day wise',
  p_category TEXT DEFAULT 'Other',
  p_storage_path TEXT DEFAULT NULL,
  p_file_size_bytes BIGINT DEFAULT 0,
  p_page_count INT DEFAULT 1
)
RETURNS public.notes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  v_note public.notes;
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify caller is staff for this subject
  IF NOT public.is_staff_for(p_subject_id) THEN
    RAISE EXCEPTION 'Access denied. Moderator or Admin privileges required for subject %.', p_subject_id;
  END IF;

  IF p_storage_path IS NOT NULL AND (storage.foldername(p_storage_path))[1] <> v_uid::text THEN
    RAISE EXCEPTION 'Storage path must reside within caller folder';
  END IF;

  -- Set trusted update flag if any triggers need it
  PERFORM set_config('app.trusted_note_update', '1', true);

  INSERT INTO public.notes (
    subject_id,
    user_id,
    title,
    description,
    storage_path,
    tag,
    is_shared,
    status,
    file_size_bytes,
    page_count
  ) VALUES (
    p_subject_id,
    v_uid,
    TRIM(p_title),
    COALESCE(p_category, 'Other'),
    p_storage_path,
    COALESCE(p_tag, 'Lecture / Day wise'),
    true,
    'approved',
    COALESCE(p_file_size_bytes, 0),
    COALESCE(p_page_count, 1)
  )
  RETURNING * INTO v_note;

  INSERT INTO public.moderation_log (subject_id, actor, target, action, details)
  VALUES (
    p_subject_id,
    v_uid,
    v_note.id::text,
    'direct_publish_note',
    jsonb_build_object(
      'title', v_note.title,
      'category', v_note.description,
      'tag', v_note.tag
    )
  );

  RETURN v_note;
END;
$$;
