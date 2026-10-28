-- =============================================================================
-- Migration: username_system.sql
-- Description: Custom username/handle system with case-insensitive uniqueness,
--              real-time availability checking, and username-to-email resolution.
-- Owner: Platform Core Team
-- =============================================================================

-- 1. Ensure unique case-insensitive index on profiles(handle)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_handle_lower ON public.profiles (LOWER(handle));

-- 2. Availability checking RPC for unauthenticated & authenticated clients
CREATE OR REPLACE FUNCTION public.check_handle_available(p_handle text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean text;
  v_exists boolean;
BEGIN
  IF p_handle IS NULL THEN
    RETURN false;
  END IF;

  v_clean := LOWER(TRIM(p_handle));
  IF v_clean LIKE '@%' THEN
    v_clean := SUBSTRING(v_clean FROM 2);
  END IF;

  -- Verify handle format: 4-20 characters, lowercase alphanumeric and underscores
  IF NOT (v_clean ~ '^[a-z0-9_]{4,20}$') THEN
    RETURN false;
  END IF;

  -- Guard against reserved system handles
  IF v_clean IN ('admin', 'moderator', 'system', 'campushub', 'support', 'anonymous', 'null', 'undefined', 'root', 'staff') THEN
    RETURN false;
  END IF;

  -- Check if handle already exists in profiles
  SELECT EXISTS(
    SELECT 1 FROM public.profiles WHERE LOWER(handle) = v_clean
  ) INTO v_exists;

  RETURN NOT v_exists;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_handle_available(text) TO anon, authenticated;

-- 3. Resolve username/handle to auth email for password-based sign in
CREATE OR REPLACE FUNCTION public.get_email_by_handle(p_handle text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_clean text;
  v_email text;
BEGIN
  IF p_handle IS NULL THEN
    RETURN NULL;
  END IF;

  v_clean := LOWER(TRIM(p_handle));
  IF v_clean LIKE '@%' THEN
    v_clean := SUBSTRING(v_clean FROM 2);
  END IF;

  SELECT u.email INTO v_email
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE LOWER(p.handle) = v_clean
  LIMIT 1;

  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_by_handle(text) TO anon, authenticated;

-- 4. Update user creation trigger to properly sanitize and strictly validate custom handle
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_handle text;
BEGIN
  v_handle := LOWER(TRIM(COALESCE(new.raw_user_meta_data->>'handle', split_part(new.email, '@', 1))));
  IF v_handle LIKE '@%' THEN
    v_handle := SUBSTRING(v_handle FROM 2);
  END IF;

  -- Fallback if completely empty
  IF v_handle IS NULL OR v_handle = '' THEN
    v_handle := 'user_' || SUBSTRING(new.id::text FROM 1 FOR 8);
  END IF;

  -- If handle was derived from email without explicit metadata, sanitize it
  IF new.raw_user_meta_data->>'handle' IS NULL THEN
    v_handle := REGEXP_REPLACE(v_handle, '[^a-z0-9_]', '_', 'g');
    IF LENGTH(v_handle) < 4 THEN
      v_handle := RPAD(v_handle, 4, '0');
    ELSIF LENGTH(v_handle) > 20 THEN
      v_handle := SUBSTRING(v_handle FROM 1 FOR 20);
    END IF;
  END IF;

  -- 1. Database-level length & character format validation
  IF NOT (v_handle ~ '^[a-z0-9_]{4,20}$') THEN
    RAISE EXCEPTION 'Invalid username: must be 4–20 alphanumeric characters or underscores.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 2. Database-level reserved handle protection
  IF v_handle IN ('admin', 'moderator', 'system', 'campushub', 'support', 'anonymous', 'null', 'undefined', 'root', 'staff') THEN
    RAISE EXCEPTION 'Username "%" is reserved and cannot be registered.', v_handle
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.profiles (id, handle, full_name, avatar_url, role)
  VALUES (
    new.id,
    v_handle,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    'student'
  )
  ON CONFLICT (id) DO UPDATE SET
    handle = EXCLUDED.handle,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Hard Database CHECK constraint on profiles table for defence-in-depth
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_profiles_handle_format'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT chk_profiles_handle_format
      CHECK (handle ~ '^[a-z0-9_]{4,20}$');
  END IF;
END $$;


