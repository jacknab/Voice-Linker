/**
 * audioAutogen.ts — Hourly background job that auto-generates missing audio prompts.
 *
 * Checks uploads/mm/, uploads/mw/, and uploads/mw_m/ for any prompt files
 * that don't exist yet and generates them via ElevenLabs one at a time.
 * Skips prompts with empty text (sound effects / custom uploads).
 * Runs once at startup (after a 60-second delay) and then every 60 minutes.
 */

import fs from "fs";
import path from "path";
import { generateTTS, getVoiceIdForFolder, getVoiceIdForRoger } from "./elevenlabs";
import { reverseGeocodeNeighborhood } from "./zipLookup";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

type Prompt = { filename: string; text: string };

// ── MM prompts (uploads/mm/) ───────────────────────────────────────────────
export const MM_PROMPTS: Prompt[] = [
  { filename: "system_greeting.mp3",    text: "Welcome to the Male Box. This service is for guys looking to connect with other local guys. No filters, no pressure — just real guys looking to connect." },
  { filename: "disclaimer.mp3",         text: "The Male Box is for callers 18 and over. If that's not you, hang up now. We do not check out callers to this line, so please use common sense and caution before giving out your address or phone number." },
  { filename: "no_caller_id.mp3",       text: "We could not identify your call. Goodbye." },
  { filename: "region_not_active.mp3",  text: "This phone number is not currently active. Please try again later." },
  { filename: "region_unavailable.mp3", text: "This market is temporarily unavailable. Please try again later." },
  { filename: "caller_blocked.mp3",     text: "Caller blocked. You will no longer hear this caller's profile." },
  { filename: "error_generic.mp3",      text: "An error occurred. Please try again later." },
  { filename: "invalid_choice.mp3",     text: "Invalid choice." },
  { filename: "goodbye.mp3",            text: "Thank you for calling. Goodbye." },

  { filename: "membership_entry_prompt.mp3", text: "Enter your membership card number now, or press pound to skip." },
  { filename: "membership_center.mp3",       text: "Membership center. To sign in to your membership press 1. To return to the main menu press pound." },
  { filename: "membership_pin_prompt.mp3",   text: "Please enter your 4-digit PIN." },
  { filename: "link_code_invalid.mp3",       text: "That code is invalid or has expired. Please generate a new code from your web account and try again." },
  { filename: "membership_invalid.mp3",      text: "We could not find a card with that number. Please check your card and try again." },
  { filename: "membership_linked.mp3",       text: "Card accepted." },
  { filename: "access_expired.mp3",          text: "Your access has expired." },
  { filename: "free_trial_expired.mp3",      text: "Your free trial has ended. We hope you enjoyed your time on the system. To keep your access and join the community as a full member, press 1 when you hear the menu." },
  { filename: "free_mode_announcement.mp3",  text: "Great news! All calls are completely free right now. No membership required. Enjoy unlimited time on the system. Connecting you now." },
  { filename: "free_trial_offer.mp3",        text: "We would like to offer you a free trial. To get your free trial now press 1. To get your free trial later press the pound key." },
  { filename: "free_trial_terms.mp3",        text: "Your free trial will expire in seven days and it must be used from this phone number." },

  { filename: "phone_booth_welcome.mp3",         text: "Welcome to the live connector. Greetings from all the local guys here right now. Swap private messages and then connect live for a totally private conversation. You can leave the connector anytime you want by pressing the pound sign." },
  { filename: "welcome_record_name.mp3",         text: "You need to record a greeting to introduce yourself to the other guys first. Let's record the name you want to use. After the tone, record just your first name." },
  { filename: "name_retry.mp3",                  text: "We didn't catch your name. Please try again." },
  { filename: "name_saved_record_greeting.mp3",  text: "Great. Now record your greeting for other callers. After the tone, press any key when done." },
  { filename: "greeting_error.mp3",              text: "That greeting was too short. Please try again after the tone. Press any key when done." },
  { filename: "greeting_setup.mp3",              text: "Your last greeting you recorded is still available. To use it again, press 1. To record a new greeting, press 2. To hear your greeting, press 3. To repeat these choices, press 9. To continue, press pound." },
  { filename: "review_greeting.mp3",             text: "If you're happy with the way your greeting sounds, press 1. To re-record, press 2. To hear how your greeting sounds, press 3. To repeat these choices, press 9." },
  { filename: "no_greeting_found.mp3",           text: "No greeting found." },
  { filename: "profile_saved.mp3",               text: "Your greeting has been saved." },
  { filename: "profile_save_error.mp3",          text: "We could not save your profile. Please try again." },
  { filename: "recording_rejected_unclear.mp3",       text: "We need you to re-record your greeting. We couldn't understand what you said. Please speak clearly into the phone so everyone can hear what you have to say about yourself and what you're looking for. Be sure to turn down any loud music or the television before you record. To re-record, press 1." },
  { filename: "recording_rejected_phone_number.mp3",  text: "We need you to re-record your greeting. Phone numbers are not allowed in your greeting and it will not be approved if it contains one. To re-record, press 1." },
  { filename: "recording_rejected_unclear_personal_ad.mp3",      text: "We need you to re-record your personal ad. We couldn't understand what you said. Please speak clearly into the phone so everyone can hear what you have to say. Be sure to turn down any loud music or the television before you record. To re-record, press 1." },
  { filename: "recording_rejected_phone_number_personal_ad.mp3", text: "We need you to re-record your personal ad. Phone numbers are not allowed in your personal ad and it will not be approved if it contains one. To re-record, press 1." },
  { filename: "zip_code_prompt.mp3",             text: "Optional: enter your 5-digit zip code and we'll play callers closest to you first. Press pound to skip." },
  { filename: "zip_code_saved.mp3",              text: "Got it. We'll use your zip code to show you nearby callers." },

  { filename: "main_menu.mp3",      text: "Main menu. To enter the male box press 1. To add time or purchase a membership press 2. For mailboxes and personal ads press 3. For information on membership prices press 4. For your voicemail press 6. To manage your membership press 8. Press 0 for time remaining, or 9 to repeat these choices." },
  { filename: "trial_warning.mp3",  text: "You have less than 5 minutes remaining in your free trial. Stay connected by joining now. You won't be interrupted by ads. Access member only features like off-line messaging, connect live for one on one chat. To join right now press 1. To continue press pound." },
  { filename: "member_warning.mp3", text: "You have less than 5 minutes remaining in your membership. To renew now press 1. To continue press pound." },
  { filename: "no_profiles.mp3",    text: "There are no profiles available right now. Please call back later." },

  { filename: "info_menu_v2.mp3",                text: "Information, prices, and membership. Press 1 for membership questions. To learn how the Male Box knows which callers are closest to you, press 2. Press 9 to return to the main menu." },
  { filename: "closest_callers_info.mp3",        text: "Here is how the Male Box finds callers closest to you. If we have your ZIP code, we use it to play nearby callers first when they are available. Your exact location is never announced, and other callers do not get your phone number or private information. If no nearby callers are available, you will still hear other active callers so the line keeps moving." },
  { filename: "membership_questions.mp3",        text: "Membership questions. Press 1 to learn how membership works. Press 2 to hear our pricing. Press 3 to purchase a membership with a credit card. Press 9 to return to the main menu." },
  { filename: "membership_how_it_works.mp3",     text: "Here is how membership works. As a member, you get full access to the voice line community. Members can browse unlimited caller profiles, send and receive voice messages, and enjoy priority access to new features. We offer three membership options: a day pass, a 14 day membership, and a 30 day membership. Your remaining time is tracked in hours. When you have less than 60 minutes left, the system will tell you in minutes. Choose the option that works best for you." },
  { filename: "membership_pricing.mp3",          text: "Here are our membership prices. A day pass is 3 dollars and expires 24 hours after purchase, regardless of how much you use the line. A 14 day membership is 10 dollars. A 30 day membership is 25 dollars. To purchase, press 3 from the membership menu." },
  // purchase_pre_menu.mp3 is DB-driven — generated in generateDynamicPackagePrompts()

  // ── Promo code results ────────────────────────────────────────────────────
  { filename: "promo_code_invalid.mp3",        text: "Invalid promo code. Returning to the main menu." },
  { filename: "promo_code_inactive.mp3",       text: "This promo code is no longer active. Returning to the main menu." },
  { filename: "promo_code_expired.mp3",        text: "This promo code has expired. Returning to the main menu." },
  { filename: "promo_code_max_uses.mp3",       text: "This promo code has reached its maximum number of uses. Returning to the main menu." },
  { filename: "promo_code_already_used.mp3",   text: "You have already redeemed this promo code. Returning to the main menu." },
  { filename: "promo_code_success.mp3",        text: "Your promo code has been accepted and your time has been added to your account. Enjoy your time on the line." },
  { filename: "payment_intro.mp3",               text: "Your purchase, plus any applicable fees and taxes, will appear on your credit card statement as Toby Media. When entering your card information: to correct an incorrect number, press star to delete the last digit entered. To start over, press the star key twice. If you're ready to enter your credit card information press 1." },
  { filename: "package_confirm_prefix.mp3",      text: "You selected" },
  { filename: "package_confirm_bonus_prefix.mp3",text: "Great choice! You selected" },
  { filename: "package_confirm_suffix.mp3",      text: "If this is correct press one. To select a different package press two." },
  { filename: "package_cancelled.mp3",           text: "Cancelled. Returning to the main menu." },
  { filename: "package_invalid.mp3",             text: "Invalid selection." },
  { filename: "payment_session_expired.mp3",     text: "Your session has expired. Please start again." },
  { filename: "payment_failed.mp3",              text: "Your payment could not be completed at this time. Please try again later." },
  { filename: "payment_declined.mp3",            text: "Your card was declined. Please check your details and try again." },
  { filename: "payment_activation_error.mp3",    text: "Your payment was received but there was an error activating your membership. Please contact customer support." },
  { filename: "payment_success_prefix.mp3",      text: "Payment successful! You now have" },
  { filename: "payment_success_bonus.mp3",       text: "Plus your first purchase bonus doubles your minutes!" },
  { filename: "payment_success_suffix.mp3",      text: "Thank you for joining. Returning to the main menu." },
  { filename: "time_deduction_start.mp3",        text: "Time is now being deducted from your membership." },
  { filename: "time_deduction_stop.mp3",         text: "Time is no longer being deducted from your membership." },

  { filename: "profile_options.mp3",           text: "Press 1 to send this caller a message. Press 2 to skip to the next profile. Press 3 to connect live with this caller. Press 4 to block this caller. Press 5 to hear the previous profile. Press 6 to hear this caller's location. Press 7 to flag this profile for review. Press 9 to return to main menu." },
  { filename: "new_caller_close_to_you.mp3",   text: "New caller close to you." },
  { filename: "new_caller_closest_to_you.mp3", text: "New caller closest to you." },
  { filename: "nearby_callers_offer.mp3",      text: "You've heard all the callers in your area. Press 1 to hear callers from nearby cities. Press 2 to start over from the beginning." },
  { filename: "nearby_callers_intro.mp3",      text: "Now playing callers from nearby cities. Enjoy!" },
  { filename: "nearby_callers_none.mp3",       text: "There are no callers online in nearby cities right now. Starting your area over." },
  { filename: "no_previous_profile.mp3",       text: "There is no previous profile. Continuing to the next." },
  { filename: "profile_flagged.mp3",           text: "This profile has been flagged for review. Thank you." },

  { filename: "message_options.mp3",    text: "To connect live with this caller, press 1. To reply with a message, press 2. To skip this message, press 3. To hear the last message you sent them, press 4. To save this message, press 5. To block this caller, press 7. To hear this caller's greeting and location, press 8. To repeat this message and menu choices, press 9. To exit or change your greeting, press pound." },
  { filename: "record_message.mp3",     text: "Record your message after the tone. Press any key when done." },
  { filename: "record_reply.mp3",       text: "Record your reply after the tone. Press any key when done." },
  { filename: "review_your_message.mp3",text: "Here is your recorded message." },
  { filename: "message_sent.mp3",       text: "Your message has been sent. Returning to profiles." },
  { filename: "message_send_error.mp3", text: "Failed to send your message. Returning to profiles." },
  { filename: "message_cancelled.mp3",  text: "Message cancelled." },
  { filename: "message_flagged.mp3",    text: "This message has been flagged for review. Thank you." },
  { filename: "no_recording.mp3",       text: "No recording was detected." },

  { filename: "live_connect_disclaimer.mp3",    text: "Please be respectful and kind. You are about to request a live one on one connection." },
  { filename: "live_connect_record_invite.mp3", text: "After the tone, record a brief message for this caller. Press any key when you are finished. You have 30 seconds." },
  { filename: "live_connect_connecting.mp3",    text: "Connecting you now. You can exit the live connection at any time by pressing pound. Enjoy!" },
  { filename: "live_invite_wants_to_connect.mp3", text: "wants to connect with you." },
  { filename: "live_invite_options.mp3",          text: "To connect live with this caller press 1. To reply with a message press 2. To skip press 3. To hear the last message you sent them press 4. To block this caller press 7. To hear this caller's location press 8. To repeat these choices press 9." },
  { filename: "live_connect_ended.mp3",         text: "Your live connection has ended. Returning you to the male box." },
  { filename: "live_connect_failed.mp3",        text: "We were unable to connect your call. Returning you to the male box." },
  { filename: "live_connect_declined.mp3",      text: "The caller has declined your invitation. Returning to profiles." },
  { filename: "live_connect_no_answer.mp3",     text: "The caller did not answer. Returning to profiles." },
  { filename: "live_connect_busy.mp3",          text: "That caller is already connected with someone else. Please try again later." },
  { filename: "live_connect_unavailable.mp3",   text: "This caller is not available for a live connection." },
  { filename: "live_connect_left_line.mp3",     text: "Sorry, that caller has left the line." },
  { filename: "live_connect_no_minutes.mp3",    text: "You need at least 5 minutes remaining on your membership to connect live. Please add more time and try again." },
  { filename: "live_invite_expired.mp3",        text: "That live connection invitation has expired. Returning to profiles." },

  { filename: "cs_menu_intro.mp3",          text: "Customer service." },
  { filename: "cs_menu_options.mp3",        text: "Press 1 for your full account details. Press 2 to add time to your account. Press 3 for billing information. Press 4 to leave a message for our billing team. Press pound to return to the main menu." },
  { filename: "cs_account_title.mp3",       text: "Account details." },
  { filename: "cs_account_label_status.mp3",     text: "Status:" },
  { filename: "cs_account_label_membership.mp3", text: "Membership type:" },
  { filename: "cs_account_label_time.mp3",       text: "Time remaining:" },
  { filename: "cs_account_greeting_yes.mp3",     text: "You have a greeting recorded." },
  { filename: "cs_account_greeting_no.mp3",      text: "You do not have a greeting recorded yet. You must record a greeting before other callers can hear you." },
  { filename: "cs_account_options.mp3",     text: "Press 2 to add more time. Press 9 to return to customer service. Press pound for the main menu." },
  { filename: "cs_account_error.mp3",       text: "We were unable to retrieve your account information at this time. Press 9 to return to customer service. Press pound for the main menu." },
  { filename: "cs_billing_title.mp3",       text: "Billing information." },
  { filename: "cs_billing_static.mp3",      text: "Time is deducted from your membership while you are connected to the system. You can add more time at any time by pressing 2 from the main menu. If you were recently charged and your time has not been applied, please leave a message for our billing team and we will investigate promptly." },
  { filename: "cs_billing_options.mp3",     text: "Press 2 to add time now. Press 4 to leave a message for the billing team. Press 9 to return to customer service. Press pound for the main menu." },
  { filename: "cs_leave_message_prompt.mp3",text: "Please describe your billing question or issue after the tone. Press any key when you are done." },
  { filename: "cs_message_received.mp3",    text: "Your message has been received. Our billing team will review it and follow up with you as soon as possible. Thank you for calling." },

  // ── Voicemail prompts ──────────────────────────────────────────────────────
  { filename: "vm_no_new.mp3",         text: "You have no new messages." },
  { filename: "vm_no_saved.mp3",       text: "You have no saved messages." },
  { filename: "vm_new_message.mp3",    text: "New message." },
  { filename: "vm_saved_message.mp3",  text: "Saved message." },
  { filename: "vm_message_from.mp3",   text: "Message from" },
  { filename: "vm_options.mp3",        text: "To listen to your messages press 1. To listen to saved messages press 2. To repeat this menu press 9. To return to the main menu press pound." },
  { filename: "vm_new_options.mp3",    text: "To replay this message press 1. To save this message press 2. To delete this message press 3. To reply press 4. To hear this caller's profile press 5. For the next message press 9. To return to the voicemail menu press 7. To hear how much time you have remaining press 0." },
  { filename: "vm_saved_options.mp3",  text: "To replay this message press 1. To delete this message press 3. To reply press 4. To hear this caller's profile press 5. For the next message press 9. To return to the voicemail menu press 7. To hear how much time you have remaining press 0." },
  { filename: "vm_message_saved.mp3",  text: "Message saved." },
  { filename: "vm_message_deleted.mp3",text: "Message deleted." },
  { filename: "vm_end_of_new.mp3",     text: "End of new messages." },
  { filename: "vm_end_of_saved.mp3",   text: "End of saved messages." },
  { filename: "vm_reply_prompt.mp3",   text: "Record your reply after the tone. Press any key when done." },

  { filename: "phrase_you_have.mp3",             text: "You have" },
  { filename: "phrase_and.mp3",                  text: "and" },
  { filename: "phrase_new_message.mp3",                  text: "new message." },
  { filename: "phrase_new_messages.mp3",                 text: "new messages." },
  { filename: "phrase_saved_message.mp3",                text: "saved message." },
  { filename: "phrase_saved_messages.mp3",               text: "saved messages." },
  { filename: "phrase_mailbox.mp3",                      text: "Mailbox" },
  { filename: "phrase_mailbox_number.mp3",               text: "Mailbox number" },
  { filename: "phrase_your_mailbox_number_is.mp3",       text: "Your mailbox number is" },
  { filename: "phrase_again_your_mailbox_number_is.mp3", text: "Again, your mailbox number is" },
  { filename: "phrase_new_caller_from.mp3",              text: "New caller from" },
  { filename: "phrase_now_playing_callers_from.mp3",     text: "Now playing callers from" },
  { filename: "phrase_this_caller_is_from.mp3",          text: "This caller is from" },
  { filename: "phrase_press.mp3",                        text: "Press" },
  { filename: "phrase_to_hear_callers_from.mp3",         text: "to hear callers from" },
  { filename: "phrase_to_start_over.mp3",                text: "to start over from the beginning." },
  { filename: "phrase_minutes_of_pbtr.mp3",      text: "minutes remaining." },
  { filename: "phrase_minute_of_pbtr.mp3",       text: "minute remaining." },
  { filename: "phrase_hours_of_pbtr.mp3",        text: "hours remaining." },
  { filename: "phrase_hour_of_pbtr.mp3",         text: "hour remaining." },
  { filename: "phrase_hours.mp3",                text: "hours" },
  { filename: "phrase_hour.mp3",                 text: "hour" },
  { filename: "phrase_days_of_pbtr.mp3",         text: "days remaining." },
  { filename: "phrase_day_of_pbtr.mp3",          text: "day remaining." },
  { filename: "phrase_days.mp3",                 text: "days" },
  { filename: "phrase_day.mp3",                  text: "day" },
  { filename: "phrase_there_are.mp3",            text: "There are" },
  { filename: "phrase_there_is.mp3",             text: "There is" },
  { filename: "phrase_callers_on_the_line.mp3",  text: "guys on the line." },
  { filename: "phrase_caller_on_the_line.mp3",   text: "guy on the line." },
  ...Array.from({ length: 100 }, (_, i) => ({ filename: `num_${i}.mp3`, text: numberToWords(i) })),
  { filename: "num_100.mp3", text: "one hundred" },
  { filename: "num_200.mp3", text: "two hundred" },
  { filename: "num_300.mp3", text: "three hundred" },
  { filename: "num_400.mp3", text: "four hundred" },
  { filename: "num_500.mp3", text: "five hundred" },
  { filename: "num_600.mp3", text: "six hundred" },
  { filename: "num_700.mp3", text: "seven hundred" },
  { filename: "num_800.mp3", text: "eight hundred" },
  { filename: "num_900.mp3", text: "nine hundred" },
  { filename: "num_1000.mp3", text: "thousand" },
  // Composite time-remaining announcements — single-file replacements for stitched playback.
  // Covers every minute value callers can encounter (1–1440 min, i.e. up to 24 hours).
  ...Array.from({ length: 1440 }, (_, i) => {
    const n = i + 1;
    return { filename: `time_remaining_${n}.mp3`, text: minutesToAnnouncementText(n) };
  }),

  // ── Moderation / account status ────────────────────────────────────────────
  { filename: "caller_banned.mp3",          text: "We're sorry, your access to this service has been suspended. If you believe this is an error, please contact customer support. Goodbye." },
  { filename: "account_restricted_live.mp3",text: "We're sorry, your account has been restricted and you are not able to go live at this time. You may still listen to profiles and use other features. Please contact customer support if you have questions." },

  // ── Web-link flow ──────────────────────────────────────────────────────────
  { filename: "link_phone_prefix.mp3",  text: "Your phone number has been linked to your web account. Your membership number is:" },
  { filename: "link_phone_portal.mp3",  text: "You can now sign in to the web portal to manage your account." },
  { filename: "link_phone_success.mp3", text: "Your phone number has been linked to your web account. You can now sign in to the web portal." },

  // ── PIN management ─────────────────────────────────────────────────────────
  { filename: "pin_accepted.mp3",    text: "PIN accepted. Welcome." },
  { filename: "pin_incorrect.mp3",   text: "Incorrect PIN. Please try again by calling from your registered phone number or entering your membership number again." },
  { filename: "pin_enter_new.mp3",   text: "Please enter your new 4-digit PIN." },
  { filename: "pin_invalid.mp3",     text: "Invalid PIN. Please enter exactly 4 digits." },
  { filename: "pin_confirm.mp3",     text: "Please enter your PIN again to confirm." },
  { filename: "pin_mismatch.mp3",    text: "The PINs did not match. Please try again." },
  { filename: "pin_set_success.mp3", text: "Your PIN has been set successfully. You can now use your membership number and PIN to call in from any phone." },
  { filename: "pin_save_error.mp3",  text: "An error occurred saving your PIN. Please try again." },

  // ── Calling card ───────────────────────────────────────────────────────────
  { filename: "card_no_time.mp3", text: "Please use a different calling card." },

  // ── Greeting playback ──────────────────────────────────────────────────────
  { filename: "here_is_your_greeting.mp3",   text: "Here is what your greeting sounds like." },
  { filename: "greeting_not_available.mp3",  text: "This caller's greeting is not available." },

  // ── Profile / browse ───────────────────────────────────────────────────────
  { filename: "caller_no_profile.mp3",          text: "This caller no longer has a profile." },
  { filename: "replay_last_message.mp3",         text: "Here is the last message you sent this caller." },
  { filename: "no_message_sent.mp3",             text: "You have not sent this caller a message yet." },
  { filename: "message_saved.mp3",               text: "Message saved." },
  { filename: "location_not_available.mp3",      text: "This caller's location is not available." },
  { filename: "location_not_available_send.mp3", text: "This caller's location is not available. To send them a message, press 1." },
  { filename: "ai_caller_message_blocked.mp3",   text: "You can't message an AI caller. Back to browsing." },

  // ── Voicemail / messaging ──────────────────────────────────────────────────
  { filename: "vm_send_or_return.mp3",       text: "To send a message press 1. To return to your voicemail press 9." },
  { filename: "has_sent_you_a_message.mp3",  text: "has sent you a message." },
  { filename: "you_have_new_message.mp3",    text: "You have a new message." },

  // ── Mailbox ────────────────────────────────────────────────────────────────
  { filename: "mailbox_no_greeting.mp3",      text: "You have not recorded a mailbox greeting yet." },
  { filename: "mailbox_record_greeting.mp3",  text: "Record your mailbox greeting after the tone. Press any key when done." },
  { filename: "mailbox_greeting_saved.mp3",   text: "Your mailbox greeting has been saved. Callers who enter your mailbox number will now hear this greeting." },
  { filename: "mailbox_send_or_return.mp3",   text: "Press 1 to send a message. Press 9 to return to your mailbox." },
  { filename: "mailbox_message_options.mp3",  text: "Press 1 to reply. Press 2 to hear the sender's ad. Press 3 to skip this message. Press 9 to return to the mailbox menu." },
  { filename: "mailbox_already_recorded.mp3",         text: "You already have a mailbox greeting recorded. Press 1 to record a new greeting. Press 2 to hear your current greeting. Press 9 to return to your mailbox." },
  { filename: "caller_no_mailbox_ad.mp3",             text: "This caller no longer has a mailbox ad." },
  { filename: "mailbox_ad_browse_options.mp3",        text: "Press 1 to send a message to this guy. Press 2 to hear the next ad. Press 9 to return to the category menu. Press pound to return to the mailbox menu." },
  { filename: "mailbox_lookup_options.mp3",           text: "Press 1 to send a message to this guy. Press 9 to look up another mailbox. Press pound to return to the mailbox menu." },
  { filename: "mailbox_no_new_messages_with_greeting.mp3", text: "Your mailbox has no new messages. Press 1 to re-record your mailbox greeting. Press 2 to hear your current greeting. Press 9 to return to the mailbox menu." },
  { filename: "mailbox_no_new_messages_no_greeting.mp3",   text: "Your mailbox has no new messages. Press 1 to record your mailbox greeting. Press 9 to return to the mailbox menu." },

  // ── Live connect (additional) ──────────────────────────────────────────────
  { filename: "live_invite_intro.mp3",          text: "This caller" },
  { filename: "live_invite_suffix.mp3",         text: "would like to connect live with you." },
  { filename: "live_low_balance_warning.mp3",   text: "Warning: you have less than 5 minutes remaining. Please note your live connection will end when your time expires." },
  { filename: "has_sent_you_this_message.mp3",  text: "has sent you this message." },

  // ── Purchase / package ─────────────────────────────────────────────────────
  { filename: "package_load_error.mp3",  text: "We're having trouble loading package information. To return to the main menu press 9. To cancel press pound." },
  { filename: "promo_code_prompt.mp3",   text: "Enter your promotional code followed by the pound key. Press star to cancel." },
  { filename: "collect_card_number.mp3",       text: "Please enter your 16-digit card number now." },
  { filename: "collect_card_number_retry.mp3", text: "That number doesn't look right. Please try again and enter your 16-digit card number." },
  { filename: "collect_card_expiry.mp3",       text: "Please enter your card's expiration date. Enter the 2-digit month followed by the 2-digit year." },
  { filename: "collect_security_code.mp3",     text: "Enter your 3 or 4 digit security code, then press pound." },
  { filename: "collect_postal_code.mp3",       text: "Please enter your billing zip code, then press pound." },
  { filename: "card_number_invalid.mp3",       text: "We were unable to verify that card number. Please check your card and try again." },

  // ── Membership management ──────────────────────────────────────────────────
  { filename: "manage_tier_free_trial.mp3", text: "You are on a free trial." },
  { filename: "manage_tier_active.mp3",     text: "You have an active membership." },
  { filename: "manage_tier_none.mp3",       text: "You do not have an active membership." },
  { filename: "manage_pin_set.mp3",         text: "You have a PIN set." },
  { filename: "manage_pin_not_set.mp3",     text: "You do not have a PIN set." },
  { filename: "manage_menu_mm.mp3",         text: "To purchase a membership press 1. To set or change your access PIN press 2. To unblock all callers press 3. To return to the main menu press 9." },
  { filename: "manage_menu_mw.mp3",         text: "To purchase a membership press 1. To unblock all callers press 3. To return to the main menu press 9." },
  { filename: "unblock_confirm.mp3",        text: "To confirm you want to unblock all callers, press 1. Press any other key to cancel and return to the previous menu." },
  { filename: "unblock_done.mp3",           text: "All callers are unblocked." },
  { filename: "cancelled_returning.mp3",    text: "Cancelled. Returning to the previous menu." },
  { filename: "cancelled.mp3",              text: "Cancelled." },
  { filename: "account_not_found.mp3",      text: "Could not find your account. Please try again." },

  // ── Message review ─────────────────────────────────────────────────────────
  { filename: "send_or_cancel.mp3", text: "Press 1 to send. Press 2 to cancel." },

  // ── Live connect ───────────────────────────────────────────────────────────
  { filename: "calling.mp3",          text: "Calling" },
  { filename: "now.mp3",              text: "now." },
  { filename: "live_time_warning.mp3",text: "Warning: you have less than 5 minutes remaining. Please note your live connection will end when your time expires." },

  // ── Mailbox ────────────────────────────────────────────────────────────────
  { filename: "mailbox_has_greeting.mp3",   text: "You already have a mailbox greeting recorded. Press 1 to record a new greeting. Press 2 to hear your current greeting. Press 9 to return to your mailbox." },
  { filename: "caller_no_mailbox_ad.mp3",   text: "This caller no longer has a mailbox ad." },
  { filename: "category_ad_options.mp3",    text: "Press 1 to send a message to this guy. Press 2 to hear the next ad. Press 9 to return to the category menu. Press pound to return to the mailbox menu." },
  { filename: "last_message_sent.mp3",      text: "Last message you sent this caller." },
  { filename: "no_messages_yet.mp3",        text: "You have not sent this caller any messages." },

  // ── Engagement / game ──────────────────────────────────────────────────────
  { filename: "cant_message_ai.mp3", text: "You can't message an AI. Nice try though. Back to browsing." },
  { filename: "bust_win_minutes.mp3", text: "Roger here. You got it! That was our A I voice. Fifteen bonus minutes have been added to your account. Nice ear." },
  { filename: "bust_win_hours.mp3",   text: "Roger here. You got it! That was our A I voice. One hour of bonus time has been added to your account. Nice ear." },
  { filename: "bust_miss.mp3",        text: "Roger here. Oh, that one was real! You had one shot and missed it. Better luck next time. Back to browsing." },

  // ── Static menu prompts referenced by the IVR but previously falling back to Twilio TTS ──
  { filename: "gender_select.mp3",                text: "Guys, press one to talk to women. Women, press three to talk to guys." },
  { filename: "mw_main_menu.mp3",                 text: "Main menu. If you're ready to join the action press 1. To buy membership time press 2. For the men seeking men line press 5. To manage your membership press 8. Press 0 for time remaining, or 9 to repeat these choices." },
  { filename: "connector_idle_goodbye.mp3",       text: "You're apparently having issues right now, or have fallen asleep. Sweet dreams." },
  { filename: "live_connect_admin_profile.mp3",   text: "This is a sample profile and cannot accept a live connection. Please choose another caller." },

  // ── Mailbox lookup / browse ───────────────────────────────────────────────
  { filename: "mailbox_lookup.mp3",               text: "Enter the five digit mailbox number you'd like to look up, followed by pound. Or press pound alone to return to the mailbox menu." },
  { filename: "mailbox_menu.mp3",                 text: "To go to your mailbox press one. To record a new mailbox ad press two. To listen to ads from other guys press three. To repeat these choices press nine. To exit to the main menu press pound." },
  { filename: "ad_category_menu.mp3",             text: "Please select a category. For Quick and Hot Talk press one. For Bicurious press two. For Kink press three. For Total Tops press four. For Strictly Bottoms press five. For Trans press six. To look up a specific mailbox press seven. For more categories press eight. For definitions press nine. To return to the mailbox menu press pound." },
  { filename: "ad_category_menu_p2.mp3",          text: "More categories. For Cock Suckers press one. For Hung Cocks press two. For Uncut Cocks press three. For Twinks press four. For Bears press five. For Daddys press six. To look up a specific mailbox press seven. For definitions press nine. To go back to the previous categories press pound." },
  { filename: "ad_category_definitions.mp3",      text: "Quick and Hot Talk: guys looking for fast, explicit, no-strings chat. Bicurious: men exploring attraction to other men for the first time or occasionally. Kink: callers into fetishes, role play, or specific kinks. Total Tops: guys who are exclusively tops and looking for a bottom. Strictly Bottoms: guys who are exclusively bottoms and looking for a top. Trans: trans men and women connecting with other callers. Cock Suckers: guys who love giving oral and want to connect with like-minded men. Hung Cocks: well-endowed guys and the men who want them. Uncut Cocks: uncircumcised guys and the men who seek them out. Twinks: younger slender guys and the men who are into them. Bears: bigger, hairier guys and those who are into the bear scene. Daddys: older, mature men and younger guys looking for that connection. Returning to the category menu." },
  { filename: "mailbox_ad_recorded_pending.mp3",  text: "Thanks for recording your ad. Once it's approved, you'll be able to send messages to other mailboxes. In the meantime you can browse other ads or visit the male box to check out who's on the line right now." },

  // ── Mailbox setup flow ─────────────────────────────────────────────────────
  { filename: "mailbox_setup_intro.mp3",          text: "You need to first set up your mailbox. To set up your mailbox we need to gather a couple of things from you which helps callers search for the perfect guy and help them find your ads. First we need to know your date of birth. Please enter your date of birth in this order: two digits for the month, two digits for the day, and four digits for the year. For example, for April 17 1976, enter zero four one seven one nine seven six." },
  { filename: "mailbox_setup_dob_invalid.mp3",    text: "We did not receive a valid date of birth. Please try again." },
  { filename: "mailbox_setup_underage.mp3",       text: "We are sorry, but you must be 18 years of age or older to use this service. Goodbye." },
  { filename: "mailbox_setup_bodytype.mp3",       text: "Now please select your body type. For Slim press one. For Average press two. For Athletic press three. For Large press four. For Big and Tall press five. To repeat these choices press nine. To exit press pound." },
  { filename: "mailbox_setup_cancelled.mp3",      text: "Mailbox setup cancelled." },
  { filename: "mailbox_setup_ethnicity.mp3",      text: "Now please tell us your ethnicity. If you don't want to identify your ethnicity press one. If you're Caucasian press two. African-American press three. Asian press four. Latino press five. Middle Eastern press six. Aboriginal press seven. To repeat these choices press nine. To exit press pound." },
  { filename: "mailbox_setup_ready.mp3",          text: "Please get something ready to write down your new mailbox number and passcode. This is the only chance you will have to write them down. And don't get them confused with your membership number — we issue separate numbers for memberships. If you're ready to write down your mailbox number and passcode press one. To pause the system while you get a pen and paper press two. To repeat these choices press nine. To cancel setting up your mailbox press the pound key." },
  { filename: "mailbox_setup_existing_passcode.mp3", text: "Your mailbox passcode is the same as your membership passcode. If you do not remember your passcode and would like to create a new one, press pound." },
  { filename: "mailbox_setup_create_passcode.mp3",text: "For security you need a passcode. Please enter a four digit passcode now. If you make a mistake press star to start over." },
  { filename: "mailbox_setup_passcode_reenter.mp3",  text: "Please re-enter your four digit passcode." },
  { filename: "mailbox_setup_passcode_mismatch.mp3", text: "Your passcode entries did not match. Please try again." },
  { filename: "mailbox_setup_complete.mp3",       text: "Your mailbox is now set up. To begin recording a new ad press one. To listen to ads from other guys press two. To return to the main menu press pound." },
];

