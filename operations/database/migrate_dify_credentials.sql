-- Additive upgrade: preserve all existing settings and encrypted keys.
CREATE TABLE IF NOT EXISTS dify_credentials (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    api_base_url TEXT NOT NULL,
    key_fingerprint TEXT NOT NULL CHECK (key_fingerprint ~ '^[0-9a-f]{64}$'),
    api_key_encrypted TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (api_base_url, key_fingerprint)
);

ALTER TABLE courses ADD COLUMN IF NOT EXISTS dify_credential_id TEXT REFERENCES dify_credentials(id);
ALTER TABLE dify_free_qa_settings ADD COLUMN IF NOT EXISTS dify_credential_id TEXT REFERENCES dify_credentials(id);
