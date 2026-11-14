-- Preserve existing immutable IDs, foreign keys and browser chat scopes.
-- Newly created courses use UUIDs, matching the chapter identity scheme.
ALTER TABLE courses ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
