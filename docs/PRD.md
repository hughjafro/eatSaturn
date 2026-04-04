# Product Requirements Document — CartSpoon

> Living document. Update when scope changes. Last meaningfully updated: 2025.
> For system design see `docs/ARCHITECTURE.md`.
> For API contracts see `docs/API.md`.

---

## Problem Statement

Budget-conscious households spend significant time trying to align their
grocery shopping with weekly store sales, then separately figure out what
to cook. No existing app does both — deal aggregators (Flipp, Ibotta) ignore
meal planning; meal planners (Mealime, eMeals) ignore what's on sale this week.

CartSpoon closes this gap: your meal plan is built from what's on sale *right now*.

---

## Target Users

| Persona | Description | Primary Pain |
|---|---|---|
| **Budget Family** | 2 adults, 2 kids, tight weekly grocery budget | "I never know what's on sale before I plan meals" |
| **Solo Meal Prepper** | 25–35, fitness-focused, time-constrained | "I want to eat well without overspending" |
| **Frugal Foodie** | Enjoys cooking, motivated by deal-hunting | "I want to maximize savings without sacrificing meal quality" |

---

## Core Value Proposition

> "Your meal plan is built from what's on sale this week — automatically."

---

## Feature Scope

### MVP (Current)

**Grocery Data**
- [x] Scrape Kroger, Safeway, Aldi weekly ads every Sunday night
- [x] Normalize product names, prices, categories
- [x] Store with week_of (Monday) identifier
- [x] Health check alerting on low item count

**Meal Plan Generation**
- [x] 7-day meal plan (breakfast, lunch, dinner × 7 days)
- [x] Recipe selection prioritizes items on sale this week
- [x] Free tier: 1 plan/week, 1 store, haiku model
- [x] Premium tier: 2 plans/week, multi-store, sonnet model
- [x] Plan cached in Redis; idempotent within a week
- [x] Estimated total cost displayed

**Recipes**
- [x] Recipe database seeded from Spoonacular (~180 recipes)
- [x] Fuzzy ingredient-to-sale-item matching (pg_trgm, threshold 0.4)
- [x] Recipe detail page (ingredients, instructions, time, dietary flags)

**Shopping List**
- [x] Generated alongside meal plan
- [x] Checkable items with sale prices shown
- [x] On-sale badge for items matching current deals

**User Accounts**
- [x] Magic link auth + Google OAuth (Supabase)
- [x] Store preference saved on signup
- [x] Free / Premium tier (Stripe subscriptions)
- [x] Account page with tier badge and store management

**Premium Features**
- [x] Dietary restriction filtering (gluten-free, vegetarian, vegan)
- [x] Multi-store meal plans
- [x] Plan history (past weeks)
- [x] Weekly email notification (Sunday delivery via Resend)

**Infrastructure**
- [x] Admin dashboard (scraper health, LLM spend, plan count)
- [x] LLM cost logging and daily spend alert
- [x] Rate limiting via Upstash Redis

---

### Post-MVP Backlog (Prioritized)

**High Priority**
- [ ] Shopping list items properly populated from recipe ingredients
- [ ] Household size scaling (multiply ingredient quantities)
- [ ] Manual recipe swap (replace one meal in the plan)
- [ ] "Surprise me" — regenerate a single day
- [ ] More grocery chains (Whole Foods, Trader Joe's, Publix, H-E-B)

**Medium Priority**
- [ ] User disliked ingredients (premium) — exclude from plan
- [ ] Cuisine preferences (premium) — bias toward preferred styles
- [ ] Recipe search within the app
- [ ] Save favorite recipes
- [ ] Nutritional summary for the week (calories, macros)

**Low Priority / Exploratory**
- [ ] Flipp API partnership for broader chain coverage
- [ ] Grocery cart push (Instacart, Kroger, Walmart APIs)
- [ ] Mobile app (React Native or PWA)
- [ ] B2B: grocery chain white-label or retail media integration
- [ ] Social features: share your weekly plan

---

## Out of Scope (MVP)

- Delivery/pickup ordering
- Real-time price tracking (only weekly ad prices)
- Restaurant meal planning
- Nutritional counseling or medical dietary advice
- User-submitted recipes
- Multi-language support

---

## Success Metrics

| Metric | Target (3 months post-launch) |
|---|---|
| Weekly active users | 1,000 |
| Free → Premium conversion | ≥ 3% |
| Plans generated per week | 500+ |
| Scraper uptime | ≥ 95% Sundays |
| Plan generation success rate | ≥ 98% |
| Monthly churn (premium) | ≤ 8% |

---

## Constraints

- **Web scraping:** Must respect `robots.txt` and `crawl_delay_ms ≥ 2000ms`
- **AI advice:** Never make medical or nutritional health claims
- **Pricing:** Free tier must be genuinely useful (not crippled)
- **Privacy:** No grocery purchase history stored; only preferences and plans
- **Cost:** LLM spend must stay ≤ $100/month at initial scale

---

## User Stories

### Core Flow
- As a new user, I can sign up, select my store, and get a meal plan in under 3 minutes
- As a free user, I can see this week's deals at my store and get a 7-day plan based on them
- As a user, I can view my shopping list with items tagged "on sale" and estimated prices
- As a user, I can click any meal to see the full recipe with ingredients and instructions

### Premium
- As a premium user, I can set dietary restrictions (gluten-free, vegan) and my plan respects them
- As a premium user, I can choose multiple stores and get a plan that spans their combined deals
- As a premium user, I receive a Sunday email when new sale items are loaded
- As a premium user, I can view my past 8 weeks of meal plans

### Admin
- As an admin, I can see scraper health (items per store this week) from the /admin dashboard
- As an admin, I can see LLM spend today and this week with per-model breakdown
- As an admin, I receive an alert when a scraper returns < 20 items

---

## Acceptance Criteria — Plan Generation

A meal plan is considered valid when:
1. All 21 meal slots (7 days × 3 meals) are filled with valid recipe IDs
2. No recipe appears more than twice in the week
3. At least 60% of recipes have at least one ingredient matched to a current sale item
4. Total estimated cost is between $20–$300
5. Dietary restrictions (if set) are 100% respected
6. Generation completes in < 30 seconds
