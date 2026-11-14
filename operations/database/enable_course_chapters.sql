-- Upgrade legacy stage-number chapters to immutable IDs and independent order.
CREATE TABLE IF NOT EXISTS course_chapters (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL CHECK (sort_order > 0),
    title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 100)
);

DO $migration$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='course_chapters' AND column_name='stage') THEN
        INSERT INTO course_chapters(course_id,stage,title)
        SELECT p.course_id,substring(p.parent_group_id FROM 7)::integer,min(p.group_title)
        FROM topic_placements p JOIN curriculum_topics t ON t.id=p.topic_id AND t.course=p.course_id
        WHERE p.parent_group_id ~ '^stage-[1-9][0-9]*$'
        GROUP BY p.course_id,p.parent_group_id ON CONFLICT DO NOTHING;
        ALTER TABLE course_chapters RENAME COLUMN stage TO sort_order;
        ALTER TABLE course_chapters ADD COLUMN id TEXT NOT NULL DEFAULT gen_random_uuid()::text;
        ALTER TABLE course_chapters DROP CONSTRAINT course_chapters_pkey;
        ALTER TABLE course_chapters ADD PRIMARY KEY(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='course_chapters'::regclass AND conname='course_chapters_id_course_key') THEN
        ALTER TABLE course_chapters ADD CONSTRAINT course_chapters_id_course_key UNIQUE(id,course_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='course_chapters'::regclass AND conname='course_chapters_course_order_key') THEN
        ALTER TABLE course_chapters ADD CONSTRAINT course_chapters_course_order_key UNIQUE(course_id,sort_order) DEFERRABLE INITIALLY DEFERRED;
    END IF;
END;
$migration$;

ALTER TABLE curriculum_topics ADD COLUMN IF NOT EXISTS chapter_id TEXT;

-- Preserve placement ownership first; fall back to legacy order for unplaced topics.
UPDATE curriculum_topics t SET chapter_id=c.id
FROM topic_placements p JOIN course_chapters c
    ON c.course_id=p.course_id AND p.parent_group_id='stage-'||c.sort_order::text
WHERE t.id=p.topic_id AND t.course=p.course_id AND t.chapter_id IS NULL;

INSERT INTO course_chapters(course_id,sort_order,title)
SELECT t.course,t.stage,min(t.stage_title) FROM curriculum_topics t
WHERE t.chapter_id IS NULL AND NOT EXISTS (
    SELECT 1 FROM course_chapters c WHERE c.course_id=t.course AND c.sort_order=t.stage
)
GROUP BY t.course,t.stage;

UPDATE curriculum_topics t SET chapter_id=c.id FROM course_chapters c
WHERE t.chapter_id IS NULL AND c.course_id=t.course AND c.sort_order=t.stage;

UPDATE curriculum_topics t SET stage=c.sort_order,stage_title=c.title
FROM course_chapters c WHERE c.id=t.chapter_id AND c.course_id=t.course
AND (t.stage<>c.sort_order OR t.stage_title<>c.title);

UPDATE topic_placements p SET parent_group_id=c.id,group_title=c.title
FROM curriculum_topics t JOIN course_chapters c ON c.id=t.chapter_id AND c.course_id=t.course
WHERE p.topic_id=t.id AND p.course_id=t.course AND (p.parent_group_id<>c.id OR p.group_title<>c.title);

ALTER TABLE curriculum_topics ALTER COLUMN chapter_id SET NOT NULL;

DO $migration$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='curriculum_topics'::regclass AND conname='curriculum_topics_chapter_course_fkey') THEN
        ALTER TABLE curriculum_topics ADD CONSTRAINT curriculum_topics_chapter_course_fkey
            FOREIGN KEY(chapter_id,course) REFERENCES course_chapters(id,course_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='curriculum_topics'::regclass AND conname='curriculum_topics_id_course_chapter_key') THEN
        ALTER TABLE curriculum_topics ADD CONSTRAINT curriculum_topics_id_course_chapter_key UNIQUE(id,course,chapter_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='topic_placements'::regclass AND conname='topic_placements_topic_chapter_fkey') THEN
        ALTER TABLE topic_placements ADD CONSTRAINT topic_placements_topic_chapter_fkey
            FOREIGN KEY(topic_id,course_id,parent_group_id) REFERENCES curriculum_topics(id,course,chapter_id)
            DEFERRABLE INITIALLY DEFERRED;
    END IF;
END;
$migration$;

CREATE INDEX IF NOT EXISTS idx_curriculum_topics_chapter ON curriculum_topics(chapter_id,active,order_index);
