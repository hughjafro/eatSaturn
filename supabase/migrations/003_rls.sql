-- Row-Level Security policies for all tables

-- ============================================================
-- Enable RLS
-- ============================================================
ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences   ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plan_days     ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_lists     ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_usage_log      ENABLE ROW LEVEL SECURITY;

-- Public-read tables (no RLS needed for SELECT; write restricted to service role)
ALTER TABLE stores             ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_synonyms ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PUBLIC READ-ONLY TABLES
-- ============================================================
CREATE POLICY "stores: public read"
  ON stores FOR SELECT USING (true);

CREATE POLICY "sale_items: public read"
  ON sale_items FOR SELECT USING (true);

CREATE POLICY "recipes: public read"
  ON recipes FOR SELECT USING (true);

CREATE POLICY "recipe_ingredients: public read"
  ON recipe_ingredients FOR SELECT USING (true);

CREATE POLICY "ingredient_synonyms: public read"
  ON ingredient_synonyms FOR SELECT USING (true);

-- Service role can do anything (bypasses RLS automatically for service_role key)

-- ============================================================
-- USERS
-- ============================================================
CREATE POLICY "users: own row select"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users: own row update"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Insert handled by service role on signup webhook

-- ============================================================
-- USER PREFERENCES
-- ============================================================
CREATE POLICY "user_preferences: own row select"
  ON user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_preferences: own row insert"
  ON user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_preferences: own row update"
  ON user_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- MEAL PLANS
-- ============================================================
CREATE POLICY "meal_plans: own row select"
  ON meal_plans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "meal_plans: own row insert"
  ON meal_plans FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND (
      is_premium_plan = false OR
      EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND tier = 'premium')
    )
  );

CREATE POLICY "meal_plans: own row update"
  ON meal_plans FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================
-- MEAL PLAN DAYS
-- ============================================================
CREATE POLICY "meal_plan_days: own plan select"
  ON meal_plan_days FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM meal_plans WHERE id = meal_plan_id AND user_id = auth.uid())
  );

CREATE POLICY "meal_plan_days: own plan insert"
  ON meal_plan_days FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM meal_plans WHERE id = meal_plan_id AND user_id = auth.uid())
  );

-- ============================================================
-- SHOPPING LISTS
-- ============================================================
CREATE POLICY "shopping_lists: own plan select"
  ON shopping_lists FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM meal_plans WHERE id = meal_plan_id AND user_id = auth.uid())
  );

CREATE POLICY "shopping_lists: own plan insert"
  ON shopping_lists FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM meal_plans WHERE id = meal_plan_id AND user_id = auth.uid())
  );

-- ============================================================
-- SHOPPING LIST ITEMS
-- ============================================================
CREATE POLICY "shopping_list_items: own list select"
  ON shopping_list_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM shopping_lists sl
      JOIN meal_plans mp ON mp.id = sl.meal_plan_id
      WHERE sl.id = shopping_list_id AND mp.user_id = auth.uid()
    )
  );

CREATE POLICY "shopping_list_items: own list insert"
  ON shopping_list_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM shopping_lists sl
      JOIN meal_plans mp ON mp.id = sl.meal_plan_id
      WHERE sl.id = shopping_list_id AND mp.user_id = auth.uid()
    )
  );

-- ============================================================
-- LLM USAGE LOG (service role only — no user access)
-- ============================================================
-- No user-facing policies; only service_role key can write/read
