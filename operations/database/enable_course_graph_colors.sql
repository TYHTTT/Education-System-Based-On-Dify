-- A volatile default assigns each course a random palette color once at INSERT.
-- Adding the column also assigns a saved color to each existing course.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS graph_color TEXT NOT NULL DEFAULT (
    (ARRAY['#a998e8','#75b9ae','#d4ad74','#7fa9d0','#ce91af','#aab874','#a0a8d7','#79b8c8'])
    [1 + floor(random() * 8)::integer]
) CONSTRAINT courses_graph_color_check CHECK (graph_color ~ '^#[0-9a-f]{6}$');
