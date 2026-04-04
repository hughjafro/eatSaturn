# Skill: Component Scaffold

> Process for building new React components in CartSpoon with consistent
> quality — correct client/server boundary, TypeScript types, Tailwind
> design system, and accessibility. Use `/generate-component` command
> as the entry point.

---

## When to Use This Skill

- Building a new UI element not covered by existing components
- Refactoring a large component into smaller pieces
- Creating a reusable pattern that will be used in 3+ places
- Building a new page section with data requirements

---

## Design System Reference

### Color Palette
```
Primary action:    green-600 (#16a34a)    hover: green-700
Secondary action:  amber-500 (#f59e0b)    hover: amber-600
Destructive:       red-600               hover: red-700
Text primary:      gray-900
Text secondary:    gray-500
Text disabled:     gray-400
Border default:    gray-200
Background warm:   [--color-brand-warm] = #f9f5f0
Background card:   white
```

### Spacing & Radius
```
Card padding:      p-5 or p-6
Card radius:       rounded-2xl
Input radius:      rounded-xl
Button radius:     rounded-xl  (lg: rounded-xl)
Badge radius:      rounded-full
Card shadow:       shadow-sm   hover: shadow-md
Card border:       ring-1 ring-gray-100
```

### Typography Scale
```
Page title:        text-2xl font-bold text-gray-900
Section title:     text-lg font-semibold text-gray-900
Card title:        font-semibold text-gray-800
Body:              text-sm text-gray-700
Caption:           text-xs text-gray-500
Label (form):      text-sm font-medium text-gray-700
Badge:             text-xs font-medium
```

### Existing Components to Reuse
```
<Button variant="primary|secondary|outline" size="sm|md|lg" loading={bool}>
<Badge variant="green|amber|gray">
<PremiumGate featureName="...">  — wraps premium-only content
```

---

## Phase 1: Classify the Component

Answer these questions to determine the right implementation:

### Client vs Server Component?

**Use Server Component when:**
- Data comes directly from tRPC server caller (`api.xxx.yyy()`)
- No useState, useEffect, event handlers, or browser APIs
- Component is mostly static layout around server-fetched data

**Use Client Component when:**
- Has interactive state (checkboxes, toggles, form inputs)
- Uses tRPC hooks (`trpc.xxx.useQuery()`, `trpc.xxx.useMutation()`)
- Uses PostHog, localStorage, or browser APIs
- Receives user events (onClick, onChange, onSubmit)

### Where Does It Live?

```
apps/web/src/
├── app/                    # Page-level components (route-specific)
│   └── plan/page.tsx       # This is a page, not a reusable component
├── components/             # Reusable components
│   ├── ui/                 # Atoms: Button, Badge, Input — no data fetching
│   ├── MealCard.tsx        # Molecule: combines UI atoms
│   ├── StoreSelector.tsx   # Organism: has tRPC data fetching
│   └── ShoppingList.tsx    # Organism: complex interactive component
```

Rule of thumb:
- `components/ui/` — pure presentation, no data, accepts all data via props
- `components/` — may fetch its own data via tRPC hooks (client) or accept server data

---

## Phase 2: Define the Interface

Before writing any JSX, define the props type precisely.

### Props Design Rules
1. Accept the minimum data needed — not the whole DB row
2. Use explicit types from `database.ts` where applicable
3. Optional props get sensible defaults
4. Callbacks use standard React event types where possible

```typescript
// ✅ Good — specific, minimal
interface RecipeCostBadgeProps {
  estimatedCost: number;
  weeklyDealCount: number;
}

// ❌ Bad — overly broad, exposes internals
interface RecipeCostBadgeProps {
  recipe: Database["public"]["Tables"]["recipes"]["Row"];
}
```

### For Client Components with tRPC
Decide whether the component fetches its own data or receives it via props.

**Self-fetching (good for organism-level components):**
```typescript
// Component owns the query
export function StoreSelector({ selectedIds, onChange }: Props) {
  const { data: stores } = trpc.stores.list.useQuery();
  // ...
}
```

**Props-fed (good for reusable atoms/molecules):**
```typescript
// Parent fetches, component renders
export function StoreBadge({ storeId, storeName }: Props) {
  // No data fetching — pure presentation
}
```

---

## Phase 3: Build the Component

### Server Component Template
```tsx
// apps/web/src/components/ExampleCard.tsx
import { type ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";

interface ExampleCardProps {
  title: string;
  subtitle?: string;
  badge?: string;
  children?: ReactNode;
}

export function ExampleCard({
  title,
  subtitle,
  badge,
  children,
}: ExampleCardProps) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
          )}
        </div>
        {badge && <Badge variant="green">{badge}</Badge>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
```

