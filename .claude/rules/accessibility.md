# Rule: Accessibility (WCAG 2.1 AA)

## Interactive Elements
- Every `<button>` must have descriptive text content or `aria-label`
- Icon-only buttons require `aria-label`: `<button aria-label="Close menu">`
- Links must describe their destination — never "click here" or "read more"
- Avoid `onClick` on non-interactive elements (`div`, `span`) — use `<button>`

## Keyboard Navigation
- All interactive elements must be reachable by Tab
- Focus ring must be visible — never `outline: none` without a custom replacement
- Tailwind: use `focus-visible:ring-2 focus-visible:ring-green-600` on interactive elements
- Modal/dialog: trap focus inside when open, return focus on close

## Images
- All `<Image>` components require meaningful `alt` text
- Decorative images: `alt=""` (empty string, not missing)
- Never use image text as the only way to convey information

## Forms
- Every input must have an associated `<label>` (explicit `htmlFor` or wrapping)
- Required fields: `required` attribute + visual indicator
- Error messages: associated with the field via `aria-describedby`

## Color and Contrast
- Text on white background: minimum 4.5:1 contrast ratio
- Green-600 (`#16a34a`) on white: passes AA ✅
- Gray-400 on white: fails for body text — use gray-600 minimum for readable text
- Never use color as the only means to convey information (e.g. sale badges also use text)

## Semantic HTML
- Use `<main>`, `<nav>`, `<section>`, `<article>`, `<header>`, `<footer>` appropriately
- Heading hierarchy: one `<h1>` per page, don't skip levels (h1 → h2 → h3)
- Lists of items: use `<ul>` / `<ol>` — not a series of `<div>`s

## Screen Reader
- Loading states: `aria-live="polite"` for async content updates
- Dynamic content: `aria-busy="true"` while loading
- Price discounts: ensure both sale and regular price are readable
  (don't rely solely on strikethrough visual)
