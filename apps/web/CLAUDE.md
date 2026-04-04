# CartSpoon Web App — Claude Context

> Next.js 16.2.2 specific context. Supplements root `CLAUDE.md`.
> Read both. Root CLAUDE.md has stack overview, business rules, and NEVER DO.
> This file covers web-app-specific patterns and gotchas.

---

## App Router Conventions

### Route Structure
```
src/app/
├── layout.tsx          # Root layout — TRPCProvider + PostHogProvider only
├── page.tsx            # Landing page — public, static
├── auth/               # Login + signup — no auth required
├── plan/               # Protected (middleware.ts)
├── account/            # Protected
├── shopping-list/      # Protected
├── recipes/[id]/       # Public — recipe detail
├── sale-items/         # Public — this week's deals
├── upgrade/            # Public — pricing page
├── admin/              # IP-gated — internal dashboard
└── api/
    ├── trpc/[trpc]/    # tRPC handler — do not modify
    ├── checkout/       # Stripe checkout session
    ├── webhooks/stripe/ # Stripe webhook handler
    └── cron/           # Vercel cron jobs (check auth header!)
```

### Page Data Fetching Pattern
Server Components (RSC) fetch via the server-side tRPC caller:
```typescript
// ✅ Correct — server component
import { api } from "@/lib/trpc/server";
export default async function PlanPage() {
  const plan = await api.mealPlan.getCurrent();  // returns null if none
  // ...
}
```

Client Components fetch via tRPC hooks:
```typescript
"use client";
import { trpc } from "@/lib/trpc/client";
export function StoreSelector() {
  const { data, isLoading } = trpc.stores.list.useQuery();
  // ...
}
```

**Never mix:** no `api.*` calls in Client Components, no `trpc.*.useQuery()` in Server Components.

### Async params in Next.js 16
Page `params` and `searchParams` are now Promises — always `await` them:
```typescript
// ✅ Correct
export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
}

// ❌ Wrong — causes runtime error in Next.js 16
export default async function RecipePage({ params }: { params: { id: string } }) {
  const { id } = params;  // not awaited
}
```

---

## Supabase Client Selection

| Situation | Import |
|---|---|
| Client Component (browser) | `createSupabaseBrowserClient()` from `@/lib/supabase/client` |
| Server Component / tRPC context | `createSupabaseServerClient()` from `@/lib/supabase/server` |
| Webhook / cron / service-role ops | `supabaseAdmin` from `@/lib/supabase/admin` + `import "server-only"` |

The server client handles cookie forwarding automatically.
The admin client bypasses RLS — only use for writes that must cross user boundaries.

---

## tRPC Patterns

### Server-Side Caller (RSC)
```typescript
import { api } from "@/lib/trpc/server";
// Returns typed data directly, throws on error
const plan = await api.mealPlan.getCurrent();
```

### Client-Side Hooks
```typescript
import { trpc } from "@/lib/trpc/client";
// Query
const { data, isLoading, error } = trpc.stores.list.useQuery();
// Mutation
const generate = trpc.mealPlan.generate.useMutation({
  onSuccess: ({ planId }) => router.push("/plan"),
  onError: (err) => alert(err.message),
});
generate.mutate();
```

### Error Handling in Server Components
```typescript
const { data: plan, error } = await ctx.supabase
  .from("meal_plans")
  .select("*")
  .eq("user_id", userId)
  .single();

if (error?.code === "PGRST116") return null;  // not found — not an error
if (error) throw new Error(error.message);     // real error — let tRPC handle it
```

---

## Auth Flow

Magic link and Google OAuth both redirect to `/plan` on success.
Middleware guards: `/plan/*`, `/account/*`, `/shopping-list/*`.

```typescript
// Check auth in a Server Component:
import { createSupabaseServerClient } from "@/lib/supabase/server";
const supabase = await createSupabaseServerClient();
const { data: { session } } = await supabase.auth.getSession();
if (!session) redirect("/auth/login");
```

Do NOT use `getUser()` in middleware (performance) — `getSession()` is correct there.

---

## Stripe Integration

### Checkout Flow
`POST /api/checkout` → creates Stripe session → `303` redirect to Stripe.
On return: Stripe sends `checkout.session.completed` to `/api/webhooks/stripe`.
Webhook updates `users.tier = 'premium'` via `supabaseAdmin`.

### Testing Locally
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# Copy whsec_... to STRIPE_WEBHOOK_SECRET in .env.local
stripe trigger checkout.session.completed
```

Test card: `4242 4242 4242 4242`, any future date, any CVC.

---

## Cron Routes

All cron routes must check the `CRON_SECRET` header:
```typescript
const auth = req.headers instanceof Headers ? req.headers.get("authorization") : "";
if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

Schedules defined in `vercel.json`:
- `0 8 * * *` → `/api/cron/check-llm-spend` (daily 8am)
- `0 18 * * 0` → `/api/cron/weekly-email` (Sunday 6pm)

---

## PostHog Analytics

Server-side (tRPC mutations):
```typescript
import { posthog } from "@/lib/posthog";
posthog.capture({ distinctId: user.id, event: "plan_generated", properties: { ... } });
await posthog.shutdown();  // required in serverless — flushes immediately
```

Client-side (components):
```typescript
"use client";
import { usePostHog } from "posthog-js/react";
const ph = usePostHog();
ph.capture("upgrade_clicked", { source: "plan_page" });
```

---

## Rate Limiting

Two Upstash ratelimiters in `src/lib/ratelimit.ts`:
- `freeTierRatelimit` — 1 plan per 604,800s (7 days) per user ID
- `premiumRatelimit` — 2 plans per 604,800s per user ID

The DB `UNIQUE(user_id, week_of)` constraint on `meal_plans` enforces
the same limit at the data layer as a safety net.

---

## Email

Templates in `src/emails/` use React Email components.
Send via Resend from cron routes or tRPC procedures:
```typescript
import { Resend } from "resend";
import { render } from "@react-email/render";
import { WeeklyPlanEmail } from "@/emails/WeeklyPlanEmail";

const resend = new Resend(process.env.RESEND_API_KEY!);
const html = await render(<WeeklyPlanEmail weekOf={weekOf} />);
await resend.emails.send({ from: "CartSpoon <hello@cartspoon.app>", to, subject, html });
```

---

## Tailwind v4 Notes

- No `tailwind.config.js` — configuration is in CSS via `@theme inline {}`
- Theme tokens defined in `src/app/globals.css`
- Use CSS variables for brand colors: `var(--color-brand-green)`
- Arbitrary values `[#16a34a]` are fine but prefer named tokens

---

## Common Mistakes in This Codebase

- Using `createServerComponentClient` — **does not exist** in auth-helpers v0.15
- Forgetting `await params` on dynamic route pages (Next.js 16 breaking change)
- Calling `api.*` (server caller) inside a Client Component — will throw
- Not calling `await posthog.shutdown()` after server-side capture — events lost
- Using `supabaseAdmin` without `import "server-only"` at top of file
- Hardcoding `week_of` — always use `getMondayOfCurrentWeek()`
