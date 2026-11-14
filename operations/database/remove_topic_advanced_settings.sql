-- Retire unused knowledge-point settings and their stored data.
ALTER TABLE curriculum_topics
    DROP COLUMN IF EXISTS aliases_json,
    DROP COLUMN IF EXISTS retrieval_keywords_json,
    DROP COLUMN IF EXISTS difficulty;
