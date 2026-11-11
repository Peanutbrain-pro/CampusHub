-- =============================================================================
-- Migration: 20261111000002_add_epp_subject.sql
-- Description: Adds 'Engineering Professional Practice' (code HS301, id 'epp')
--              to the public.subjects catalogue.
-- =============================================================================

INSERT INTO public.subjects (id, name, code)
VALUES ('epp', 'Engineering Professional Practice', 'HS301')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code;
