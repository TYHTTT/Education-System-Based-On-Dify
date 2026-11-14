-- Dify handles practice generation; local difficulty settings are retired.
ALTER TABLE practice_sets DROP COLUMN IF EXISTS requested_difficulty;
ALTER TABLE practice_questions DROP COLUMN IF EXISTS difficulty;
