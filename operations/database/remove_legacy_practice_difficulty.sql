-- Dify handles practice generation; local difficulty settings are retired.
ALTER TABLE IF EXISTS practice_sets DROP COLUMN IF EXISTS requested_difficulty;
ALTER TABLE IF EXISTS practice_questions DROP COLUMN IF EXISTS difficulty;