// ── MW prompts (uploads/mw/) — DISABLED: using MM voice only ──────────────
// const MW_PROMPTS: Prompt[] = [
//   { filename: "gender_select.mp3",  text: "Guys, press one to talk to women. Women, press three to talk to guys." },
//   { filename: "mw_main_menu.mp3",   text: "Main menu. If you're ready to join the action press 1. To buy membership time press 2. For the men seeking men line press 5. To manage your membership press 8. Press 0 for time remaining, or 9 to repeat these choices." },
//   ...MM_PROMPTS.filter(p =>
//     p.filename !== "main_menu.mp3" &&
//     p.filename !== "mw_main_menu.mp3"
//   ).map(p => {
//     if (p.filename === "phone_booth_welcome.mp3")
//       return { ...p, text: "Welcome to the live connector. Greetings from all the local women here right now. Swap private messages and then connect live for a totally private conversation. You can leave the connector anytime you want by pressing the pound sign." };
//     if (p.filename === "welcome_record_name.mp3")
//       return { ...p, text: "You need to record a greeting to introduce yourself to the women first. Let's record the name you want to use. After the tone, record just your first name." };
//     if (p.filename === "live_connect_ended.mp3")
//       return { ...p, text: "Your live connection has ended. Returning you to the live connector." };
//     if (p.filename === "live_connect_failed.mp3")
//       return { ...p, text: "We were unable to connect your call. Returning you to the live connector." };
//     if (p.filename === "phrase_callers_on_the_line.mp3")
//       return { ...p, text: "women on the line." };
//     if (p.filename === "phrase_caller_on_the_line.mp3")
//       return { ...p, text: "woman on the line." };
//     return p;
//   }),
// ];

