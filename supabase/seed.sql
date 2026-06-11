-- ============================================================
-- Custom Canvas — Seed Data
-- ============================================================

-- Tags: medium, style, subject, mood
INSERT INTO tags (name, category) VALUES
  -- Medium
  ('Oil Paint', 'medium'),
  ('Acrylic', 'medium'),
  ('Watercolor', 'medium'),
  ('Charcoal', 'medium'),
  ('Digital', 'medium'),
  ('Mixed Media', 'medium'),
  ('Sculpture', 'medium'),
  ('Photography', 'medium'),
  ('Ink', 'medium'),
  ('Pastel', 'medium'),
  ('Ceramics', 'medium'),
  ('Printmaking', 'medium'),
  ('Textile', 'medium'),
  ('Collage', 'medium'),
  -- Style
  ('Abstract', 'style'),
  ('Realism', 'style'),
  ('Impressionism', 'style'),
  ('Contemporary', 'style'),
  ('Minimalist', 'style'),
  ('Pop Art', 'style'),
  ('Surrealism', 'style'),
  ('Street Art', 'style'),
  ('Expressionism', 'style'),
  ('Figurative', 'style'),
  -- Subject
  ('Portrait', 'subject'),
  ('Landscape', 'subject'),
  ('Still Life', 'subject'),
  ('Figure', 'subject'),
  ('Urban', 'subject'),
  ('Nature', 'subject'),
  ('Conceptual', 'subject'),
  ('Political', 'subject'),
  ('Botanical', 'subject'),
  ('Architectural', 'subject'),
  -- Mood
  ('Serene', 'mood'),
  ('Bold', 'mood'),
  ('Melancholic', 'mood'),
  ('Vibrant', 'mood'),
  ('Dark', 'mood'),
  ('Playful', 'mood'),
  ('Ethereal', 'mood'),
  ('Raw', 'mood'),
  ('Nostalgic', 'mood'),
  ('Intimate', 'mood')
ON CONFLICT (name) DO NOTHING;
