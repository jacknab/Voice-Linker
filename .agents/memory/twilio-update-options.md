---
name: twilio update options
description: Twilio SDK type constraints for call update and phone number listing
---

**`client.calls(sid).update(options)`:**
- `statusCallbackEvent` does NOT exist in `CallContextUpdateOptions` — it is only valid at call creation (`client.calls.create()`). Remove it from update calls.
- `statusCallbackMethod` is a string enum; cast with `"POST" as any` to avoid TS2769.

**`client.availablePhoneNumbers("US").local.list({ areaCode })`:**
- `areaCode` must be a `number`, not a `string`. Use `Number(areaCode)` not `String(areaCode)`.

**Why:** Twilio SDK types are strict about these fields and TypeScript catches mismatches as TS2769 (no overload matches).
