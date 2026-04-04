# /new-migration — Create a Supabase Migration

Scaffold a new numbered migration with RLS and index standards enforced.

## Usage
```
/new-migration <description>
```
Example: `/new-migration add-user-saved-recipes`

## Steps

### 1. Determine Next Migration Number
```bash
ls supabase/migrations/ | tail -5
# Next number = highest + 1, zero-padded to 3 digits
```

### 2. Create Migration File
`supabase/migrations/00N_<description>.sql`

### 3. Required Checklist for Every New Table
```sql
-- ✅ Always include:
CREATE TABLE <name> (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  -- ... columns
);

-- ✅ Enable RLS immediately
ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;

-- ✅ Add RLS policies (even if service-role-only)
CREATE POLICY "<name>: own row select"
  ON <name> FOR SELECT USING (auth.uid() = user_id);

-- ✅ Index every FK column
CREATE INDEX idx_<name>_<fk_col> ON <name> (<fk_col>);

-- ✅ Index text search columns with trgm
CREATE INDEX idx_<name>_<text_col>
  ON <name> USING GIN (<text_col> gin_trgm_ops);
```

### 4. Update TypeScript Types
After applying migration locally:
```bash
npx supabase gen types typescript --local > apps/web/src/types/database.ts
```

### 5. Test Locally
```bash
npx supabase db reset   # applies all migrations fresh
```

### 6. Rollback Plan
Always include a commented rollback at the bottom:
```sql
-- ROLLBACK:
-- DROP TABLE IF EXISTS <name>;
```

## NEVER
- Never create a table without immediately enabling RLS
- Never add a column without checking if an index is needed
- Never apply directly to production — always push via CLI
