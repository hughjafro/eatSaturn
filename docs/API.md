# API Reference — CartSpoon

> Internal API contracts for tRPC routers and REST endpoints.
> For the database schema see `docs/ARCHITECTURE.md`.
> For auth flow see `docs/ARCHITECTURE.md#authentication-flow`.

---

## tRPC Routers

Base URL: `/api/trpc`
All procedures use superjson transformer.
Authentication via Supabase session cookie.

### Procedure Tiers
| Tier | Auth Required | Tier Required |
|---|---|---|
| `publicProcedure` | No | No |
| `protectedProcedure` | Yes (session + users row) | No |
| `premiumProcedure` | Yes | `users.tier === 'premium'` |

---

### `stores`

#### `stores.list`
**Type:** Query | **Auth:** Public

Returns all active stores.

**Response:**
```typescript
Array<{
  id: string;          // UUID
  name: string;        // "Kroger"
  chain_key: string;   // "kroger"
  is_active: boolean;
}>
```

---

### `saleItems`

#### `saleItems.getCurrentWeek`
**Type:** Query | **Auth:** Public

**Input:**
```typescript
{ storeId: string }  // UUID
```

**Response:**
```typescript
{
  weekOf: string;    // "YYYY-MM-DD" (Monday)
  items: Array<{
    id: string;
    product_name: string;
    category: string | null;
    unit: string | null;
    sale_price: number | null;
    regular_price: number | null;
    discount_pct: number | null;
    image_url: string | null;
    normalized_name: string;
  }>;
  grouped: Record<string, typeof items>;  // keyed by category
}
```

---

### `user`

#### `user.getProfile`
**Type:** Query | **Auth:** Protected

**Response:**
```typescript
{
  id: string;
  email: string;
  tier: "free" | "premium";
  householdSize: number;
}
```

#### `user.getPreferences`
**Type:** Query | **Auth:** Protected

**Response:**
```typescript
{
  user_id: string;
  preferred_store_ids: string[];
  dietary_restrictions: string[];   // ["gluten_free", "vegetarian", "vegan"]
  disliked_ingredients: string[];
  cuisine_preferences: string[];
  notification_day: string;         // "sunday"
}
```
Returns defaults if no preferences row exists yet.

#### `user.updatePreferences`
**Type:** Mutation | **Auth:** Protected

**Input:**
```typescript
{
  preferredStoreIds?: string[];       // any tier
  // Premium only — throws FORBIDDEN if free user sends these:
  dietaryRestrictions?: string[];
  dislikedIngredients?: string[];
  cuisinePreferences?: string[];
  notificationDay?: string;
}
```

**Response:** Updated preferences row.

**Errors:**
- `FORBIDDEN` — free user attempted to set dietary/ingredient preferences

---

### `mealPlan`

#### `mealPlan.generate`
**Type:** Mutation | **Auth:** Protected

Generates (or returns cached) this week's meal plan for the current user.

