#!/usr/bin/env bash
# =============================================================================
# CartSpoon — Seed Test Data
# =============================================================================
# Populates the local Supabase DB with realistic test data for development.
# Includes: test user, sale items for all 3 stores, and a sample meal plan.
#
# Usage: bash scripts/seed-test-data.sh [--reset]
#
# Flags:
#   --reset    Drop all user data before seeding (keeps stores + recipes)
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

step() { echo -e "\n${BLUE}▶ $1${NC}"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }

RESET=false
for arg in "$@"; do
  case $arg in --reset) RESET=true ;; esac
done

# ── Check local Supabase is running ───────────────────────────────────────────
step "Checking Supabase"
if ! npx supabase status 2>/dev/null | grep -q "API URL"; then
  echo "Local Supabase not running. Start it with:"
  echo "  cd supabase && npx supabase start"
  exit 1
fi

DB_URL="postgresql://postgres:postgres@localhost:54322/postgres"
PSQL="psql $DB_URL"
ok "Supabase running"

# ── Optional reset ────────────────────────────────────────────────────────────
if [ "$RESET" = true ]; then
  step "Resetting user data (keeping stores + recipes)"
  $PSQL << 'SQL'
TRUNCATE TABLE
  shopping_list_items,
  shopping_lists,
  meal_plan_days,
  meal_plans,
  user_preferences,
  users,
  llm_usage_log
CASCADE;
SQL
  ok "User data cleared"
fi

# ── Get current week Monday ───────────────────────────────────────────────────
WEEK_OF=$($PSQL -t -c "SELECT (date_trunc('week', now()) + INTERVAL '1 day')::date;" 2>/dev/null | tr -d ' \n')
ok "Week of: $WEEK_OF"

# ── Seed sale items ───────────────────────────────────────────────────────────
step "Seeding sale items for all 3 stores"

$PSQL << SQL
-- Get store IDs
DO \$\$
DECLARE
  kroger_id UUID;
  safeway_id UUID;
  aldi_id UUID;
BEGIN

SELECT id INTO kroger_id FROM stores WHERE chain_key = 'kroger' LIMIT 1;
SELECT id INTO safeway_id FROM stores WHERE chain_key = 'safeway' LIMIT 1;
SELECT id INTO aldi_id    FROM stores WHERE chain_key = 'aldi'    LIMIT 1;

IF kroger_id IS NULL THEN
  RAISE EXCEPTION 'Kroger store not found. Run migrations first.';
END IF;

-- ── Kroger sale items ──
INSERT INTO sale_items
  (store_id, week_of, product_name, normalized_name, category, unit, sale_price, regular_price)
VALUES
  (kroger_id, '$WEEK_OF', 'Boneless Skinless Chicken Breast', 'chicken breast', 'meat', 'lb', 1.99, 3.49),
  (kroger_id, '$WEEK_OF', 'Ground Beef 80/20', 'ground beef', 'meat', 'lb', 3.99, 5.49),
  (kroger_id, '$WEEK_OF', 'Salmon Fillet', 'salmon', 'meat', 'lb', 5.99, 8.99),
  (kroger_id, '$WEEK_OF', 'Broccoli Crowns', 'broccoli', 'produce', 'lb', 0.99, 1.49),
  (kroger_id, '$WEEK_OF', 'Baby Spinach 5oz', 'spinach', 'produce', 'oz', 2.99, 4.49),
  (kroger_id, '$WEEK_OF', 'Roma Tomatoes', 'tomatoes', 'produce', 'lb', 0.79, 1.29),
  (kroger_id, '$WEEK_OF', 'Yellow Onions 3lb Bag', 'onion', 'produce', 'lb', 1.49, 2.49),
  (kroger_id, '$WEEK_OF', 'Russet Potatoes 5lb', 'potatoes', 'produce', 'lb', 2.49, 3.99),
  (kroger_id, '$WEEK_OF', 'Whole Milk Gallon', 'milk', 'dairy', 'gal', 2.99, 4.29),
  (kroger_id, '$WEEK_OF', 'Large Eggs Dozen', 'eggs', 'dairy', 'ct', 2.49, 3.99),
  (kroger_id, '$WEEK_OF', 'Shredded Cheddar Cheese 8oz', 'cheese', 'dairy', 'oz', 2.49, 3.79),
  (kroger_id, '$WEEK_OF', 'Greek Yogurt 32oz', 'yogurt', 'dairy', 'oz', 3.99, 5.49),
  (kroger_id, '$WEEK_OF', 'Pasta Penne 16oz', 'pasta', 'pantry', 'oz', 0.99, 1.49),
  (kroger_id, '$WEEK_OF', 'Long Grain White Rice 2lb', 'rice', 'pantry', 'lb', 1.99, 2.99),
  (kroger_id, '$WEEK_OF', 'Chicken Broth 32oz', 'broth', 'pantry', 'oz', 1.99, 2.79),
  (kroger_id, '$WEEK_OF', 'Canned Diced Tomatoes 14.5oz', 'canned tomatoes', 'pantry', 'oz', 0.89, 1.29),
  (kroger_id, '$WEEK_OF', 'Frozen Broccoli 12oz', 'frozen broccoli', 'frozen', 'oz', 1.49, 2.29),
  (kroger_id, '$WEEK_OF', 'Orange Juice 52oz', 'juice', 'beverages', 'oz', 3.49, 4.99),
  (kroger_id, '$WEEK_OF', 'Whole Wheat Bread', 'bread', 'bakery', null, 2.49, 3.49),
  (kroger_id, '$WEEK_OF', 'Black Beans 15oz Can', 'bean', 'pantry', 'oz', 0.79, 1.19),
  (kroger_id, '$WEEK_OF', 'Sweet Corn 4 Pack', 'corn', 'produce', 'ct', 1.99, 2.99),
  (kroger_id, '$WEEK_OF', 'Avocados 4 Pack', 'avocado', 'produce', 'ct', 3.99, 5.99),
  (kroger_id, '$WEEK_OF', 'Lean Ground Turkey 1lb', 'turkey', 'meat', 'lb', 3.49, 4.99),
  (kroger_id, '$WEEK_OF', 'Butter Unsalted 4 sticks', 'butter', 'dairy', null, 3.99, 5.49),
  (kroger_id, '$WEEK_OF', 'Baby Carrots 1lb Bag', 'carrot', 'produce', 'lb', 0.99, 1.49)
