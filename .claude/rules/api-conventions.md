# Rule: API Conventions

## tRPC Patterns
- All data access goes through tRPC — no direct DB calls in components
- Input validation: Zod schema required on every procedure with inputs
- Error codes: use `TRPCError` with appropriate code:
  - `UNAUTHORIZED` — no session
  - `FORBIDDEN` — authenticated but wrong tier
  - `NOT_FOUND` — resource doesn't exist
  - `BAD_REQUEST` — invalid input (beyond Zod)
  - `PRECONDITION_FAILED` — business logic failure (e.g. < 7 recipes)
  - `INTERNAL_SERVER_ERROR` — unexpected failures only

## Response Shapes
- Queries: return data directly (no wrapper `{ data: ... }`)
- Mutations: return the created/updated resource or `{ success: true }`
- Lists: return array directly for small sets; add pagination for large sets

## Pagination (when needed)
```typescript
.input(z.object({ page: z.number().int().min(0).default(0) }))
// returns:
{ items: T[], total: number, page: number }
```
Page size constant: `PAGE_SIZE = 8` (consistent with `getHistory`)

## Supabase Query Patterns
```typescript
// ✅ Single row — use .single()
const { data, error } = await supabase
  .from("table")
  .select("*")
  .eq("id", id)
  .single();
if (error?.code === "PGRST116") return null; // not found
if (error) throw new Error(error.message);

// ✅ Multiple rows
const { data, error } = await supabase
  .from("table")
  .select("col1, col2, related(col3)")
  .eq("user_id", userId)
  .order("created_at", { ascending: false });

// ✅ Upsert
await supabase
  .from("table")
  .upsert(payload, { onConflict: "unique_col" })
  .select()
  .single();
```

## REST Endpoints (non-tRPC)
Used only for: Stripe webhooks, cron routes, scraper trigger.
- Always validate auth header before any logic
- Return `NextResponse.json({ error: "..." }, { status: 4xx })` on failure
- Return `NextResponse.json({ received: true })` or similar on success

## Cron Route Pattern
```typescript
export async function GET(req: Request) {
  const auth = req.headers instanceof Headers
    ? req.headers.get("authorization") : "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // ... logic
}
```
