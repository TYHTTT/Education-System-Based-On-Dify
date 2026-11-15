ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS completion_threshold DOUBLE PRECISION NOT NULL DEFAULT 80
        CHECK (completion_threshold >= 0 AND completion_threshold <= 100),
    ADD COLUMN IF NOT EXISTS dify_api_base_url TEXT NOT NULL DEFAULT 'https://api.dify.ai/v1',
    ADD COLUMN IF NOT EXISTS dify_api_key_encrypted TEXT;

CREATE TABLE IF NOT EXISTS dify_free_qa_settings (
    id INTEGER PRIMARY KEY CHECK (id=1),
    api_base_url TEXT NOT NULL DEFAULT 'https://api.dify.ai/v1',
    api_key_encrypted TEXT,
    updated_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"')
);
INSERT INTO dify_free_qa_settings(id) VALUES (1) ON CONFLICT (id) DO NOTHING;
