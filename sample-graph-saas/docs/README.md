# saas-starter

Welcome to **saas-starter** — the sample Graph SaaS workspace bundled with Project OS.

Use this file to verify Markdown preview in the Code editor (source / preview / split) and in Diff review.

## What’s in this project

- **Authentication** — login, sessions, and protected routes
- **Dashboard** — analytics cards and user overview
- **Billing** — pricing pages and checkout flow
- **Admin** — user management and analytics

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in the Browser panel.

## Key modules

| Area | Entry | Notes |
|------|-------|-------|
| Login | `app/login/page.tsx` | Uses `LoginForm` |
| Auth API | `app/api/auth/route.ts` | Session creation |
| Dashboard | `app/dashboard/page.tsx` | Post-login home |

## Code sample

```ts
import { createSession } from '@/lib/auth'

const session = await createSession(userId)
```

## Checklist for preview testing

1. Open this file from the **Directory** tree: `docs` → `README.md`
2. Switch to **Preview** — headings, table, and code blocks should render
3. Switch to **Split** — edit the list below; preview updates live
4. Try `Cmd+Shift+V` (macOS) or `Ctrl+Shift+V` (Windows/Linux) to toggle source/preview

- [ ] Source mode shows syntax highlighting
- [ ] Preview mode hides raw `#` markers
- [ ] Links open externally when running the desktop app

> **Tip:** Documentation files are not mapped to a feature node in the graph — that is expected for this sample.

---

*Last updated for Project OS markdown preview demo.*
