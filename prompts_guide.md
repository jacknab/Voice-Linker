# Voice Prompt Recording Guide

Every prompt listed here has a corresponding `playPrompt()` call in `server/routes.ts`.  
Drop the recorded `.mp3` into the `uploads/` folder — the system will use your recording automatically instead of the TTS fallback.

---

## Recording Format Notes

- **Format:** MP3, mono, 8 kHz or 16 kHz (standard telephony quality)
- **Tone:** Clear, calm, and consistent across all files
- **Silence:** Trim long silences at the start and end for a snappier experience
- **Pacing:** Speak slightly slower than normal — callers are listening on a phone

---

## 1. Entry & New Caller Welcome

| File Name | Script to Record | When It Plays |
|-----------|-----------------|---------------|
| `no_caller_id.mp3` | "We could not identify your call. Goodbye." | No caller ID detected at entry |
| `welcome_record_name.mp3` | "Welcome! Before using the system you must create a short voice profile. First, say your first name only after the tone. You have 5 seconds." | First-time caller — prompts name recording |
| `error_generic.mp3` | "An error occurred. Please try again later." | Generic catch-all error handler across all routes |
| `region_not_active.mp3` | "This phone number is not currently active. Please try again later." | Regional entry — region not found in system |
| `region_unavailable.mp3` | "This market is temporarily unavailable. Please try again later." | Regional entry — region set to inactive |

---

## 2. Name & Greeting Recording Flow

| File Name | Script to Record | When It Plays |
|-----------|-----------------|---------------|
| `name_retry.mp3` | "We didn't catch your name. Please try again." | Name recording was silent or too short |
| `name_saved_record_greeting.mp3` | "Great. Now record your greeting for other callers. After the tone, you have 60 seconds." | After name is saved — prompts greeting recording |
| `greeting_error.mp3` | "That greeting was too short. Please try again after the tone." | Greeting recording was under 3 seconds |
| `profile_save_error.mp3` | "We could not save your profile. Please try again." | Database error saving the profile |
| `profile_saved.mp3` | "Your greeting has been saved." | After caller accepts their recording in the review step |
| `no_greeting_found.mp3` | "No greeting found." | Caller tries to hear their greeting but none exists |
| `session_expired_greeting.mp3` | "Your session has expired. Please re-record your greeting." | Caller pressed 3 to accept but the draft was lost from memory |

---

## 3. Greeting Setup Menu (Returning Callers)

| File Name | Script to Record | When It Plays |
|-----------|-----------------|---------------|
| `greeting_setup.mp3` | "Your last greeting you recorded is still available. To use it again, press 1. To record a new greeting, press 2. To hear your greeting, press 3. To repeat these choices, press 9. To continue, press pound." | Returning caller entry gate |
| `rerecord_name.mp3` | "Let's re-record your profile. First, say your first name only after the tone. You have 5 seconds." | Caller presses 2 at the main menu to re-record |

---

## 4. Review Greeting Menu

| File Name | Script to Record | When It Plays |
|-----------|-----------------|---------------|
| `review_greeting.mp3` | "To hear your greeting, press 1. To re-record, press 2. To accept and continue, press 3. To repeat these choices, press 9." | After finishing a recording — review screen |

---

## 5. Main Menu

| File Name | Script to Record | When It Plays |
|-----------|-----------------|---------------|
| `main_menu.mp3` | "Welcome to the voice line. Press 1 to listen to profiles. Press 2 to re-record your profile. Press 4 for information, prices, and membership." | Main menu every time a caller reaches it |
| `access_expired.mp3` | "Your access has expired." | Caller's remaining minutes hit zero |
| `invalid_choice.mp3` | "Invalid choice." | Any menu — unrecognised key press |

---

## 6. Browsing Profiles

| File Name | Script to Record | When It Plays |
|-----------|-----------------|---------------|
| `no_profiles.mp3` | "There are no profiles available right now. Please call back later." | No active profiles to browse |
| `profile_options.mp3` | "Press 1 to send this caller a message. Press 2 to skip to the next profile. Press 9 to return to main menu." | After each profile greeting plays |

---

## 7. Time Warning (< 15 Minutes Remaining)

| File Name | Script to Record | When It Plays |
|-----------|-----------------|---------------|
| `trial_warning.mp3` | "You have less than 15 minutes remaining in your free trial. Stay connected by joining now. You won't be interrupted by ads. Access member only features like off-line messaging and connect live for one on one chat. To join right now press 1. To continue press pound." | Free trial caller with fewer than 15 minutes left |
| `member_warning.mp3` | "You have less than 15 minutes remaining in your membership. To renew now press 1. To continue press pound." | Paid member with fewer than 15 minutes left |

