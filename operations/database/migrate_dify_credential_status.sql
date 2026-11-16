-- Additive and repeatable: never re-enable an existing disabled credential.
ALTER TABLE dify_credentials ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;
