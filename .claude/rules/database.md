# Rule: Database

## Migrations
- File naming: `00N_<kebab-case-description>.sql` (zero-padded, sequential)
- Never modify an existing migration — always create a new one
- Every migration must be idempotent where possible (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`)
- Every migration must include a commented rollback at the bottom

## Table Standards
Required columns on every table:
```sql
id         UUID PRIMARY KEY DEFAULT gen_random_uuid()
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
```
Tables with user-owned rows also need `updated_at` with trigger.

## Indexing Rules
- Every foreign key column must have an index
- Text columns used in fuzzy search: `USING GIN (col gin_trgm_ops)`
- Columns used in frequent WHERE filters: standard B-tree index
- Composite indexes: column order matters — put equality checks first

## RLS Rules (enforced, see security.md)
- Enable RLS in the same migration that creates the table
- Public read: `USING (true)` — only for stores, sale_items, recipes, recipe_ingredients
- User-owned rows: `USING (auth.uid() = user_id)`
- Cross-table ownership: use EXISTS subquery to chain ownership

## Query Patterns
- Use `supabase.from()` client for standard CRUD
- Use `supabaseAdmin` (service role) only when RLS must be bypassed (plan generation)
- Use stored procedures (`supabase.rpc()`) for complex multi-table queries
- Avoid N+1 queries — use `.select()` with nested relations or joins

## week_of Convention
- Always a Monday date — computed by `getMondayOfCurrentWeek()`
- Never hardcode a date string
- DB column type: `DATE` (not TIMESTAMPTZ)

## Upsert Pattern
- `sale_items`: UNIQUE on `(store_id, week_of, normalized_name)` — scrapers use upsert
- `user_preferences`: UNIQUE on `user_id` — use `upsert({ onConflict: "user_id" })`
- `meal_plans`: UNIQUE on `(user_id, week_of)` — one plan per user per week
