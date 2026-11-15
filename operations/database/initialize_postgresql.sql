-- Current schema for new installations.
CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    display_name TEXT,
    password_hash TEXT,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL,
    last_active_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS administrators (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    session_token_hash TEXT UNIQUE,
    session_expires_at TEXT,
    created_at TEXT NOT NULL,
    last_active_at TEXT NOT NULL,
    CHECK ((session_token_hash IS NULL) = (session_expires_at IS NULL))
);

CREATE TABLE IF NOT EXISTS student_sessions (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_used_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dify_credentials (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    api_base_url TEXT NOT NULL,
    key_fingerprint TEXT NOT NULL CHECK (key_fingerprint ~ '^[0-9a-f]{64}$'),
    api_key_encrypted TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (api_base_url, key_fingerprint)
);

CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    description TEXT NOT NULL DEFAULT '',
    completion_threshold DOUBLE PRECISION NOT NULL DEFAULT 80 CHECK (completion_threshold >= 0 AND completion_threshold <= 100),
    dify_api_base_url TEXT NOT NULL DEFAULT 'https://api.dify.ai/v1',
    dify_api_key_encrypted TEXT,
    dify_credential_id TEXT REFERENCES dify_credentials(id),
    graph_color TEXT NOT NULL DEFAULT (
        (ARRAY['#2563eb','#c2410c','#047857','#9333ea','#be185d','#0e7490','#a16207','#475569'])
        [1 + floor(random() * 8)::integer]
    ) CONSTRAINT courses_graph_color_check CHECK (graph_color ~ '^#[0-9a-f]{6}$'),
    created_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"'),
    updated_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"')
);

INSERT INTO courses(id, title, description) VALUES
    ('machine_learning', '机器学习', '模型、算法与实践'),
    ('advanced_mathematics', '高等数学', '极限、微积分与定理'),
    ('linear_algebra', '线性代数', '向量、矩阵与几何'),
    ('probability_statistics', '概率论与统计基础', '概率、分布与统计')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS dify_free_qa_settings (
    id INTEGER PRIMARY KEY CHECK (id=1),
    api_base_url TEXT NOT NULL DEFAULT 'https://api.dify.ai/v1',
    api_key_encrypted TEXT,
    dify_credential_id TEXT REFERENCES dify_credentials(id),
    updated_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"')
);
INSERT INTO dify_free_qa_settings(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS course_chapters (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL CHECK (sort_order > 0),
    title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 100),
    CONSTRAINT course_chapters_id_course_key UNIQUE(id,course_id),
    CONSTRAINT course_chapters_course_order_key UNIQUE(course_id,sort_order) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS curriculum_topics (
    id TEXT PRIMARY KEY,
    course TEXT NOT NULL REFERENCES courses(id),
    chapter_id TEXT NOT NULL,
    title TEXT NOT NULL,
    order_index INTEGER NOT NULL CHECK (order_index > 0),
    description TEXT NOT NULL,
    learning_objectives_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CONSTRAINT curriculum_topics_chapter_course_fkey FOREIGN KEY(chapter_id,course) REFERENCES course_chapters(id,course_id)
);

-- Undirected related-topic edges.
CREATE TABLE IF NOT EXISTS topic_relations (
    topic_a_id TEXT NOT NULL REFERENCES curriculum_topics(id) ON DELETE CASCADE,
    topic_b_id TEXT NOT NULL REFERENCES curriculum_topics(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL DEFAULT 'related' CHECK (relation_type = 'related'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (topic_a_id, topic_b_id, relation_type),
    CHECK (topic_a_id < topic_b_id)
);
CREATE INDEX IF NOT EXISTS idx_topic_relations_b ON topic_relations(topic_b_id);

CREATE TABLE IF NOT EXISTS student_topic_states (
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    topic_id TEXT NOT NULL REFERENCES curriculum_topics(id) ON DELETE CASCADE,
    mastery REAL CHECK (mastery BETWEEN 0 AND 1),
    evidence_count INTEGER NOT NULL DEFAULT 0 CHECK (evidence_count >= 0), attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    latest_score REAL, best_score REAL,
    status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'learning', 'mastered')),
    started_at TEXT, last_practiced_at TEXT, mastered_at TEXT, updated_at TEXT NOT NULL,
    PRIMARY KEY (student_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_curriculum_topics_chapter ON curriculum_topics(chapter_id,order_index);

CREATE INDEX IF NOT EXISTS idx_curriculum_topics_course_chapter_order ON curriculum_topics(course, chapter_id, order_index);
CREATE INDEX IF NOT EXISTS idx_student_topic_states_topic_status ON student_topic_states(topic_id, status);
CREATE INDEX IF NOT EXISTS idx_student_topic_states_student_status ON student_topic_states(student_id, status);

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
