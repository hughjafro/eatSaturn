# Rule: Code Style

## TypeScript
- Strict mode always on (`"strict": true` in tsconfig.json)
- No `any` — use `unknown` and narrow, or proper types from `database.ts`
- No non-null assertions (`!`) without a comment explaining why it's safe
- Prefer `const` over `let`; never `var`
- Named exports preferred over default exports (except Next.js pages/layouts)

## Imports
Biome enforces import order automatically via `organizeImports`.
Manual order when Biome doesn't apply:
1. Node built-ins
2. External packages
3. Internal aliases (`@/...`)
4. Relative imports (`./`, `../`)

## Formatting
- Biome handles all formatting: `npm run format` from repo root
- Quote style: double quotes (`"`)
- Trailing commas: ES5 style
- Semicolons: always
- Indent: 2 spaces

## Naming
- Components: PascalCase (`MealCard`, `StoreSelector`)
- Functions/variables: camelCase
- Constants: SCREAMING_SNAKE_CASE for module-level constants
- DB columns: snake_case (matches Supabase schema)
- CSS classes: Tailwind only, no custom class names unless absolutely necessary

## Python (scraper)
- Ruff for linting, Black for formatting
- Type hints required on all function signatures
- `from __future__ import annotations` at top of every file
- Pydantic models for all DB shapes (see `models.py`)
- No bare `except:` — always catch specific exceptions
