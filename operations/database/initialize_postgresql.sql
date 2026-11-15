-- Fresh installations only. Existing retired objects can be removed with
-- cleanup_retired.py --apply (automatic backup and transactional verification).
CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    display_name TEXT,
    password_hash TEXT,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL,
    last_active_at TEXT NOT NULL
);

ALTER TABLE students ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1));

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

CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    title TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    description TEXT NOT NULL DEFAULT '',
    completion_threshold DOUBLE PRECISION NOT NULL DEFAULT 80 CHECK (completion_threshold >= 0 AND completion_threshold <= 100),
    dify_api_base_url TEXT NOT NULL DEFAULT 'https://api.dify.ai/v1',
    dify_api_key_encrypted TEXT,
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
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    stage INTEGER NOT NULL CHECK (stage > 0),
    stage_title TEXT NOT NULL,
    order_index INTEGER NOT NULL CHECK (order_index > 0),
    description TEXT NOT NULL,
    learning_objectives_json TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(course, slug),
    CONSTRAINT curriculum_topics_id_course_key UNIQUE(id, course),
    CONSTRAINT curriculum_topics_id_course_chapter_key UNIQUE(id,course,chapter_id),
    CONSTRAINT curriculum_topics_chapter_course_fkey FOREIGN KEY(chapter_id,course) REFERENCES course_chapters(id,course_id)
);

-- Undirected related-topic edges, independent of course directory placements.
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
    alpha REAL NOT NULL DEFAULT 1 CHECK (alpha > 0), beta REAL NOT NULL DEFAULT 1 CHECK (beta > 0),
    mastery REAL NOT NULL DEFAULT 0.5 CHECK (mastery BETWEEN 0 AND 1), confidence REAL NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
    evidence_count INTEGER NOT NULL DEFAULT 0 CHECK (evidence_count >= 0), attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    practice_set_count INTEGER NOT NULL DEFAULT 0 CHECK (practice_set_count >= 0), checkpoint_count INTEGER NOT NULL DEFAULT 0 CHECK (checkpoint_count >= 0),
    latest_score REAL, best_score REAL, latest_checkpoint_score REAL,
    status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'learning', 'practicing', 'needs_remediation', 'ready_for_checkpoint', 'mastered')),
    started_at TEXT, last_practiced_at TEXT, mastered_at TEXT, updated_at TEXT NOT NULL,
    PRIMARY KEY (student_id, topic_id)
);

CREATE TABLE IF NOT EXISTS learning_sessions (
    id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    course TEXT NOT NULL REFERENCES courses(id),
    topic_id TEXT REFERENCES curriculum_topics(id) ON DELETE SET NULL, state TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS topic_placements (
    course_id TEXT NOT NULL REFERENCES courses(id), topic_id TEXT NOT NULL,
    parent_group_id TEXT NOT NULL, group_title TEXT NOT NULL, order_index INTEGER NOT NULL,
    PRIMARY KEY(course_id, topic_id),
    CONSTRAINT topic_placements_topic_course_fkey FOREIGN KEY(topic_id, course_id) REFERENCES curriculum_topics(id, course),
    CONSTRAINT topic_placements_topic_chapter_fkey FOREIGN KEY(topic_id,course_id,parent_group_id) REFERENCES curriculum_topics(id,course,chapter_id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS idx_curriculum_topics_chapter ON curriculum_topics(chapter_id,active,order_index);

CREATE INDEX IF NOT EXISTS idx_curriculum_topics_course_stage_order ON curriculum_topics(course, active, stage, order_index);
CREATE INDEX IF NOT EXISTS idx_student_topic_states_topic_status ON student_topic_states(topic_id, status);
CREATE INDEX IF NOT EXISTS idx_student_topic_states_student_status ON student_topic_states(student_id, status);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_student_course_updated ON learning_sessions(student_id, course, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_sessions_token_hash ON student_sessions(token_hash);

CREATE OR REPLACE FUNCTION enforce_registered_course() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM courses WHERE id = NEW.course) THEN
        RAISE EXCEPTION 'unregistered_course';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_curriculum_registered_course ON curriculum_topics;
CREATE TRIGGER trg_curriculum_registered_course BEFORE INSERT OR UPDATE ON curriculum_topics
FOR EACH ROW EXECUTE FUNCTION enforce_registered_course();