ON CONFLICT (store_id, week_of, normalized_name) DO UPDATE
  SET sale_price = EXCLUDED.sale_price,
      regular_price = EXCLUDED.regular_price;

-- ── Safeway sale items ──
INSERT INTO sale_items
  (store_id, week_of, product_name, normalized_name, category, unit, sale_price, regular_price)
VALUES
  (safeway_id, '$WEEK_OF', 'Pork Tenderloin', 'pork loin', 'meat', 'lb', 2.99, 4.99),
  (safeway_id, '$WEEK_OF', 'Tilapia Fillets', 'tilapia', 'meat', 'lb', 4.99, 7.49),
  (safeway_id, '$WEEK_OF', 'Shrimp 16-20 Count', 'shrimp', 'meat', 'lb', 7.99, 11.99),
  (safeway_id, '$WEEK_OF', 'Bell Peppers 3 Pack', 'bell pepper', 'produce', 'ct', 2.99, 4.49),
  (safeway_id, '$WEEK_OF', 'Strawberries 1lb', 'strawberry', 'produce', 'lb', 2.99, 4.49),
  (safeway_id, '$WEEK_OF', 'Bananas', 'banana', 'produce', 'lb', 0.39, 0.59),
  (safeway_id, '$WEEK_OF', 'Cucumber', 'cucumber', 'produce', null, 0.79, 1.29),
  (safeway_id, '$WEEK_OF', '2% Milk Half Gallon', 'milk', 'dairy', 'qt', 1.99, 2.99),
  (safeway_id, '$WEEK_OF', 'Sour Cream 16oz', 'sour cream', 'dairy', 'oz', 1.99, 2.79),
  (safeway_id, '$WEEK_OF', 'Flour Tortillas 10 Count', 'tortilla', 'bakery', 'ct', 2.49, 3.49),
  (safeway_id, '$WEEK_OF', 'Spaghetti 16oz', 'pasta', 'pantry', 'oz', 1.29, 1.89),
  (safeway_id, '$WEEK_OF', 'Olive Oil 16oz', 'olive oil', 'pantry', 'oz', 4.99, 6.99),
  (safeway_id, '$WEEK_OF', 'Canned Black Beans', 'bean', 'pantry', 'oz', 0.69, 1.09),
  (safeway_id, '$WEEK_OF', 'Tomato Sauce 15oz', 'sauce', 'pantry', 'oz', 0.99, 1.49),
  (safeway_id, '$WEEK_OF', 'Frozen Peas 12oz', 'frozen peas', 'frozen', 'oz', 1.29, 1.99),
  (safeway_id, '$WEEK_OF', 'Apple Juice 64oz', 'juice', 'beverages', 'oz', 2.99, 4.29),
  (safeway_id, '$WEEK_OF', 'Zucchini', 'zucchini', 'produce', 'lb', 0.99, 1.49),
  (safeway_id, '$WEEK_OF', 'Sweet Potatoes', 'potatoes', 'produce', 'lb', 0.99, 1.79),
  (safeway_id, '$WEEK_OF', 'Cottage Cheese 16oz', 'cottage cheese', 'dairy', 'oz', 2.99, 3.99),
  (safeway_id, '$WEEK_OF', 'Brown Rice 2lb', 'rice', 'pantry', 'lb', 2.49, 3.49),
  (safeway_id, '$WEEK_OF', 'Lemon', 'lemon', 'produce', 'ct', 0.49, 0.79),
  (safeway_id, '$WEEK_OF', 'Kale Bunch', 'kale', 'produce', null, 1.49, 2.29),
  (safeway_id, '$WEEK_OF', 'Turkey Breast Deli Sliced', 'turkey', 'meat', 'lb', 5.99, 7.99),
  (safeway_id, '$WEEK_OF', 'Cream Cheese 8oz', 'cream cheese', 'dairy', 'oz', 2.49, 3.49),
  (safeway_id, '$WEEK_OF', 'Sourdough Bread Loaf', 'bread', 'bakery', null, 3.49, 4.99)
