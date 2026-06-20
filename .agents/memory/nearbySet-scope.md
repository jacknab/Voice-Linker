---
name: nearbySet scope fix
description: browse-profiles handler nearbySet was declared inside if(!state) but used in reconciliation block
---

In `ivr-no-mailbox.ts` browse-profiles handler, `nearbySet` was declared with `const` inside `if (!state) { ... }` (the "build new queue" branch), but then referenced at reconciliation time (outside that block) when re-adding returning callers.

**Fix:** Hoist with `let nearbySet = new Set<string>()` before the `if (!state)` block, then use `nearbySet = new Set<string>(...)` (assignment without `const`) inside the block.

**Why:** In reconciliation mode (existing session), `nearbySet` is empty — returning callers get `isNearby: false`. This is safe since nearby tagging is best-effort (display only).

**How to apply:** Any Set/Map that is built conditionally but read unconditionally must be hoisted to the outer scope with a safe default value.
