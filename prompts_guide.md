# System Prompts Recording Guide

This document lists all the voice prompts used in the application. You can record these as `.mp3` or `.wav` files.  
Once recorded, upload them to `client/public/audio/` and update `server/routes.ts` to use `<Play>https://your-domain.com/audio/filename.mp3</Play>` instead of `<Say>`.

---

## Recording Format Notes
- **Format:** Mono, 8kHz or 16kHz MP3 or WAV (standard for telephony)
- **Tone:** Clear, calm, and consistent across all files
- **Silence:** Trim long silences at the start/end for a snappier experience
- **Pacing:** Speak slightly slower than normal — callers are listening on a phone

---

## 1. Entry & Profile Setup

| File Name | Script / Prompt Text | Location in Flow |
|-----------|----------------------|-----------------|
| `welcome_new.mp3` | "Welcome! Before using the system you must record a short personal profile. After the tone, record your profile. You have 30 seconds." | New User Entry |
| `profile_saved.mp3` | "Your profile has been saved." | After Recording Profile |
| `no_caller_id.mp3` | "We could not identify your caller ID. Goodbye." | Entry Error |

---

## 2. Main Menu

| File Name | Script / Prompt Text | Location in Flow |
|-----------|----------------------|-----------------|
| `main_menu.mp3` | "Welcome to the voice line. Press 1 to listen to profiles. Press 2 to re-record your profile. Press 4 for information, prices, and membership." | Main Menu |
| `re_record_prompt.mp3` | "After the tone, record your new profile. You have 30 seconds." | Re-record Menu |

---

## 3. Browsing Profiles

| File Name | Script / Prompt Text | Location in Flow |
|-----------|----------------------|-----------------|
| `profile_options.mp3` | "Press 1 to send this caller a message. Press 2 to skip to the next profile. Press 9 to return to main menu." | After Random Profile |
| `no_profiles.mp3` | "There are no other profiles available at this time." | Browsing (Empty) |

---

## 4. Messages

| File Name | Script / Prompt Text | Location in Flow |
|-----------|----------------------|-----------------|
| `new_message.mp3` | "You have a new message." | Message Delivery |
| `message_options.mp3` | "Press 1 to reply to this message. Press 2 to hear the sender's profile. Press 3 to continue browsing profiles. Press 9 to return to the main menu." | After Hearing Message |
| `sender_profile_options.mp3` | "Press 1 to send a message. Press 2 to continue browsing profiles. Press 9 to return to main menu." | After Sender Profile |
| `record_message.mp3` | "Record your message after the tone." | Send Message Flow |
| `record_reply.mp3` | "Record your reply after the tone." | Reply Flow |
| `message_sent.mp3` | "Your message has been sent." | After Recording Message |

---

## 5. Information & Membership Info Menus

| File Name | Script / Prompt Text | Location in Flow |
|-----------|----------------------|-----------------|
| `info_menu.mp3` | "Information, prices, and membership. Press 1 for membership questions. Press 9 to return to the main menu." | Info Menu |
| `membership_questions.mp3` | "Membership questions. Press 1 to learn how membership works. Press 2 to hear our pricing. Press 3 to purchase a membership with a credit card. Press 9 to return to the main menu." | Membership Questions Menu |
| `membership_how_it_works.mp3` | "Here is how membership works. As a member, you get full access to the voice line community. Members can browse unlimited caller profiles, send and receive voice messages, and enjoy priority access to new features. We offer three membership options: a 24 hour pass, a 7 day membership, and a 30 day membership. Choose the option that works best for you." | How Membership Works |
| `membership_pricing.mp3` | "Here are our membership prices. A 24 hour pass is 2 dollars and 99 cents. A 7 day membership is 16 dollars and 99 cents. A 30 day membership is 29 dollars and 99 cents. To purchase, press 3 from the membership menu." | Membership Pricing |

---

## 6. Membership Purchase — Package Selection

> **Note:** This section uses an existing audio file (`membership_packages_*.mp3`) already uploaded to the system.  
> If you re-record it, the script should say the following:

| File Name | Script / Prompt Text | Location in Flow |
|-----------|----------------------|-----------------|
| `membership_packages.mp3` | "Choose your membership package. Press 1 for 30 days access for 25 dollars. Press 2 for 14 days access for 10 dollars — first-time members receive an extra 7 days free. Press 3 for 24 hour access for 3 dollars. Press 9 to hear these options again. Press pound to cancel and return to the main menu." | Package Selection Menu |
| `package_confirm_30day.mp3` | "You selected 30 Day access for 25 dollars." | After Selecting Package 1 |
| `package_confirm_14day.mp3` | "You selected 14 Day access for 10 dollars." | After Selecting Package 2 (returning member) |
| `package_confirm_14day_bonus.mp3` | "Great choice! You selected 14 days access for 10 dollars, including your free 7-day first purchase bonus." | After Selecting Package 2 (first-time member) |
| `package_confirm_24hour.mp3` | "You selected 24 Hour access for 3 dollars." | After Selecting Package 3 |
| `package_invalid.mp3` | "Invalid selection." | Invalid Key Press |
| `package_cancelled.mp3` | "Cancelled. Returning to the main menu." | Press # to cancel |

---

## 7. Card Number Collection

| File Name | Script / Prompt Text | Location in Flow |
|-----------|----------------------|-----------------|
| `payment_intro.mp3` | "We will now collect your credit card information." | Before Card Entry Begins |
| `collect_card_number.mp3` | "Please enter your 16-digit card number now." | Card Number Prompt |
| `collect_card_number_retry.mp3` | "We did not receive your card number. Please try again." | No Input Timeout |
| `card_number_invalid.mp3` | "Invalid card number. Please try again." | Wrong Number of Digits |

---

## 8. Expiration Date Collection

| File Name | Script / Prompt Text | Location in Flow |
|-----------|----------------------|-----------------|
| `collect_card_expiry.mp3` | "Please enter your card expiration date as 4 digits. For example, enter 0 1 2 6 for January 2026." | Expiry Date Prompt |
| `collect_card_expiry_retry.mp3` | "We did not receive your expiration date. Please try again." | No Input Timeout |
| `card_expiry_invalid.mp3` | "Invalid expiration date. Please enter 4 digits. For example, 0 1 2 6 for January 2026." | Wrong Format |
| `card_expiry_month_invalid.mp3` | "Invalid expiration month. Please try again." | Month Out of Range |

---

## 9. Security Code (CVV) Collection

| File Name | Script / Prompt Text | Location in Flow |
|-----------|----------------------|-----------------|
| `collect_card_cvv.mp3` | "Please enter your 3 or 4 digit card security code, then press pound." | CVV Prompt |
| `collect_card_cvv_retry.mp3` | "We did not receive your security code. Please try again." | No Input Timeout |
| `card_cvv_invalid.mp3` | "Invalid security code. Please try again." | Wrong Format |

---

## 10. Payment Processing & Results

| File Name | Script / Prompt Text | Location in Flow |
|-----------|----------------------|-----------------|
| `payment_processing.mp3` | "Thank you. Please hold while we process your payment." | While Stripe Charge is Running |
| `payment_session_expired.mp3` | "Your session has expired. Please start over." | Session Timeout |
| `payment_success_30day.mp3` | "Payment successful! You now have 30 Day access. Your card has been charged 25 dollars. Thank you for joining. Returning to the main menu." | Successful 30-Day Purchase |
| `payment_success_14day.mp3` | "Payment successful! You now have 14 Day access. Your card has been charged 10 dollars. Thank you for joining. Returning to the main menu." | Successful 14-Day Purchase |
| `payment_success_14day_bonus.mp3` | "Payment successful! You now have 14 Day access. Your card has been charged 10 dollars. Plus your free extra 7 days have been added — enjoy 14 days total! Thank you for joining. Returning to the main menu." | Successful 14-Day First Purchase (with bonus) |
| `payment_success_24hour.mp3` | "Payment successful! You now have 24 Hour access. Your card has been charged 3 dollars. Thank you for joining. Returning to the main menu." | Successful 24-Hour Purchase |
| `payment_declined.mp3` | "Your payment was declined. Please check your card details and try again. Returning to the main menu." | Card Declined by Stripe |
| `payment_failed.mp3` | "Your payment could not be completed at this time. Please try again later. Returning to the main menu." | Payment Not Completed |
| `payment_unavailable.mp3` | "Payment processing is not available right now. Please try again later. Returning to the main menu." | Stripe/Server Error |

---

## 11. General Error Prompts

| File Name | Script / Prompt Text | Location in Flow |
|-----------|----------------------|-----------------|
| `invalid_choice.mp3` | "Invalid choice." | Any Menu — Invalid Key Press |
| `error_generic.mp3` | "An error occurred. Please try again later." | Catch-all Error Handler |