// ── MW_M prompts (uploads/mw_m/) — DISABLED: using MM voice only ──────────
// const MW_M_PROMPTS: Prompt[] = [
//   { filename: "mw_main_menu.mp3",  text: "Main menu. If you're ready to join the action press 1. To buy membership time press 2. For the men seeking men line press 5. To manage your membership press 8. Press 0 for time remaining, or 9 to repeat these choices." },
//   ...MM_PROMPTS.filter(p =>
//     p.filename !== "main_menu.mp3" &&
//     p.filename !== "mw_main_menu.mp3"
//   ).map(p => {
//     if (p.filename === "phone_booth_welcome.mp3")
//       return { ...p, text: "Welcome to the live connector. Greetings from all the local guys here right now. Swap private messages and then connect live for a totally private conversation. You can leave the connector anytime you want by pressing the pound sign." };
//     if (p.filename === "welcome_record_name.mp3")
//       return { ...p, text: "You need to record a greeting to introduce yourself to the guys first. Let's record the name you want to use. After the tone, record just your first name." };
//     if (p.filename === "live_connect_ended.mp3")
//       return { ...p, text: "Your live connection has ended. Returning you to the live connector." };
//     if (p.filename === "live_connect_failed.mp3")
//       return { ...p, text: "We were unable to connect your call. Returning you to the live connector." };
//     if (p.filename === "phrase_callers_on_the_line.mp3")
//       return { ...p, text: "guys on the line." };
//     if (p.filename === "phrase_caller_on_the_line.mp3")
//       return { ...p, text: "guy on the line." };
//     return p;
//   }),
// ];

