-- A volatile default assigns each course a random palette color once at INSERT.
-- Adding the column also assigns a saved color to each existing course.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS graph_color TEXT NOT NULL DEFAULT (
    (ARRAY['#2563eb','#c2410c','#047857','#9333ea','#be185d','#0e7490','#a16207','#475569'])
    [1 + floor(random() * 8)::integer]
) CONSTRAINT courses_graph_color_check CHECK (graph_color ~ '^#[0-9a-f]{6}$');