**Input:** None (uses authenticated user's preferences)

**Response:**
```typescript
{
  planId: string;   // UUID of the meal_plans row
  cached: boolean;  // true if returned from Redis/DB cache
}
```

**Errors:**
- `BAD_REQUEST` — no preferred stores selected
- `PRECONDITION_FAILED` — fewer than 7 recipes matched this week's sale items
- `INTERNAL_SERVER_ERROR` — Claude API failure after retry

**Side effects:**
- Writes `meal_plans`, `meal_plan_days`, `shopping_lists` rows to DB
- Logs to `llm_usage_log`
- Caches plan ID in Redis (TTL: 7 days)
- Captures PostHog `plan_generated` event

#### `mealPlan.getCurrent`
**Type:** Query | **Auth:** Protected

**Response:**
```typescript
{
  id: string;
  week_of: string;
  total_cost: number | null;
  llm_summary: string | null;
  store_ids: string[];
  status: "draft" | "active" | "archived";
  meal_plan_days: Array<{
    id: string;
    day_of_week: number;   // 0-6 (Monday=0)
    meal_type: "breakfast" | "lunch" | "dinner";
    notes: string | null;
    servings: number;
    recipe: {
      id: string;
      title: string;
      description: string | null;
      meal_type: string;
      image_url: string | null;
      estimated_cost: number | null;
      is_gluten_free: boolean;
      is_vegetarian: boolean;
      is_vegan: boolean;
      recipe_ingredients: Array<{
        ingredient_name: string;
        quantity: number | null;
        unit: string | null;
        is_pantry_staple: boolean;
      }>;
    };
  }>;
} | null  // null if no plan exists for this week
```

#### `mealPlan.getHistory`
**Type:** Query | **Auth:** Premium only

**Input:**
```typescript
{ page?: number }  // default 0, page size 8
```

**Response:**
```typescript
{
  plans: Array<{
    id: string;
    week_of: string;
    total_cost: number | null;
    llm_summary: string | null;
    status: string;
  }>;
  total: number;
  page: number;
}
```

**Errors:**
- `FORBIDDEN` — free tier user

---

### `recipes`

#### `recipes.getById`
**Type:** Query | **Auth:** Public

**Input:**
```typescript
{ id: string }  // UUID
```

**Response:**
```typescript
{
  id: string;
  title: string;
  description: string | null;
  servings: number | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  instructions: string[] | null;
  cuisine_type: string | null;
  meal_type: "breakfast" | "lunch" | "dinner";
  is_gluten_free: boolean;
  is_vegetarian: boolean;
  is_vegan: boolean;
  estimated_cost: number | null;
  image_url: string | null;
  recipe_ingredients: Array<{
    id: string;
    ingredient_name: string;
    quantity: number | null;
    unit: string | null;
    is_pantry_staple: boolean;
    estimated_cost: number | null;
  }>;
}
```

**Errors:**
- `NOT_FOUND` — recipe does not exist

---

## REST Endpoints

### `POST /api/checkout`
Initiates Stripe checkout session for premium upgrade.

**Auth:** Supabase session cookie required

**Response:** `303 Redirect` to Stripe hosted checkout URL

**Side effects:** Creates Stripe checkout session with `userId` in metadata

---

### `POST /api/webhooks/stripe`
Receives Stripe webhook events.

**Auth:** `Stripe-Signature` header (verified against `STRIPE_WEBHOOK_SECRET`)

**Handled events:**
| Event | Action |
|---|---|
| `checkout.session.completed` | Sets `users.tier = 'premium'`, saves `stripe_customer_id` |
| `customer.subscription.deleted` | Sets `users.tier = 'free'` |

**Response:** `{ received: true }`

---

### `GET /api/cron/check-llm-spend`
Daily LLM cost check. Sends alert if spend exceeds threshold.

**Auth:** `Authorization: Bearer {CRON_SECRET}` header

**Response:**
```json
{ "date": "YYYY-MM-DD", "totalSpend": "0.0000" }
```

---

### `GET /api/cron/weekly-email`
Sends weekly plan-ready emails to users with Sunday notifications.

**Auth:** `Authorization: Bearer {CRON_SECRET}` header

**Response:**
```json
{ "sent": 42 }
```

---

## Error Shape (tRPC)

All tRPC errors follow this shape:
```typescript
{
  message: string;
  code: "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" |
        "BAD_REQUEST" | "PRECONDITION_FAILED" | "INTERNAL_SERVER_ERROR";
  data?: {
    httpStatus: number;
    stack?: string;  // development only
  };
}
```

---

## Scraper API

Internal FastAPI service at `https://cartspoon-scraper.fly.dev` (or `localhost:8080` locally).

### `GET /health`
**Auth:** None

**Response:** `{ "status": "ok" }`

### `POST /scrape/trigger`
**Auth:** `X-Scraper-Secret: {SCRAPER_SECRET}` header

**Response:**
```json
{
  "status": "complete",
  "results": {
    "kroger": 45,
    "safeway": 52,
    "aldi": 38
  }
}
```

`results` maps `chain_key` → items written. Value of `0` indicates failure
for that chain (error already logged and alerted).
