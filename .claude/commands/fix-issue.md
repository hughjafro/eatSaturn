# /fix-issue — GitHub Issue → Fix → PR

Fetch a GitHub issue, diagnose, fix, test, and open a PR.

## Usage
```
/fix-issue <issue-number>
```
Example: `/fix-issue 42`

## Steps

### 1. Fetch Issue
```bash
gh issue view <n> --json title,body,labels,assignees
```

### 2. Diagnose
- Read the issue description and reproduction steps
- Identify affected files from the component/route mentioned
- Check recent commits touching those files: `git log --oneline -20 -- <file>`

### 3. Reproduce Locally
- Follow the reproduction steps in the issue
- Confirm the bug exists before writing any fix

### 4. Fix
- Make the minimal change that resolves the issue
- Do not refactor unrelated code in the same PR
- If the fix touches a scraper, update the test fixture

### 5. Test
```bash
# TypeScript
npx tsc --noEmit
npm run check

# Python (if scraper touched)
poetry run pytest

# Manual smoke test of the specific flow
```

### 6. Commit
```bash
git add -p   # stage only relevant changes
git commit -m "fix(<scope>): <short description>

Fixes #<issue-number>

<brief explanation of root cause and fix>"
```

### 7. Open PR
```bash
gh pr create \
  --title "fix(<scope>): <description>" \
  --body "Fixes #<n>

## Root Cause
<what caused it>

## Fix
<what was changed>

## Testing
<how you verified the fix>"
```

## Scope Reference
| Area | Scope |
|---|---|
| Meal plan generation | `meal-plan` |
| Scraper | `scraper` |
| Auth / user | `auth` |
| Database / RLS | `db` |
| UI components | `ui` |
| Payments | `stripe` |
