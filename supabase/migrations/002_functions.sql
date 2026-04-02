-- Recipe matching stored procedure using pg_trgm similarity
-- Returns recipes whose key ingredients fuzzy-match current sale items

CREATE OR REPLACE FUNCTION get_recipes_matching_sale_items(
  p_store_ids  UUID[],
  p_week_of    DATE,
  p_gluten_free   BOOLEAN DEFAULT false,
  p_vegetarian    BOOLEAN DEFAULT false,
  p_vegan         BOOLEAN DEFAULT false,
  p_similarity_threshold FLOAT DEFAULT 0.4
)
RETURNS TABLE (
  recipe_id       UUID,
  title           TEXT,
  meal_type       TEXT,
  is_gluten_free  BOOLEAN,
  is_vegetarian   BOOLEAN,
  is_vegan        BOOLEAN,
  estimated_cost  NUMERIC,
  matched_items   INTEGER
)
LANGUAGE sql STABLE AS $$
  SELECT
    r.id          AS recipe_id,
    r.title,
    r.meal_type,
    r.is_gluten_free,
    r.is_vegetarian,
    r.is_vegan,
    r.estimated_cost,
    COUNT(DISTINCT si.id)::INTEGER AS matched_items
  FROM recipes r
  JOIN recipe_ingredients ri ON ri.recipe_id = r.id
  JOIN sale_items si
    ON si.store_id = ANY(p_store_ids)
   AND si.week_of = p_week_of
   AND similarity(ri.normalized_name, si.normalized_name) >= p_similarity_threshold
  WHERE ri.is_pantry_staple = false
    AND (NOT p_gluten_free OR r.is_gluten_free = true)
    AND (NOT p_vegetarian  OR r.is_vegetarian  = true)
    AND (NOT p_vegan       OR r.is_vegan       = true)
  GROUP BY r.id, r.title, r.meal_type, r.is_gluten_free, r.is_vegetarian, r.is_vegan, r.estimated_cost
  ORDER BY matched_items DESC, r.estimated_cost ASC
  LIMIT 200;
$$;


-- Synonym table for improving ingredient matching
CREATE TABLE IF NOT EXISTS ingredient_synonyms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name  TEXT NOT NULL,
  synonym         TEXT NOT NULL UNIQUE
);

CREATE INDEX idx_ingredient_synonyms_canonical ON ingredient_synonyms (canonical_name);

-- Seed common synonyms
INSERT INTO ingredient_synonyms (canonical_name, synonym) VALUES
  ('chicken breast', 'boneless skinless chicken breast'),
  ('chicken breast', 'chicken breast fillets'),
  ('chicken breast', 'boneless chicken breast'),
  ('ground beef', 'lean ground beef'),
  ('ground beef', 'ground chuck'),
  ('ground beef', '80/20 ground beef'),
  ('pork loin', 'pork tenderloin'),
  ('salmon', 'salmon fillet'),
  ('salmon', 'atlantic salmon'),
  ('shrimp', 'raw shrimp'),
  ('shrimp', 'medium shrimp'),
  ('milk', 'whole milk'),
  ('milk', '2% milk'),
  ('butter', 'unsalted butter'),
  ('butter', 'salted butter'),
  ('olive oil', 'extra virgin olive oil'),
  ('pasta', 'penne pasta'),
  ('pasta', 'spaghetti'),
  ('pasta', 'rotini'),
  ('rice', 'long grain white rice'),
  ('rice', 'jasmine rice'),
  ('broccoli', 'broccoli florets'),
  ('spinach', 'baby spinach'),
  ('tomatoes', 'roma tomatoes'),
  ('tomatoes', 'vine tomatoes'),
  ('onion', 'yellow onion'),
  ('onion', 'sweet onion'),
  ('bell pepper', 'red bell pepper'),
  ('bell pepper', 'green bell pepper'),
  ('potatoes', 'russet potatoes'),
  ('potatoes', 'yukon gold potatoes')
ON CONFLICT (synonym) DO NOTHING;
