# Contributing to PicWall

Thanks for considering a contribution! This is a small local-first app — keep
the spirit: **zero external services, zero database, boring tech**.

## Getting started

```bash
npm ci
npm run dev        # http://localhost:3000
```

## Checks (all must pass before a PR)

```bash
npx tsc --noEmit                 # typecheck
npm test                         # unit tests
npx vitest run --coverage        # + 100% coverage gate (statements/branches/functions/lines)
npx next build                   # production build
npx playwright test              # E2E (needs dev server running)
```

## Rules

- **All PRs go through GitHub PRs** — no direct pushes to `main`.
- Squash-merge on green CI.
- Keep storage boundary: `uploads/` + `manifest.json` only. No DB.
- Uploads are validated by magic-byte sniffing — don't weaken it.
- `i18n` text goes through `lib/i18n.ts` dictionaries — no hardcoded UI strings.
- New untested files fail CI (coverage `include` covers `lib/**` + `app/api/**`).

## Testing notes

- Tests use `PICWALL_DATA_DIR` / `PICWALL_MANIFEST` env vars to isolate storage.
- E2E seeds fixtures via `node scripts/seed-e2e-fixtures.mjs`.
