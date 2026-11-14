-- Course lists are ordered by title and ID; chapter ordering is independent.
ALTER TABLE courses DROP COLUMN IF EXISTS sort_order;
