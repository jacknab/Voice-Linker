# System Prompts Recording Guide

This document lists all the voice prompts used in the application. You can record these as `.mp3` or `.wav` files. 
Once recorded, upload them to `client/public/audio/` and update `server/routes.ts` to use `<Play>https://your-domain.com/audio/filename.mp3</Play>` instead of `<Say>`.

| File Name | Script / Prompt Text | Location in Flow |
|-----------|----------------------|-----------------|
| `welcome_new.mp3` | "Welcome! Before using the system you must record a short personal profile. After the tone, record your profile. You have 30 seconds." | New User Entry |
| `profile_saved.mp3` | "Your profile has been saved." | After Recording Profile |
| `main_menu.mp3` | "Welcome to the voice line. Press 1 to listen to profiles. Press 2 to re-record your profile." | Main Menu |
| `new_message.mp3` | "You have a new message." | Message Delivery |
| `message_options.mp3` | "Press 1 to reply to this message. Press 2 to hear the sender's profile. Press 3 to continue browsing profiles. Press 9 to return to the main menu." | After Hearing Message |
| `record_reply.mp3` | "Record your reply after the tone." | Reply Flow |
| `sender_profile_options.mp3` | "Press 1 to send a message. Press 2 to continue browsing profiles. Press 9 to return to main menu." | After Sender Profile |
| `profile_options.mp3` | "Press 1 to send this caller a message. Press 2 to hear the next profile. Press 9 to return to main menu." | After Random Profile |
| `record_message.mp3` | "Record your message after the tone." | Send Message Flow |
| `message_sent.mp3` | "Your message has been sent." | After Recording Message |
| `no_profiles.mp3` | "There are no other profiles available at this time." | Browsing (Empty) |
| `invalid_choice.mp3` | "Invalid choice." | Error Handling |
| `error_generic.mp3` | "An error occurred. Please try again later." | Error Handling |
| `no_caller_id.mp3` | "We could not identify your caller ID. Goodbye." | Entry Error |
| `re_record_prompt.mp3` | "After the tone, record your new profile. You have 30 seconds." | Re-record Menu |

## Technical Notes for Recording:
- **Format:** Mono, 8kHz or 16kHz MP3 or WAV is standard for telephony, though Twilio supports most modern formats.
- **Tone:** Clear, friendly, and consistent across all files.
- **Silence:** Trim any long silences at the beginning or end of the recordings for a snappier user experience.
