# Skill: Database Migration

> Safe, zero-downtime Supabase migration workflow for CartSpoon.
> Every migration is treated as an irreversible production change.
> The migration-reviewer agent enforces these standards on every PR.

---

## When to Use This Skill

- Adding a new table
- Adding columns to existing tables
- Creating or modifying indexes
- Updating RLS policies
- Creating or modifying Postgres functions
- Adding seed data or synonym entries

---

## Core Principles

1. **Never modify an existing migration** — create a new one
2. **RLS on every table, in the same migration** — never defer
3. **Every migration is idempotent** — `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`
4. **Every migration has a rollback comment** — even if you never run it
5. **TypeScript types regenerated after every schema change**
6. **Test locally before pushing to remote**

---

## Phase 1: Plan the Migration

### 1.1 Determine What You Need

Before writing SQL, answer:
```
□ What table(s) are being created or modified?
□ What is the ownership model? (user-owned / public-read / service-role-only)
□ What FK relationships exist?
□ What indexes are needed?
□ What RLS policies are needed?
□ Is this a breaking change? (removing/renaming columns)
□ Does existing data need to be backfilled?
□ What is the rollback plan?
```

### 1.2 Check for Conflicts

```bash
# See what migrations exist:
ls supabase/migrations/ | sort

# Next migration number:
ls supabase/migrations/ | grep -oE '^[0-9]+' | sort -n | tail -1
# Add 1, zero-pad to 3 digits
```

---

## Phase 2: Write the Migration

### 2.1 File Naming

```
supabase/migrations/00N_<kebab-case-description>.sql
```

Examples:
- `005_add-user-saved-recipes.sql`
- `006_add-cuisine-index.sql`
- `007_expand-dietary-options.sql`

### 2.2 New Table Template

```sql
-- ============================================================
-- <TABLE DESCRIPTION>
-- ============================================================

CREATE TABLE IF NOT EXISTS <table_name> (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- add your columns here
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes: always index FK columns
CREATE INDEX IF NOT EXISTS idx_<table_name>_user_id
  ON <table_name> (user_id);

-- Index text search columns
-- CREATE INDEX IF NOT EXISTS idx_<table_name>_<text_col>
--   ON <table_name> USING GIN (<text_col> gin_trgm_ops);

-- updated_at trigger (user-owned tables)
CREATE TRIGGER trig_<table_name>_updated_at
  BEFORE UPDATE ON <table_name>
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- RLS — REQUIRED, in this same migration
-- ============================================================

ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;

-- SELECT: own rows only
CREATE POLICY "<table_name>: own row select"
  ON <table_name> FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: own rows only
CREATE POLICY "<table_name>: own row insert"
  ON <table_name> FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: own rows only
CREATE POLICY "<table_name>: own row update"
  ON <table_name> FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: own rows only (include if users can delete)
-- CREATE POLICY "<table_name>: own row delete"
--   ON <table_name> FOR DELETE
--   USING (auth.uid() = user_id);

-- ============================================================
-- ROLLBACK:
-- DROP TABLE IF EXISTS <table_name>;
-- ============================================================
```

### 2.3 Add Column Template

```sql
-- Safe: nullable column (no table lock, instant)
ALTER TABLE <table_name>
  ADD COLUMN IF NOT EXISTS <col_name> TEXT;

-- Safe: column with default (Postgres 11+ evaluates lazily)
ALTER TABLE <table_name>
  ADD COLUMN IF NOT EXISTS <col_name> BOOLEAN NOT NULL DEFAULT false;

-- Risky: NOT NULL without default on populated table
-- NEVER do this directly. Instead:
-- Step 1: Add as nullable
ALTER TABLE <table_name>
  ADD COLUMN IF NOT EXISTS <col_name> TEXT;
-- Step 2: Backfill
UPDATE <table_name> SET <col_name> = 'default_value' WHERE <col_name> IS NULL;
-- Step 3: Add constraint (after backfill completes)
ALTER TABLE <table_name>
  ALTER COLUMN <col_name> SET NOT NULL;

-- ROLLBACK:
-- ALTER TABLE <table_name> DROP COLUMN IF EXISTS <col_name>;
```

### 2.4 Add Index Template

```sql
-- Standard B-tree (for equality/range queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_<table>_<col>
  ON <table> (<col>);

-- GIN trigram (for fuzzy text search)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_<table>_<col>_trgm
  ON <table> USING GIN (<col> gin_trgm_ops);

-- Composite index (equality columns first)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_<table>_<col1>_<col2>
  ON <table> (<col1>, <col2>);

-- ROLLBACK:
-- DROP INDEX CONCURRENTLY IF EXISTS idx_<table>_<col>;
```

**Note:** `CONCURRENTLY` prevents table locks on production.
Do not use `CONCURRENTLY` inside a transaction block.

