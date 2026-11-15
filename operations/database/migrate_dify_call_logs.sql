-- Additive upgrade; accounting history survives student/course/topic deletion.
CREATE TABLE IF NOT EXISTS dify_call_logs (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    credential_id TEXT REFERENCES dify_credentials(id),
    student_id TEXT,
    course_id TEXT,
    topic_id TEXT,
    business_type TEXT NOT NULL CHECK (business_type IN (
        'free_qa','topic_teaching','topic_clarification','topic_practice','topic_answer','diagnosis'
    )),
    is_anonymous BOOLEAN NOT NULL CHECK (is_anonymous = (student_id IS NULL)),
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ,
    duration_ms BIGINT CHECK (duration_ms >= 0),
    status TEXT NOT NULL CHECK (status IN ('in_progress','succeeded','failed','timeout','cancelled')),
    error_code TEXT CHECK (error_code IN (
        'unexpected_error','upstream_error','http_error','transport_error',
        'invalid_response','incomplete_response','timeout','cancelled'
    )),
    http_status INTEGER CHECK (http_status BETWEEN 100 AND 599),
    conversation_id TEXT,
    message_id TEXT,
    task_id TEXT,
    workflow_run_id TEXT,
    prompt_tokens BIGINT CHECK (prompt_tokens >= 0),
    completion_tokens BIGINT CHECK (completion_tokens >= 0),
    total_tokens BIGINT CHECK (total_tokens >= 0),
    total_price NUMERIC CHECK (total_price >= 0),
    currency TEXT,
    CHECK ((status='in_progress' AND finished_at IS NULL AND duration_ms IS NULL)
        OR (status<>'in_progress' AND finished_at IS NOT NULL AND duration_ms IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_dify_call_logs_time ON dify_call_logs(started_at DESC,id);
CREATE INDEX IF NOT EXISTS idx_dify_call_logs_credential_time ON dify_call_logs(credential_id,started_at DESC);
CREATE INDEX IF NOT EXISTS idx_dify_call_logs_request ON dify_call_logs(request_id);
