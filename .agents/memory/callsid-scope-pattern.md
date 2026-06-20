---
name: callSid scope pattern
description: How callSid must be declared in IVR route handlers to avoid TS2304 errors
---

Every `app.post("/voice/...")` handler that calls `getOrCreateUser(fromNumber, callSid)` or any Map/Set keyed by callSid must have an explicit declaration in scope.

**The rule:** Declare `const callSid = req.body?.CallSid as string;` at the top of the handler body (after `const fromNumber = req.body?.From as string;`).

**Exception — branch-scoped fromNumber:** If `fromNumber` is declared inside a branch (e.g. `digit === "3"` or `digit === "7"`), add `const callSid = req.body?.CallSid as string;` in the same branch, not at the handler top level.

**Exception — inside try block:** If `fromNumber` is declared inside a `try {}` block (e.g. `handle-zip-code`), add `callSid` right after it inside the same try block.

**Why:** TypeScript TS2304 ("Cannot find name 'callSid'") fires when `callSid` is referenced without a declaration in the enclosing function scope. The variable is never hoisted from module level.

**How to apply:** Before adding a new IVR route handler that calls `getOrCreateUser`, always add both `fromNumber` and `callSid` from `req.body` at the handler entry point.

**Files fixed:** `server/ivr-default.ts` (all handlers), `server/ivr-no-mailbox.ts` (all handlers including handle-greeting-setup, review-greeting, handle-review-greeting, handle-promo-code, cs-account-status, cs-billing-info, handle-zip-code, manage-membership, customer-service, record-category-ad, handle-record-category-ad, save-category-ad, and branch-scoped digit "3" / digit "7" in handle-profile-menu).