### Client Component Template
```tsx
// apps/web/src/components/ExampleToggle.tsx
"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

interface ExampleToggleProps {
  initialValue: boolean;
  onLabel: string;
  offLabel: string;
  onChange?: (value: boolean) => void;
}

export function ExampleToggle({
  initialValue,
  onLabel,
  offLabel,
  onChange,
}: ExampleToggleProps) {
  const [isOn, setIsOn] = useState(initialValue);

  const handleToggle = () => {
    const next = !isOn;
    setIsOn(next);
    onChange?.(next);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      onClick={handleToggle}
      className={`
        relative inline-flex h-6 w-11 items-center rounded-full transition-colors
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600
        ${isOn ? "bg-green-600" : "bg-gray-200"}
      `}
    >
      <span className="sr-only">{isOn ? onLabel : offLabel}</span>
      <span
        className={`
          inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
          ${isOn ? "translate-x-6" : "translate-x-1"}
        `}
      />
    </button>
  );
}
```

### Loading State Pattern
```tsx
// Skeleton loader for async data:
function ExampleCardSkeleton() {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 animate-pulse">
      <div className="h-5 w-2/3 rounded bg-gray-200" />
      <div className="mt-2 h-4 w-1/2 rounded bg-gray-100" />
    </div>
  );
}

// Usage in parent:
const { data, isLoading } = trpc.someRouter.someQuery.useQuery();
if (isLoading) return <ExampleCardSkeleton />;
```

### Error State Pattern
```tsx
// Inline error for component-level failures:
if (error) {
  return (
    <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
      Failed to load. Please refresh the page.
    </div>
  );
}
```

---

## Phase 4: Accessibility Checklist

Run through this before marking the component done:

```
□ All buttons have descriptive text or aria-label
□ Interactive elements reachable by Tab key
□ Focus ring visible: focus-visible:ring-2 focus-visible:ring-green-600
□ Images have alt text (meaningful or "" for decorative)
□ Color is not the only differentiator (badges use text + color)
□ Form inputs have associated <label> elements
□ Loading states use aria-busy or descriptive text
□ Toggle/checkbox uses role="switch" or correct input type
□ Lists of items use <ul>/<ol> not divs
□ Heading levels are sequential (h2 inside h1 sections, etc.)
```

---

## Phase 5: Integration

### Export Pattern
```typescript
// If used only in one parent file: no index file needed
// If used in 3+ places, add to component directory exports:

// apps/web/src/components/index.ts (create if needed)
export { MealCard } from "./MealCard";
export { StoreSelector } from "./StoreSelector";
export { ExampleCard } from "./ExampleCard";
```

### Usage in Server Component (RSC)
```tsx
// In a page or layout (server):
import { ExampleCard } from "@/components/ExampleCard";

export default async function PlanPage() {
  const data = await api.someRouter.someQuery();
  return <ExampleCard title={data.title} />;
}
```

### Usage in Client Component
```tsx
"use client";
import { ExampleToggle } from "@/components/ExampleToggle";

export function SettingsPanel() {
  return (
    <ExampleToggle
      initialValue={false}
      onLabel="Notifications on"
      offLabel="Notifications off"
      onChange={(v) => console.log(v)}
    />
  );
}
```

---

## Phase 6: Review Checklist

Before considering a component complete:

```
□ TypeScript: no `any`, all props typed
□ npx tsc --noEmit passes
□ npm run check passes (biome)
□ Server/client boundary correct (no hooks in server component)
□ Uses design system colors/spacing (no inline styles, no arbitrary Tailwind)
□ Loading state handled (skeleton or conditional render)
□ Error state handled (inline message or null render)
□ Empty state handled (if rendering a list)
□ All accessibility checklist items above pass
□ Tested in browser at mobile width (375px) and desktop (1280px)
□ Premium-only features wrapped in <PremiumGate>
```

---

## Common Patterns Reference

### Sale Price Display
```tsx
<div className="flex items-center gap-2">
  {item.sale_price != null && (
    <span className="text-lg font-bold text-green-700">
      ${item.sale_price.toFixed(2)}
      {item.unit && <span className="text-sm font-normal">/{item.unit}</span>}
    </span>
  )}
  {item.regular_price != null && (
    <span className="text-sm text-gray-400 line-through">
      ${item.regular_price.toFixed(2)}
    </span>
  )}
  {item.discount_pct != null && item.discount_pct > 0 && (
    <Badge variant="green">{Math.round(item.discount_pct)}% off</Badge>
  )}
</div>
```

### Premium Gate
```tsx
{user.tier === "premium" ? (
  <ActualFeatureComponent />
) : (
  <PremiumGate featureName="Dietary preferences">
    <ActualFeatureComponent /> {/* blurred behind the gate */}
  </PremiumGate>
)}
```

### Responsive Grid
```tsx
{/* 1 col mobile → 2 col tablet → 3 col desktop */}
<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
  {items.map(item => <ItemCard key={item.id} {...item} />)}
</div>
```