---

## 8. Messages

| File Name | Script to Record | When It Plays |
|-----------|-----------------|---------------|
| `message_options.mp3` | "Press 1 to reply to this message. Press 2 to hear the sender's profile. Press 3 to continue browsing profiles. Press 9 to return to the main menu." | After an unread voice message plays |
| `record_reply.mp3` | "Record your reply after the tone." | Caller presses 1 to reply to a message |
| `record_message.mp3` | "Record your message after the tone." | Caller presses 1 to send a new message from a profile or sender menu |
| `message_sent.mp3` | "Your message has been sent. Returning to profiles." | After a voice message is saved successfully |
| `message_send_error.mp3` | "Failed to send your message. Returning to profiles." | Database error saving the message |

---

## 9. Info & Membership Info Menus

| File Name | Script to Record | When It Plays |
|-----------|-----------------|---------------|
| `info_menu.mp3` | "Information, prices, and membership. Press 1 for membership questions. Press 9 to return to the main menu." | Caller presses 4 from the main menu |
| `membership_questions.mp3` | "Membership questions. Press 1 to learn how membership works. Press 2 to hear our pricing. Press 3 to purchase a membership with a credit card. Press 9 to return to the main menu." | Info menu → press 1 |
| `membership_how_it_works.mp3` | "Here is how membership works. As a member, you get full access to the voice line community. Members can browse unlimited caller profiles, send and receive voice messages, and enjoy priority access to new features. We offer three membership options: a 24 hour pass, a 14 day membership, and a 30 day membership. Your remaining time is tracked in hours. When you have less than 60 minutes left, the system will tell you in minutes. Choose the option that works best for you." | Membership questions → press 1 |
| `membership_pricing.mp3` | "Here are our membership prices. A 24 hour pass is 3 dollars. A 14 day membership is 10 dollars. A 30 day membership is 25 dollars. To purchase, press 3 from the membership menu." | Membership questions → press 2 |

---

## 10. Membership Package Selection

| File Name | Script to Record | When It Plays |
|-----------|-----------------|---------------|
| `package_cancelled.mp3` | "Cancelled. Returning to the main menu." | Caller presses # to cancel package selection |
| `package_invalid.mp3` | "Invalid selection." | Caller presses an unrecognised key during package selection |
| `package_confirm_30day.mp3` | "You selected 30 Day access for 25 dollars." | Caller selects the 30-day package (option 1) |
| `package_confirm_14day.mp3` | "You selected 14 Day access for 10 dollars." | Returning member selects the 14-day package (option 2) |
| `package_confirm_14day_bonus.mp3` | "Great choice! You selected 14 days access for 10 dollars, including your free 7-day first purchase bonus." | First-time member selects the 14-day package (option 2) |
| `package_confirm_24hour.mp3` | "You selected 24 Hour access for 3 dollars." | Caller selects the 24-hour package (option 3) |

---

## 11. Payment Processing & Results

| File Name | Script to Record | When It Plays |
|-----------|-----------------|---------------|
| `payment_session_expired.mp3` | "Your session has expired. Please try again." | Payment handler — session data was lost from memory |
| `payment_success_30day.mp3` | "Payment successful! You now have 30 Day access. Your card has been charged 25 dollars. Thank you for joining. Returning to the main menu." | Successful 30-day purchase |
| `payment_success_14day.mp3` | "Payment successful! You now have 14 Day access. Your card has been charged 10 dollars. Thank you for joining. Returning to the main menu." | Successful 14-day purchase (returning member) |
| `payment_success_14day_bonus.mp3` | "Payment successful! You now have 14 Day access. Your card has been charged 10 dollars. Plus your bonus minutes have been added — enjoy your full membership! Thank you for joining. Returning to the main menu." | Successful 14-day purchase (first-time member, with bonus) |
| `payment_success_24hour.mp3` | "Payment successful! You now have 24 Hour access. Your card has been charged 3 dollars. Thank you for joining. Returning to the main menu." | Successful 24-hour purchase |
| `payment_activation_error.mp3` | "Your payment was received but there was an error activating your membership. Please contact support." | Payment charged but database update failed |
| `payment_declined.mp3` | "Your card was declined. Please check your details and try again later." | Twilio Pay error code 22001 — card declined |
| `payment_failed.mp3` | "Your payment could not be completed at this time. Please try again later." | Any other Twilio Pay failure |

---

## 12. Number Files (29 files total)

The system composes any number by playing at most two files in sequence — a tens file followed by a ones file.  
Only 29 recordings are needed to cover all values from 0 to 100.