### 2.5 Modify Postgres Function Template

```sql
-- Replace entire function (CREATE OR REPLACE is safe, atomic)
CREATE OR REPLACE FUNCTION <function_name>(
  <params>
)
RETURNS <return_type>
LANGUAGE sql STABLE AS $$
  -- new function body
$$;

-- ROLLBACK: restore previous function body
-- (keep old version in a comment above)
```

### 2.6 Add Seed Data Template

```sql
INSERT INTO <table_name> (<col1>, <col2>)
VALUES
  ('value1a', 'value1b'),
  ('value2a', 'value2b')
ON CONFLICT (<unique_col>) DO NOTHING;

-- ROLLBACK:
-- DELETE FROM <table_name> WHERE <col1> IN ('value1a', 'value2a');
```

---

## Phase 3: Local Testing

### 3.1 Apply to Local DB

```bash
cd supabase

# Option A: Push only new migrations (fast)
npx supabase db push

# Option B: Full reset from scratch (slow but clean)
npx supabase db reset

# Confirm migration applied:
npx supabase db diff
# Should show no pending migrations
```

### 3.2 Verify in Supabase Studio

Open http://localhost:54323 and check:
- Table appears in the schema explorer
- Columns match your spec
- RLS is enabled (shield icon on table)
- Policies are listed correctly
- Indexes appear in the index list

### 3.3 Test RLS Manually

```sql
-- In Studio SQL editor, test as anon user:
SET LOCAL role anon;
SELECT * FROM <table_name>;  -- should return 0 rows (not error)

-- Test as authenticated user (replace with real UUID):
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub": "user-uuid-here"}';
INSERT INTO <table_name> (user_id, ...) VALUES ('user-uuid-here', ...);
SELECT * FROM <table_name>;  -- should return only this user's row
```

### 3.4 Run Regression Tests

```bash
cd apps/scraper
poetry run pytest  # should still pass

cd apps/web
npx tsc --noEmit   # should still pass
```

---

## Phase 4: Regenerate TypeScript Types

After any schema change, regenerate `database.ts`:

```bash
cd supabase
npx supabase gen types typescript --local \
  > ../apps/web/src/types/database.ts
```

**Verify the output:**
```bash
cd apps/web
npx tsc --noEmit
# Must still pass with 0 errors
```

Do NOT manually edit `database.ts` — it's auto-generated and will be
overwritten on the next `gen types` run.

---

## Phase 5: Push to Remote

### 5.1 Check Remote State

```bash
cd supabase
npx supabase db diff --linked
# Should show only your new migration as pending
```

### 5.2 Push

```bash
npx supabase db push
```

**Monitor for errors.** If the push fails mid-migration on production,
do NOT run it again without understanding what partially applied.

### 5.3 Verify on Remote

In Supabase Dashboard → SQL Editor, run:
```sql
SELECT id, name, statements, version
FROM supabase_migrations.schema_migrations
ORDER BY version DESC LIMIT 5;
```
Your new migration should appear at the top.

---

## Phase 6: PR Checklist

```
□ Migration file name: 00N_kebab-case.sql (sequential, no gaps)
□ New table: ALTER TABLE ... ENABLE ROW LEVEL SECURITY present
□ New table: At least SELECT + INSERT + UPDATE policies present
□ Write policies: WITH CHECK clause on every INSERT/UPDATE policy
□ FK columns: CREATE INDEX on every FK
□ Text search: GIN index on fuzzy-matched columns
□ Rollback comment at bottom of migration file
□ database.ts regenerated: npx supabase gen types typescript --local
□ npx tsc --noEmit passes after type regeneration
□ Local db reset tested: npx supabase db reset succeeds
```

---

## Common Mistakes

**Adding RLS in a separate migration:**
The table exists without RLS protection between the two migrations on production.
Always enable RLS in the same migration that creates the table.

**Forgetting `WITH CHECK` on write policies:**
```sql
-- WRONG — users can insert rows for OTHER users:
CREATE POLICY "insert" ON t FOR INSERT WITH CHECK (true);

-- CORRECT:
CREATE POLICY "insert" ON t FOR INSERT WITH CHECK (auth.uid() = user_id);
```

**Missing index on FK column:**
Every `REFERENCES other_table(id)` needs a corresponding `CREATE INDEX`.
Without it, DELETE on the referenced table does a full table scan.

**Breaking changes on live data:**
- Renaming a column: add the new column, migrate data, deploy code using new name, then drop old column in a follow-up migration
- Changing a column type: same three-step process
- Never do these in a single migration on a live database

**Not testing `db reset`:**
A migration may apply cleanly incrementally but fail on a fresh reset
(e.g. references a function defined in a later migration). Always test
`npx supabase db reset` before the PR.
