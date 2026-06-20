---
name: tsconfig-server
description: tsconfig.server.json setup for fast server-only TypeScript validation
---

`tsconfig.server.json` at repo root extends `tsconfig.json` and:
- Includes only `server/**/*` and `shared/**/*` (excludes `client/src`)
- Sets `"target": "ES2017"` to allow Map/Set/iterator usage without `downlevelIteration`
- Sets `"noEmit": true` and `"incremental": false`

**Why:** Running `tsc` on the full project times out (client/src is large). The server-only config completes in ~30-60s. Without `target: ES2017`, every `for...of` on a Map or Set triggers TS2802.

**How to apply:** Run `npx tsc --project tsconfig.server.json --noEmit` for server-side type checks. This is wired into `script/build.ts` as a post-build validation step.