**How it works:**
- **0–19** → played as a single file (one recording per number)
- **20, 30, 40 … 90** → played as a single tens file
- **21–99 (non-multiples of 10)** → played as tens file + ones file  
  e.g. 47 → `num_40.mp3` + `num_7.mp3` → "forty" + "seven"
- **100** → single file

Record each as a clean standalone word — no leading or trailing context.

### Group A — 0 to 19 (20 files)

| File | Say | File | Say | File | Say | File | Say |
|------|-----|------|-----|------|-----|------|-----|
| `num_0.mp3` | "zero" | `num_5.mp3` | "five" | `num_10.mp3` | "ten" | `num_15.mp3` | "fifteen" |
| `num_1.mp3` | "one" | `num_6.mp3` | "six" | `num_11.mp3` | "eleven" | `num_16.mp3` | "sixteen" |
| `num_2.mp3` | "two" | `num_7.mp3` | "seven" | `num_12.mp3` | "twelve" | `num_17.mp3` | "seventeen" |
| `num_3.mp3` | "three" | `num_8.mp3` | "eight" | `num_13.mp3` | "thirteen" | `num_18.mp3` | "eighteen" |
| `num_4.mp3` | "four" | `num_9.mp3` | "nine" | `num_14.mp3` | "fourteen" | `num_19.mp3` | "nineteen" |

### Group B — Tens (9 files)

| File | Say | File | Say | File | Say |
|------|-----|------|-----|------|-----|
| `num_20.mp3` | "twenty" | `num_50.mp3` | "fifty" | `num_80.mp3` | "eighty" |
| `num_30.mp3` | "thirty" | `num_60.mp3` | "sixty" | `num_90.mp3` | "ninety" |
| `num_40.mp3` | "forty" | `num_70.mp3` | "seventy" | `num_100.mp3` | "one hundred" |

---

## 13. Phrase Fragments

These short phrases are stitched together with the number files above to form complete sentences.  
Record each as a natural, flowing phrase — as if it were the middle of a sentence (no unnatural pauses at the start or end).

### Caller Count Phrases

| File Name | Say | Used In |
|-----------|-----|---------|
| `phrase_there_is.mp3` | "There is" | "There is **[N]** guy on the line." |
| `phrase_there_are.mp3` | "There are" | "There are **[N]** guys on the line." |
| `phrase_caller_on_the_line.mp3` | "guy on the line." | Singular caller count ending |
| `phrase_callers_on_the_line.mp3` | "guys on the line." | Plural caller count ending |

### Time Remaining Phrases

| File Name | Say | Used In |
|-----------|-----|---------|
| `phrase_you_have.mp3` | "You have" | Starts all time-remaining announcements |
| `phrase_you_have_1_hour_and.mp3` | "You have 1 hour and" | "You have 1 hour and **[N]** minutes remaining." |
| `phrase_hour_of_pbtr.mp3` | "hour of phone booth time remaining." | "You have 1 **hour of phone booth time remaining.**" |
| `phrase_hours_of_pbtr.mp3` | "hours of phone booth time remaining." | "You have **[N]** **hours of phone booth time remaining.**" |
| `phrase_minute_of_pbtr.mp3` | "minute remaining." | "You have 1 **minute remaining.**" |
| `phrase_minutes_of_pbtr.mp3` | "minutes remaining." | "You have **[N]** **minutes remaining.**" |

**How announcements are assembled:**

| Scenario | Files played in order |
|----------|-----------------------|
| 2+ hours remaining (e.g. 5 hours) | `phrase_you_have` → `num_5` → `phrase_hours_of_pbtr` |
| Exactly 1 hour remaining | `phrase_you_have` → `num_1` → `phrase_hour_of_pbtr` |
| 1 hour and X minutes (e.g. 1h 23m) | `phrase_you_have_1_hour_and` → `num_23` → `phrase_minutes_of_pbtr` |
| Under 60 minutes (e.g. 14 minutes) | `phrase_you_have` → `num_14` → `phrase_minutes_of_pbtr` |
| Exactly 1 minute | `phrase_you_have` → `num_1` → `phrase_minute_of_pbtr` |
| 8 guys on the line | `phrase_there_are` → `num_8` → `phrase_callers_on_the_line` |
| 1 guy on the line | `phrase_there_is` → `num_1` → `phrase_caller_on_the_line` |

> **Note:** For hour values above 100 (e.g. a full 30-day membership = 720 hours), the system uses TTS for the number only and falls back gracefully. All other values are fully covered by the recorded files.

---

## Notes

- **Existing audio files already in `uploads/`:** `membership_packages_*.mp3` and `payment_intro_*.mp3` are already loaded and used directly — they do not go through `playPrompt()` and do not need to be re-recorded unless you want to replace them.
