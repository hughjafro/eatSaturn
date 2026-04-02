-- CartSpoon initial schema
-- Run in order; tables created in dependency order

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- STORES
-- ============================================================
CREATE TABLE stores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  chain_key     TEXT UNIQUE NOT NULL,
  scrape_url    TEXT NOT NULL,
  scrape_config JSONB NOT NULL DEFAULT '{}',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SALE ITEMS
-- ============================================================
CREATE TABLE sale_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  week_of          DATE NOT NULL,
  product_name     TEXT NOT NULL,
  category         TEXT,
  unit             TEXT,
  sale_price       NUMERIC(8,2),
  regular_price    NUMERIC(8,2),
  discount_pct     NUMERIC(5,2),
  raw_description  TEXT,
  image_url        TEXT,
  normalized_name  TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, week_of, normalized_name)
);

CREATE INDEX idx_sale_items_store_week ON sale_items (store_id, week_of);
CREATE INDEX idx_sale_items_normalized ON sale_items USING GIN (normalized_name gin_trgm_ops);
CREATE INDEX idx_sale_items_category   ON sale_items (category, week_of);

-- Auto-compute discount_pct on insert/update
CREATE OR REPLACE FUNCTION compute_discount_pct()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.regular_price IS NOT NULL AND NEW.regular_price > 0 AND NEW.sale_price IS NOT NULL THEN
    NEW.discount_pct := ROUND(((NEW.regular_price - NEW.sale_price) / NEW.regular_price) * 100, 2);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trig_sale_items_discount_pct
  BEFORE INSERT OR UPDATE ON sale_items
  FOR EACH ROW EXECUTE FUNCTION compute_discount_pct();

-- ============================================================
-- RECIPES
-- ============================================================
CREATE TABLE recipes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT NOT NULL,
  description         TEXT,
  servings            INTEGER,
  prep_time_minutes   INTEGER,
  cook_time_minutes   INTEGER,
  instructions        TEXT[],
  cuisine_type        TEXT,
  meal_type           TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
  is_gluten_free      BOOLEAN NOT NULL DEFAULT false,
  is_vegetarian       BOOLEAN NOT NULL DEFAULT false,
  is_vegan            BOOLEAN NOT NULL DEFAULT false,
  estimated_cost      NUMERIC(6,2),
  image_url           TEXT,
  source              TEXT NOT NULL DEFAULT 'internal',
  external_id         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);

CREATE INDEX idx_recipes_dietary   ON recipes (is_gluten_free, is_vegetarian, is_vegan);
CREATE INDEX idx_recipes_meal_type ON recipes (meal_type);

-- ============================================================
-- RECIPE INGREDIENTS
-- ============================================================
CREATE TABLE recipe_ingredients (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id        UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_name  TEXT NOT NULL,
  normalized_name  TEXT NOT NULL,
  quantity         NUMERIC(8,3),
  unit             TEXT,
  is_pantry_staple BOOLEAN NOT NULL DEFAULT false,
  estimated_cost   NUMERIC(6,2)
);

CREATE INDEX idx_recipe_ingredients_recipe     ON recipe_ingredients (recipe_id);
CREATE INDEX idx_recipe_ingredients_normalized ON recipe_ingredients USING GIN (normalized_name gin_trgm_ops);

-- ============================================================
-- USERS  (mirrors auth.users.id)
-- ============================================================
CREATE TABLE users (
  id                 UUID PRIMARY KEY,
  email              TEXT UNIQUE NOT NULL,
  tier               TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'premium')),
  household_size     INTEGER NOT NULL DEFAULT 1,
  stripe_customer_id TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trig_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- USER PREFERENCES
-- ============================================================
CREATE TABLE user_preferences (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  preferred_store_ids  UUID[] NOT NULL DEFAULT '{}',
  dietary_restrictions TEXT[] NOT NULL DEFAULT '{}',
  disliked_ingredients TEXT[] NOT NULL DEFAULT '{}',
  cuisine_preferences  TEXT[] NOT NULL DEFAULT '{}',
  notification_day     TEXT NOT NULL DEFAULT 'sunday',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trig_user_prefs_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- MEAL PLANS
-- ============================================================
CREATE TABLE meal_plans (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_of          DATE NOT NULL,
  store_ids        UUID[] NOT NULL,
  total_cost       NUMERIC(8,2),
  is_premium_plan  BOOLEAN NOT NULL DEFAULT false,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  llm_model_used   TEXT,
  llm_summary      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_of)
);

CREATE INDEX idx_meal_plans_user_week ON meal_plans (user_id, week_of);

-- ============================================================
-- MEAL PLAN DAYS
-- ============================================================
CREATE TABLE meal_plan_days (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_id  UUID NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  day_of_week   INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  meal_type     TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
  recipe_id     UUID NOT NULL REFERENCES recipes(id),
  servings      INTEGER NOT NULL DEFAULT 1,
  notes         TEXT,
  UNIQUE (meal_plan_id, day_of_week, meal_type)
);

CREATE INDEX idx_meal_plan_days_plan ON meal_plan_days (meal_plan_id);

-- ============================================================
-- SHOPPING LISTS
-- ============================================================
CREATE TABLE shopping_lists (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_id  UUID NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE UNIQUE,
  total_cost    NUMERIC(8,2),
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SHOPPING LIST ITEMS
-- ============================================================
CREATE TABLE shopping_list_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopping_list_id  UUID NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  ingredient_name   TEXT NOT NULL,
  quantity          NUMERIC(8,3),
  unit              TEXT,
  sale_item_id      UUID REFERENCES sale_items(id),
  on_sale           BOOLEAN NOT NULL DEFAULT false,
  sale_price        NUMERIC(8,2),
  regular_price     NUMERIC(8,2),
  store_id          UUID REFERENCES stores(id),
  aisle_category    TEXT
);

CREATE INDEX idx_shopping_list_items_list ON shopping_list_items (shopping_list_id);

-- ============================================================
-- LLM USAGE LOG
-- ============================================================
CREATE TABLE llm_usage_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  logged_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  model          TEXT NOT NULL,
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  cached_tokens  INTEGER NOT NULL DEFAULT 0,
  cost_usd       NUMERIC(10,6) NOT NULL DEFAULT 0,
  user_tier      TEXT,
  meal_plan_id   UUID REFERENCES meal_plans(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_llm_usage_log_date ON llm_usage_log (logged_date);