ON CONFLICT (store_id, week_of, normalized_name) DO UPDATE
  SET sale_price = EXCLUDED.sale_price,
      regular_price = EXCLUDED.regular_price;

-- ── Aldi sale items ──
INSERT INTO sale_items
  (store_id, week_of, product_name, normalized_name, category, unit, sale_price, regular_price)
VALUES
  (aldi_id, '$WEEK_OF', 'Chicken Thighs Bone-In', 'chicken', 'meat', 'lb', 1.29, 1.99),
  (aldi_id, '$WEEK_OF', 'Atlantic Salmon 1lb', 'salmon', 'meat', 'lb', 5.49, 7.99),
  (aldi_id, '$WEEK_OF', 'Bagged Salad Mix', 'lettuce', 'produce', 'oz', 1.49, 2.29),
  (aldi_id, '$WEEK_OF', 'Blueberries Pint', 'blueberry', 'produce', null, 1.99, 3.49),
  (aldi_id, '$WEEK_OF', 'Grapes Red Seedless', 'grape', 'produce', 'lb', 1.99, 2.99),
  (aldi_id, '$WEEK_OF', 'Apples Gala 3lb Bag', 'apple', 'produce', 'lb', 2.49, 3.99),
  (aldi_id, '$WEEK_OF', 'Whole Milk Gallon', 'milk', 'dairy', 'gal', 2.79, 3.99),
  (aldi_id, '$WEEK_OF', 'Eggs 18 Count', 'eggs', 'dairy', 'ct', 3.29, 4.99),
  (aldi_id, '$WEEK_OF', 'Mozzarella Cheese 16oz', 'cheese', 'dairy', 'oz', 3.49, 4.99),
  (aldi_id, '$WEEK_OF', 'Rotini Pasta 16oz', 'pasta', 'pantry', 'oz', 0.85, 1.29),
  (aldi_id, '$WEEK_OF', 'Jasmine Rice 2lb', 'rice', 'pantry', 'lb', 2.29, 3.29),
  (aldi_id, '$WEEK_OF', 'Vegetable Broth 32oz', 'broth', 'pantry', 'oz', 1.69, 2.49),
  (aldi_id, '$WEEK_OF', 'Oats Old Fashioned 42oz', 'oat', 'pantry', 'oz', 2.49, 3.49),
  (aldi_id, '$WEEK_OF', 'Peanut Butter 16oz', 'peanut butter', 'pantry', 'oz', 1.99, 2.99),
  (aldi_id, '$WEEK_OF', 'Frozen Mixed Vegetables 12oz', 'frozen', 'frozen', 'oz', 1.19, 1.79),
  (aldi_id, '$WEEK_OF', 'Orange Juice 52oz', 'juice', 'beverages', 'oz', 2.99, 4.49),
  (aldi_id, '$WEEK_OF', 'Cauliflower Head', 'broccoli', 'produce', null, 1.99, 2.99),
  (aldi_id, '$WEEK_OF', 'Yellow Onion 3lb', 'onion', 'produce', 'lb', 1.29, 1.99),
  (aldi_id, '$WEEK_OF', 'Garlic Bulb 3 Pack', 'garlic', 'produce', 'ct', 0.99, 1.49),
  (aldi_id, '$WEEK_OF', 'Sliced Almonds 6oz', 'almond', 'pantry', 'oz', 2.99, 3.99),
  (aldi_id, '$WEEK_OF', 'Peaches 2lb', 'peach', 'produce', 'lb', 1.99, 2.99),
  (aldi_id, '$WEEK_OF', 'Ground Chicken 1lb', 'chicken', 'meat', 'lb', 2.99, 4.49),
  (aldi_id, '$WEEK_OF', 'Whole Grain Bread', 'bread', 'bakery', null, 2.29, 3.29),
  (aldi_id, '$WEEK_OF', 'Baby Bella Mushrooms 8oz', 'mushroom', 'produce', 'oz', 1.99, 2.79),
  (aldi_id, '$WEEK_OF', 'Low-Fat Greek Yogurt 32oz', 'yogurt', 'dairy', 'oz', 3.49, 4.99)
ON CONFLICT (store_id, week_of, normalized_name) DO UPDATE
  SET sale_price = EXCLUDED.sale_price,
      regular_price = EXCLUDED.regular_price;

END \$\$;
SQL

ok "Sale items seeded (25 per store, 75 total)"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Test data seeded successfully!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo "Sale items seeded for week of: $WEEK_OF"
echo ""
echo "Verify in Supabase Studio (http://localhost:54323):"
echo "  SELECT s.name, COUNT(si.id)"
echo "  FROM stores s JOIN sale_items si ON si.store_id = s.id"
echo "  WHERE si.week_of = '$WEEK_OF'"
echo "  GROUP BY s.name;"
echo ""
echo "Next: seed recipes if not done yet:"
echo "  cd apps/scraper && poetry run python -m src.recipe_importer"
echo ""
echo "Then test meal plan generation at http://localhost:3000"
