# /generate-component — Scaffold a React Component

Create a new component with TypeScript types, props, and tests.

## Usage
```
/generate-component <ComponentName> [--client] [--page]
```
Examples:
- `/generate-component MealCard` — server component
- `/generate-component StoreSelector --client` — client component with hooks
- `/generate-component SavingsBadge` — small UI atom

## Output Files
```
apps/web/src/components/
└── <ComponentName>.tsx
```

## Template: Server Component
```tsx
// No 'use client' — runs on server, no useState/useEffect
import { type ReactNode } from "react";

interface <ComponentName>Props {
  // define props with explicit types, no 'any'
}

export function <ComponentName>({ }: <ComponentName>Props) {
  return (
    <div className="">
      {/* content */}
    </div>
  );
}
```

## Template: Client Component
```tsx
"use client";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

interface <ComponentName>Props {
  // props
}

export function <ComponentName>({ }: <ComponentName>Props) {
  const [state, setState] = useState<...>(null);
  // const { data } = trpc.<router>.<procedure>.useQuery();

  return (
    <div className="">
      {/* content */}
    </div>
  );
}
```

## Conventions to Follow
- Use Tailwind utility classes only (no inline styles)
- Color palette: green-600 (primary), amber-500 (secondary), gray-*
- Border radius: `rounded-xl` (cards), `rounded-lg` (inputs), `rounded-full` (badges)
- Shadows: `shadow-sm` standard, `shadow-md` on hover
- Loading states: skeleton divs with `animate-pulse bg-gray-200`
- Reuse: `<Badge>`, `<Button>` from `components/ui/`

## Accessibility Requirements
- `<button>` elements must have descriptive text or `aria-label`
- Images need `alt` text
- Interactive elements must be keyboard-reachable
- Form inputs need associated `<label>`