// ── Shared label helpers (also used in ivr-default.ts) ──────────────────────

export function centsToLabel(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const remaining = cents % 100;
  if (remaining === 0) return `${dollars} dollar${dollars !== 1 ? "s" : ""}`;
  return `${dollars} dollar${dollars !== 1 ? "s" : ""} and ${remaining} cent${remaining !== 1 ? "s" : ""}`;
}

export function minutesToDurationLabel(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days !== 1 ? "s" : ""}`;
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  }
  return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
}

/**
 * Generate the full spoken text for a time-remaining announcement.
 * e.g. 90  → "You have 1 hour and 30 minutes remaining."
 *      45  → "You have 45 minutes remaining."
 *      60  → "You have 1 hour remaining."
 *      1440 → "You have 1 day remaining."
 */
export function minutesToAnnouncementText(totalMinutes: number): string {
  if (totalMinutes >= 1440) {
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    if (hours === 0) {
      return `You have ${days} ${days === 1 ? "day" : "days"} remaining.`;
    }
    return `You have ${days} ${days === 1 ? "day" : "days"} and ${hours} ${hours === 1 ? "hour" : "hours"} remaining.`;
  }
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (mins === 0) {
      return `You have ${hours} ${hours === 1 ? "hour" : "hours"} remaining.`;
    }
    return `You have ${hours} ${hours === 1 ? "hour" : "hours"} and ${mins} ${mins === 1 ? "minute" : "minutes"} remaining.`;
  }
  return `You have ${totalMinutes} ${totalMinutes === 1 ? "minute" : "minutes"} remaining.`;
}

// Simple number-to-words for 0–99 (used to build the num_N.mp3 list)
function numberToWords(n: number): string {
  const ones = ["zero","one","two","three","four","five","six","seven","eight","nine",
    "ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
  const tens = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
  if (n < 20) return ones[n];
  const t = tens[Math.floor(n / 10)];
  const o = n % 10;
  return o === 0 ? t : `${t}-${ones[o]}`;
}

// NOTE: mw and mw_m folders are disabled — MM voice only.
const FOLDERS: { folder: string; prompts: Prompt[] }[] = [
  { folder: "mm",   prompts: MM_PROMPTS },
  // { folder: "mw",   prompts: MW_PROMPTS },
  // { folder: "mw_m", prompts: MW_M_PROMPTS },
];

// ── Roger greeting variants (uploads/ root, Roger voice, eleven_v3) ────────
// Pre-generated so callers never hear a silent pause after the disclaimer.
// Priority order: new caller → same-day return → 1–3 days → 4–14 days
// → 15–30 days → 30+ days since last call.
export const ROGER_PROMPTS: Prompt[] = [
  { filename: "roger_welcome_new.mp3",       text: "[warmly] Hi, this is the Male Box. My name is Roger — your cruise director. [chuckles] Oh, look at you... a first time caller. I see. [warmly] Well in that case — let me set you up with some free time so you can check out what we have going on in here. [cheerfully] Welcome to the party, honey." },
  { filename: "roger_welcome_sameday.mp3",   text: "[warmly] Welcome back! Back again the same day? [playfully] I love the commitment. The boys are still here — let us get you in." },
  // roger_welcome_frequent.mp3 intentionally removed — wording was too rude.
  // 3+ same-day callers now fall through to the friendlier sameday greeting.
  { filename: "roger_welcome_recent.mp3",    text: "[warmly] Hey, welcome back. [playfully] The boys have been asking about you. Well... one of them might have been. Good to see you again." },
  { filename: "roger_welcome_fewdays.mp3",   text: "[warmly] Welcome back! It has been a few days. [mischievously] We were starting to wonder if you found someone. Either way — glad you are back. Let us see what is going on tonight." },
  { filename: "roger_welcome_weeks.mp3",     text: "[chuckles] Well, well, well. Look who remembered we exist. [warmly] I am kidding, relax. Welcome back. It has been a couple of weeks — let us see what is happening tonight." },
  { filename: "roger_welcome_longtime.mp3",  text: "[gasps] Oh my God. It has been a while, honey. [playfully] I was starting to think you found love on another chat line. [warmly] No hard feelings. Welcome back — we missed you." },
];

const DELAY_MS = 2000;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Helpers shared between runAudioAutogen and generateDynamicPackagePrompts ─

function needsRegenerationGlobal(filePath: string, text: string): boolean {
  if (!fs.existsSync(filePath)) return true;
  const sidecar = filePath.replace(/\.mp3$/i, ".txt");
  if (!fs.existsSync(sidecar)) {
    fs.unlinkSync(filePath);
    return true;
  }
  try {
    const stored = fs.readFileSync(sidecar, "utf8").trim();
    if (stored !== text.trim()) {
      fs.unlinkSync(filePath);
      fs.unlinkSync(sidecar);
      return true;
    }
  } catch { /* unreadable sidecar — leave the mp3 in place */ }
  return false;
}

function writeSidecarGlobal(filePath: string, text: string): void {
  try {
    fs.writeFileSync(filePath.replace(/\.mp3$/i, ".txt"), text.trim(), "utf8");
  } catch { /* non-fatal */ }
}

/**
 * Generate per-plan audio files whose text depends on current admin settings
 * (plan name, minutes, price). Re-generates whenever the DB text changes.
 *
 * Produces for each active plan (minutes > 0 and priceCents > 0):
 *   package_label_planN.mp3  — spoken in the confirm-package IVR step
 *   payment_charged_planN.mp3 — spoken after a successful purchase
 */
async function generateDynamicPackagePrompts(folder: string): Promise<{ generated: number; failed: number; skipped: number }> {
  const stats = { generated: 0, failed: 0, skipped: 0 };
  let settings: any;
  try {
    const { storage } = await import("./storage");
    settings = await storage.getMembershipSettings();
  } catch (err) {
    console.error("[audio-autogen] dynamic package prompts: could not load settings:", err);
    return stats;
  }

  const billingMode: string = settings.billingMode ?? "per_minute";
  const plans = [
    { key: "plan1", displayName: settings.plan1Name, minutes: settings.plan1Minutes, priceCents: settings.plan1PriceCents },
    { key: "plan2", displayName: settings.plan2Name, minutes: settings.plan2Minutes, priceCents: settings.plan2PriceCents },
    { key: "plan3", displayName: settings.plan3Name, minutes: settings.plan3Minutes, priceCents: settings.plan3PriceCents },
  ].filter(p => p.minutes > 0 && p.priceCents > 0);

  if (plans.length === 0) return stats;

  const dir = path.join(UPLOADS_DIR, folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // ── purchase_pre_menu.mp3 — full purchase menu, regenerates when plan settings change ──
  {
    const planLines = plans.map((plan, idx) => {
      const digit = idx === 0 ? "2" : idx === 1 ? "3" : "4";
      return `To purchase ${minutesToDurationLabel(plan.minutes)} of access for ${centsToLabel(plan.priceCents)} press ${digit}.`;
    });
    const menuText =
      "If you have a promotional code press 1. " +
      planLines.join(" ") + " " +
      "To repeat these choices press 9. " +
      "To cancel press pound.";
    const menuFile = path.join(dir, "purchase_pre_menu.mp3");
    if (needsRegenerationGlobal(menuFile, menuText)) {
      try {
        await generateTTS(menuText, "purchase_pre_menu.mp3", folder);
        writeSidecarGlobal(menuFile, menuText);
        console.log(`[audio-autogen] generated ${folder}/purchase_pre_menu.mp3`);
        stats.generated++;
        await sleep(DELAY_MS);
      } catch (err: any) {
        console.error(`[audio-autogen] failed ${folder}/purchase_pre_menu.mp3: ${err?.message}`);
        stats.failed++;
        await sleep(DELAY_MS);
      }
    } else {
      stats.skipped++;
    }
  }

  for (const plan of plans) {
    const durationLabel = minutesToDurationLabel(plan.minutes);
    const priceLabel = centsToLabel(plan.priceCents);

    // ── package_label_planN.mp3 (confirm-package dynamic part) ──────────────
    let labelText: string;
    if (billingMode === "per_24h") {
      labelText = `the ${plan.displayName} package for ${priceLabel}.`;
    } else if (billingMode === "per_day") {
      labelText = `${durationLabel} for ${priceLabel}.`;
    } else {
      labelText = `${plan.minutes.toLocaleString()} minutes for ${priceLabel}.`;
    }

    const labelFile = path.join(dir, `package_label_${plan.key}.mp3`);
    if (needsRegenerationGlobal(labelFile, labelText)) {
      try {
        await generateTTS(labelText, `package_label_${plan.key}.mp3`, folder);
        writeSidecarGlobal(labelFile, labelText);
        console.log(`[audio-autogen] generated ${folder}/package_label_${plan.key}.mp3`);
        stats.generated++;
        await sleep(DELAY_MS);
      } catch (err: any) {
        console.error(`[audio-autogen] failed ${folder}/package_label_${plan.key}.mp3: ${err?.message}`);
        stats.failed++;
        await sleep(DELAY_MS);
      }
    } else {
      stats.skipped++;
    }

    // ── payment_charged_planN.mp3 (payment success dynamic part) ────────────
    const chargedText = `${durationLabel} of access. Your card has been charged ${priceLabel}.`;
    const chargedFile = path.join(dir, `payment_charged_${plan.key}.mp3`);
    if (needsRegenerationGlobal(chargedFile, chargedText)) {
      try {
        await generateTTS(chargedText, `payment_charged_${plan.key}.mp3`, folder);
        writeSidecarGlobal(chargedFile, chargedText);
        console.log(`[audio-autogen] generated ${folder}/payment_charged_${plan.key}.mp3`);
        stats.generated++;
        await sleep(DELAY_MS);
      } catch (err: any) {
        console.error(`[audio-autogen] failed ${folder}/payment_charged_${plan.key}.mp3: ${err?.message}`);
        stats.failed++;
        await sleep(DELAY_MS);
      }
    } else {
      stats.skipped++;
    }
  }

  return stats;
}

async function runAudioAutogen(): Promise<void> {
  if (!process.env.ELEVENLABS_API_KEY) {
    console.log("[audio-autogen] ELEVENLABS_API_KEY not set — skipping.");
    return;
  }

  // Only generate files for the folder(s) the active site category actually uses.
  // Generating all three folders costs 3× as much in ElevenLabs credits.
  let activeFolders = FOLDERS;
  try {
    const { storage } = await import("./storage");
    const settings = await storage.getSiteSettings();
    const cat = settings?.siteCategory ?? "MM";
    if (cat === "MW") {
      activeFolders = FOLDERS.filter(f => f.folder === "mw" || f.folder === "mw_m");
      console.log("[audio-autogen] site is MW — generating mw/ and mw_m/ only.");
    } else {
      activeFolders = FOLDERS.filter(f => f.folder === "mm");
      console.log("[audio-autogen] site is MM — generating mm/ only.");
    }
  } catch {
    console.log("[audio-autogen] could not read site settings — generating all folders.");
  }

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const { folder, prompts } of activeFolders) {
    const dir = path.join(UPLOADS_DIR, folder);

    for (const prompt of prompts) {
      if (!prompt.text.trim()) { skipped++; continue; }

      const filePath = path.join(dir, prompt.filename);
      if (!needsRegenerationGlobal(filePath, prompt.text)) { skipped++; continue; }

      try {
        await generateTTS(prompt.text.trim(), prompt.filename, folder);
        writeSidecarGlobal(filePath, prompt.text);
        console.log(`[audio-autogen] generated ${folder}/${prompt.filename}`);
        generated++;
        await sleep(DELAY_MS);
      } catch (err: any) {
        console.error(`[audio-autogen] failed ${folder}/${prompt.filename}: ${err?.message ?? err}`);
        failed++;
        await sleep(DELAY_MS);
      }
    }
  }

  // ── Roger greeting variants ──────────────────────────────────────────────
  // Files live in uploads/ root (not a category subfolder) and are spoken by
  // the same MM voice as everything else (getVoiceIdForRoger() falls back to
  // the MM voice ID). Generated with the eleven_v3 model so the inline
  // emotion tags like [warmly], [chuckles], [playfully] are honored.
  const rogerVoiceId = getVoiceIdForRoger();
  for (const prompt of ROGER_PROMPTS) {
    const filePath = path.join(UPLOADS_DIR, prompt.filename);
    if (!needsRegenerationGlobal(filePath, prompt.text)) { skipped++; continue; }
    try {
      await generateTTS(prompt.text.trim(), prompt.filename, undefined, rogerVoiceId, "eleven_v3");
      writeSidecarGlobal(filePath, prompt.text);
      console.log(`[audio-autogen] generated roger/${prompt.filename}`);
      generated++;
      await sleep(DELAY_MS);
    } catch (err: any) {
      console.error(`[audio-autogen] failed roger/${prompt.filename}: ${err?.message ?? err}`);
      failed++;
      await sleep(DELAY_MS);
    }
  }

  // ── Dynamic per-plan package prompts ────────────────────────────────────
  for (const { folder } of activeFolders) {
    const dynStats = await generateDynamicPackagePrompts(folder);
    generated += dynStats.generated;
    failed += dynStats.failed;
    skipped += dynStats.skipped;
  }

  if (generated > 0 || failed > 0) {
    console.log(`[audio-autogen] run complete — generated: ${generated}, failed: ${failed}, already existed: ${skipped}`);
  } else {
    console.log(`[audio-autogen] all ${skipped} prompt files already exist — nothing to do.`);
  }
}

// ── Location audio sidecar helpers ──────────────────────────────────────────
// Location files fingerprint BOTH the text and the voice ID so that a voice
// change (ELEVENLABS_VOICE_ID_MM env var update) forces regeneration.
// Unlike main prompts (where no sidecar = legacy = keep), a missing sidecar
// on a location file is treated as stale — those files were generated before
// the sidecar system existed and may carry the wrong voice.

function locationFingerprint(text: string, voiceId: string): string {
  return `${text.trim()}|${voiceId}`;
}

function locationNeedsRegeneration(filePath: string, text: string, voiceId: string): boolean {
  if (!fs.existsSync(filePath)) return true;
  const sidecarPath = filePath.replace(/\.mp3$/i, ".txt");
  if (!fs.existsSync(sidecarPath)) return true; // no sidecar = old file, voice unknown — regenerate
  try {
    const stored = fs.readFileSync(sidecarPath, "utf8").trim();
    if (stored !== locationFingerprint(text, voiceId)) {
      // Text or voice ID changed — delete stale audio and sidecar.
      fs.unlinkSync(filePath);
      fs.unlinkSync(sidecarPath);
      return true;
    }
  } catch { /* unreadable sidecar — regenerate to be safe */
    return true;
  }
  return false;
}

function writeLocationSidecar(filePath: string, text: string, voiceId: string): void {
  try {
    fs.writeFileSync(
      filePath.replace(/\.mp3$/i, ".txt"),
      locationFingerprint(text, voiceId),
      "utf8",
    );
  } catch { /* non-fatal */ }
}

// ── Location audio helpers ──────────────────────────────────────────────────

/**
 * Convert a neighborhood/city string into a safe MP3 filename.
 * e.g. "Westwood, CA" → "loc_westwood_ca.mp3"
 * Exported so IVR handlers can build the filename from the resolved location.
 */
export function locationToFilename(location: string): string {
  const safe = location
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `loc_${safe}.mp3`;
}

/** Full announcement text for a given location. */
function locationText(location: string): string {
  return `This caller is located in ${location}. To send them a message, press 1.`;
}

/**
 * Immediately generate location audio for the active site category's folder(s).
 * Internal — always awaited sequentially.
 */
async function generateLocationForAllFolders(location: string): Promise<void> {
  const filename = locationToFilename(location);
  const text = locationText(location);
  let folders = ["mm", "mw", "mw_m"];
  try {
    const { storage } = await import("./storage");
    const settings = await storage.getSiteSettings();
    const cat = settings?.siteCategory ?? "MM";
    folders = cat === "MW" ? ["mw", "mw_m"] : ["mm"];
  } catch { /* fall back to all */ }
  for (const folder of folders) {
    const filePath = path.join(UPLOADS_DIR, folder, filename);
    const voiceId = getVoiceIdForFolder(folder);
    if (!locationNeedsRegeneration(filePath, text, voiceId)) continue;
    try {
      await generateTTS(text, filename, folder);
      writeLocationSidecar(filePath, text, voiceId);
      console.log(`[audio-autogen] trigger: generated ${folder}/${filename}`);
      await sleep(DELAY_MS);
    } catch (err: any) {
      console.error(`[audio-autogen] trigger: failed ${folder}/${filename}: ${err?.message ?? err}`);
      await sleep(DELAY_MS);
    }
  }
}

/**
 * Fire-and-forget trigger: call this whenever a new neighborhood is added.
 * Returns immediately — generation happens in the background.
 */
export function triggerLocationAudio(location: string): void {
  if (!process.env.ELEVENLABS_API_KEY) return;
  generateLocationForAllFolders(location).catch(err =>
    console.error(`[audio-autogen] triggerLocationAudio error for "${location}":`, err)
  );
}

/**
 * Scan the zip_codes table, resolve a display location for every entry, and
 * generate a `loc_*.mp3` in each voice folder (mm / mw / mw_m) if missing.
 */
async function runLocationAutogen(): Promise<void> {
  const { storage } = await import("./storage");
  const allZips = await storage.getAllZipCodes();

  if (allZips.length === 0) return;

  const uniqueLocations = new Set<string>();

  for (const zip of allZips) {
    let location: string | null = null;

    // Prefer live reverse-geocode when coordinates are available
    if (zip.latitude != null && zip.longitude != null) {
      try {
        location = await reverseGeocodeNeighborhood(zip.latitude, zip.longitude);
      } catch {
        // swallow — fall through to stored fields
      }
    }

    if (!location) location = zip.neighborhood ?? zip.city ?? null;
    if (location) uniqueLocations.add(location);
  }

  // Only generate for the folders the active site category uses
  let voiceFolders = ["mm", "mw", "mw_m"];
  try {
    const settings = await storage.getSiteSettings();
    const cat = settings?.siteCategory ?? "MM";
    voiceFolders = cat === "MW" ? ["mw", "mw_m"] : ["mm"];
  } catch { /* fall back to all three */ }

  let generated = 0;
  let failed = 0;
  let skipped = 0;

  for (const location of uniqueLocations) {
    const filename = locationToFilename(location);
    const text = locationText(location);

    for (const folder of voiceFolders) {
      const filePath = path.join(UPLOADS_DIR, folder, filename);
      const voiceId = getVoiceIdForFolder(folder);
      if (!locationNeedsRegeneration(filePath, text, voiceId)) { skipped++; continue; }

      try {
        await generateTTS(text, filename, folder);
        writeLocationSidecar(filePath, text, voiceId);
        console.log(`[audio-autogen] generated location audio: ${folder}/${filename}`);
        generated++;
        await sleep(DELAY_MS);
      } catch (err: any) {
        console.error(`[audio-autogen] failed location audio ${folder}/${filename}: ${err?.message ?? err}`);
        failed++;
        await sleep(DELAY_MS);
      }
    }
  }

  if (generated > 0 || failed > 0) {
    console.log(`[audio-autogen] locations: generated ${generated}, failed ${failed}, existed ${skipped}`);
  }
}

/**
 * Generate `city_word_{slug}.mp3` (just the region name, no punctuation)
 * and `city_{slug}.mp3` (full "New caller from {region}." sentence) for
 * every region in the DB.  Called from safeRun() each autogen cycle.
 *
 * - city_word files go in the MM category folder so playPrompt() can find them.
 * - city files go in the uploads/ root so the existing browse-profiles
 *   direct-play logic (`alertGather.play(…/uploads/city_{slug}.mp3)`) works.
 */
async function generateRegionWordAudio(): Promise<void> {
  if (!process.env.ELEVENLABS_API_KEY) return;
  let { storage } = await import("./storage").catch(() => ({ storage: null as any }));
  if (!storage) return;
  const regions = await storage.getAllRegions().catch(() => [] as { id: number; name: string; slug: string | null }[]);
  if (!regions.length) return;

  let voiceFolder = "mm";
  try {
    const settings = await storage.getSiteSettings();
    const cat = settings?.siteCategory ?? "MM";
    voiceFolder = cat === "MW" ? "mw" : "mm";
  } catch { /* default to mm */ }

  let generated = 0;
  let skipped = 0;

  for (const region of regions) {
    const safe = (region.slug ?? region.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    // 1. city_word_{slug}.mp3 — just the spoken region name, in the category folder
    const wordFilename = `city_word_${safe}.mp3`;
    const wordText     = region.name;
    const wordPath     = path.join(UPLOADS_DIR, voiceFolder, wordFilename);
    const voiceId      = getVoiceIdForFolder(voiceFolder);
    if (needsRegenerationGlobal(wordPath, wordText)) {
      try {
        await generateTTS(wordText, wordFilename, voiceFolder);
        writeSidecarGlobal(wordPath, wordText);
        generated++;
        await sleep(DELAY_MS);
      } catch (err: any) {
        console.error(`[audio-autogen] city_word ${wordFilename}: ${err?.message ?? err}`);
        await sleep(DELAY_MS);
      }
    } else { skipped++; }

    // 2. city_{slug}.mp3 — "New caller from {region}." in uploads/ root (no subfolder)
    const cityFilename = `city_${safe}.mp3`;
    const cityText     = `New caller from ${region.name}.`;
    const cityPath     = path.join(UPLOADS_DIR, cityFilename);
    if (needsRegenerationGlobal(cityPath, cityText)) {
      try {
        await generateTTS(cityText, cityFilename, undefined, voiceId);
        writeSidecarGlobal(cityPath, cityText);
        generated++;
        await sleep(DELAY_MS);
      } catch (err: any) {
        console.error(`[audio-autogen] city ${cityFilename}: ${err?.message ?? err}`);
        await sleep(DELAY_MS);
      }
    } else { skipped++; }
  }

  if (generated > 0) {
    console.log(`[audio-autogen] region words: generated ${generated}, existed ${skipped}`);
  }
}

/**
 * On-demand trigger: call whenever a new region is first encountered in a
 * live call so the city word and city announcement files are generated
 * before the next time that region appears in the browse stream.
 */
export function triggerCityWordAudio(regionName: string): void {
  if (!process.env.ELEVENLABS_API_KEY) return;
  (async () => {
    let voiceFolder = "mm";
    try {
      const { storage } = await import("./storage");
      const settings = await storage.getSiteSettings();
      const cat = settings?.siteCategory ?? "MM";
      voiceFolder = cat === "MW" ? "mw" : "mm";
    } catch { /* default */ }

    const safe = regionName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const voiceId = getVoiceIdForFolder(voiceFolder);

    const wordFilename = `city_word_${safe}.mp3`;
    const wordPath     = path.join(UPLOADS_DIR, voiceFolder, wordFilename);
    if (needsRegenerationGlobal(wordPath, regionName)) {
      await generateTTS(regionName, wordFilename, voiceFolder).catch(() => {});
      writeSidecarGlobal(wordPath, regionName);
    }

    const cityFilename = `city_${safe}.mp3`;
    const cityText     = `New caller from ${regionName}.`;
    const cityPath     = path.join(UPLOADS_DIR, cityFilename);
    if (needsRegenerationGlobal(cityPath, cityText)) {
      await generateTTS(cityText, cityFilename, undefined, voiceId).catch(() => {});
      writeSidecarGlobal(cityPath, cityText);
    }
  })().catch(err => console.error(`[audio-autogen] triggerCityWordAudio error for "${regionName}":`, err));
}

let running = false;

async function safeRun() {
  if (running) {
    console.log("[audio-autogen] previous run still in progress — skipping this tick.");
    return;
  }
  running = true;
  try {
    await runAudioAutogen();
    await runLocationAutogen();
    await generateRegionWordAudio();
  } finally {
    running = false;
  }
}

/**
 * Helper: delete every .mp3 and .txt sidecar file inside a folder.
 * Does NOT delete user recordings (timestamp-named files like 1774045714166-196436.mp3).
 * Returns the number of mp3 files deleted.
 */
function wipePromptFolder(folder: string): number {
  let deleted = 0;
  const dir = path.join(UPLOADS_DIR, folder);
  if (!fs.existsSync(dir)) return 0;
  try {
    for (const file of fs.readdirSync(dir)) {
      // Skip timestamp-named user recordings (digits-only prefix before the hyphen)
      if (/^\d{10,}-\d+\.(mp3|txt)$/i.test(file)) continue;
      const fullPath = path.join(dir, file);
      try {
        fs.unlinkSync(fullPath);
        if (/\.mp3$/i.test(file)) deleted++;
      } catch { /* ignore individual file errors */ }
    }
  } catch { /* ignore dir read errors */ }
  return deleted;
}

/**
 * Delete every autogen-managed system prompt file (and its sidecar) so the
 * next autogen run (triggered immediately) regenerates them all from scratch.
 * Also wipes the now-disabled mw/ and mw_m/ folders since all audio is
 * consolidated to the MM voice only.
 * Called by the admin Force Regenerate endpoint.
 */
/**
 * Generate (or force-regenerate) a single named system prompt file.
 * Deletes the existing MP3 + sidecar so needsRegeneration returns true,
 * then calls generateTTS immediately.  Works for any filename in MM_PROMPTS.
 * Returns the folder path the file was written to, or throws on failure.
 */
export async function forceRegenSinglePrompt(filename: string): Promise<{ folder: string; file: string }> {
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY is not configured.");
  }

  const prompt = MM_PROMPTS.find(p => p.filename === filename);
  if (!prompt) throw new Error(`Prompt "${filename}" not found in MM_PROMPTS.`);
  if (!prompt.text.trim()) throw new Error(`Prompt "${filename}" has no text — cannot generate.`);

  const folder = "mm";
  const dir = path.join(UPLOADS_DIR, folder);
  const filePath = path.join(dir, filename);
  const sidecar = filePath.replace(/\.mp3$/i, ".txt");

  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* ignore */ }
  try { if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar); } catch { /* ignore */ }

  await generateTTS(prompt.text.trim(), filename, folder);
  writeSidecarGlobal(filePath, prompt.text);
  console.log(`[audio-autogen] forceRegenSinglePrompt: generated ${folder}/${filename}`);
  return { folder, file: filePath };
}

export async function forceRegenAllSystemPrompts(): Promise<{ queued: number }> {
  let deleted = 0;

  // ── Active category folders (currently only mm/) ──────────────────────────
  for (const { folder } of FOLDERS) {
    deleted += wipePromptFolder(folder);
  }

  // ── Disabled folders — wipe entirely so old MW/MW_M voice files are gone ──
  deleted += wipePromptFolder("mw");
  deleted += wipePromptFolder("mw_m");

  // ── Roger greeting files (uploads/ root) ─────────────────────────────────
  for (const prompt of ROGER_PROMPTS) {
    const mp3 = path.join(UPLOADS_DIR, prompt.filename);
    const txt = mp3.replace(/\.mp3$/i, ".txt");
    try { if (fs.existsSync(mp3)) { fs.unlinkSync(mp3); deleted++; } } catch { /* ignore */ }
    try { if (fs.existsSync(txt)) { fs.unlinkSync(txt); } } catch { /* ignore */ }
  }

  // Kick off an immediate autogen run so mm/ files get regenerated right away.
  safeRun().catch(err => console.error("[audio-autogen] force-regen run failed:", err));

  console.log(`[audio-autogen] force-regen: deleted ${deleted} file(s) across mm/, mw/, mw_m/, regeneration queued.`);
  return { queued: deleted };
}

const INTERVAL_MS = 60 * 60 * 1000;
const STARTUP_DELAY_MS = 60 * 1000;

export function startAudioAutogen() {
  // Run once after startup delay, then every hour
  setTimeout(() => {
    safeRun();
    setInterval(safeRun, INTERVAL_MS);
  }, STARTUP_DELAY_MS);

  console.log(`[audio-autogen] scheduler started — first run in ${STARTUP_DELAY_MS / 1000}s, then every ${INTERVAL_MS / 60000} minutes.`);
}
