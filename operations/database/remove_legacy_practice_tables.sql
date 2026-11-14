-- Retired local question, grading and misconception data, in dependency order.
-- No CASCADE: unrelated dependencies must stop the transaction.
DROP TABLE IF EXISTS public.misconception_events;
DROP TABLE IF EXISTS public.practice_attempts;
DROP TABLE IF EXISTS public.practice_submissions;
DROP TABLE IF EXISTS public.practice_questions;
DROP TABLE IF EXISTS public.practice_sets;
DROP TABLE IF EXISTS public.student_dimension_states;

ALTER TABLE public.curriculum_topics DROP COLUMN IF EXISTS required_dimensions_json;
