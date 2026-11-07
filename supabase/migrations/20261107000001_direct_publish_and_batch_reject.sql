-- =============================================================================
-- Migration: 20261107000001_direct_publish_and_batch_reject.sql
-- Description: Staff direct publishing RPC for notes and batch rejection RPC
-- =============================================================================

-- 1. RPC: Direct publish note by staff (moderator of subject or admin)
CREATE OR REPLACE FUNCTION public.direct_publish_note(
  p_subject_id TEXT,
  p_title TEXT,
  p_tag TEXT DEFAULT 'Lecture',
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
    COALESCE(p_tag, 'Lecture'),
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

-- 2. RPC: Batch reject multiple notes
CREATE OR REPLACE FUNCTION public.reject_notes_batch(
  p_note_ids UUID[],
  p_reason TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  v_id UUID;
  v_note public.notes;
  v_count INT := 0;
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM set_config('app.trusted_note_update', '1', true);

  FOREACH v_id IN ARRAY p_note_ids
  LOOP
    SELECT * INTO v_note
    FROM public.notes
    WHERE id = v_id;

    IF FOUND AND public.is_staff_for(v_note.subject_id) THEN
      UPDATE public.notes
      SET
        status = 'rejected',
        is_shared = false
      WHERE id = v_id;

      INSERT INTO public.moderation_log (subject_id, actor, target, action, details)
      VALUES (
        v_note.subject_id,
        v_uid,
        v_id::text,
        'reject_note',
        jsonb_build_object('title', v_note.title, 'reason', p_reason, 'batch', true)
      );

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- 3. Permissions
REVOKE EXECUTE ON FUNCTION public.direct_publish_note(TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.direct_publish_note(TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, INT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reject_notes_batch(UUID[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_notes_batch(UUID[], TEXT) TO authenticated;
