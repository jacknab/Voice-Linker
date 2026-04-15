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
import { generateTTS } from "./elevenlabs";
import { reverseGeocodeNeighborhood } from "./zipLookup";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

type Prompt = { filename: string; text: string };

// ── MM prompts (uploads/mm/) ───────────────────────────────────────────────
const MM_PROMPTS: Prompt[] = [
  { filename: "system_greeting.mp3",    text: "Welcome to the Male Box. this service assumes no responsibility for personal meetings." },
  { filename: "no_caller_id.mp3",       text: "We could not identify your call. Goodbye." },
  { filename: "region_not_active.mp3",  text: "This phone number is not currently active. Please try again later." },
  { filename: "region_unavailable.mp3", text: "This market is temporarily unavailable. Please try again later." },
  { filename: "caller_blocked.mp3",     text: "Caller blocked. You will no longer hear this caller's profile." },
  { filename: "error_generic.mp3",      text: "An error occurred. Please try again later." },
  { filename: "invalid_choice.mp3",     text: "Invalid choice." },
  { filename: "goodbye.mp3",            text: "Thank you for calling. Goodbye." },

  { filename: "membership_entry_prompt.mp3", text: "If you have a membership card, enter your card number now. Otherwise press the pound key." },
  { filename: "membership_pin_prompt.mp3",   text: "Please enter your 4-digit PIN." },
  { filename: "link_code_invalid.mp3",       text: "That code is invalid or has expired. Please generate a new code from your web account and try again." },
  { filename: "membership_invalid.mp3",      text: "We could not find a card with that number. Please check your card and try again." },
  { filename: "membership_linked.mp3",       text: "Card accepted." },
  { filename: "access_expired.mp3",          text: "Your access has expired." },
  { filename: "free_mode_announcement.mp3",  text: "Great news! All calls are completely free right now. No membership required. Enjoy unlimited time on the system. Connecting you now." },
  { filename: "free_trial_offer.mp3",        text: "We would like to offer you a free trial. To get your free trial now press 1. To get your free trial later press the pound key." },
  { filename: "free_trial_terms.mp3",        text: "Your free trial will expire in seven days and it must be used from this phone number." },

  { filename: "phone_booth_welcome.mp3",         text: "Welcome to the live connector. Greetings from all the local guys here right now. Swap private messages and then connect live for a totally private conversation. You can leave the connector anytime you want by pressing the pound sign." },
  { filename: "welcome_record_name.mp3",         text: "You need to record a greeting to introduce yourself to the other guys first. Let's record the name you want to use. After the tone, record just your first name." },
  { filename: "name_retry.mp3",                  text: "We didn't catch your name. Please try again." },
  { filename: "name_saved_record_greeting.mp3",  text: "Great. Now record your greeting for other callers. After the tone, press any key when done." },
  { filename: "greeting_error.mp3",              text: "That greeting was too short. Please try again after the tone. Press any key when done." },
  { filename: "greeting_setup.mp3",              text: "Your last greeting you recorded is still available. To use it again, press 1. To record a new greeting, press 2. To hear your greeting, press 3. To repeat these choices, press 9. To continue, press pound." },
  { filename: "review_greeting.mp3",             text: "To hear your greeting, press 1. To re-record, press 2. To accept and continue, press 3. To repeat these choices, press 9." },
  { filename: "no_greeting_found.mp3",           text: "No greeting found." },
  { filename: "profile_saved.mp3",               text: "Your greeting has been saved." },
  { filename: "profile_save_error.mp3",          text: "We could not save your profile. Please try again." },
  { filename: "recording_rejected_unclear.mp3",       text: "We need you to re-record your greeting. We couldn't understand what you said. Please speak clearly into the phone so everyone can hear what you have to say about yourself and what you're looking for. Be sure to turn down any loud music or the television before you record. To re-record, press 1." },
  { filename: "recording_rejected_phone_number.mp3",  text: "We need you to re-record your greeting. Phone numbers are not allowed in your greeting and it will not be approved if it contains one. To re-record, press 1." },
  { filename: "zip_code_prompt.mp3",             text: "Optional: enter your 5-digit zip code and we'll play callers closest to you first. Press pound to skip." },
  { filename: "zip_code_saved.mp3",              text: "Got it. We'll use your zip code to show you nearby callers." },

  { filename: "main_menu.mp3",      text: "Main menu. To enter the male box press star. To add time or purchase a membership press 2. For information on membership prices press 4. To manage your membership press 8. For customer service press 0. To repeat these choices press 9." },
  { filename: "trial_warning.mp3",  text: "You have less than 15 minutes remaining in your free trial. Stay connected by joining now. You won't be interrupted by ads. Access member only features like off-line messaging, connect live for one on one chat. To join right now press 1. To continue press pound." },
  { filename: "member_warning.mp3", text: "You have less than 15 minutes remaining in your membership. To renew now press 1. To continue press pound." },
  { filename: "no_profiles.mp3",    text: "There are no profiles available right now. Please call back later." },

  { filename: "info_menu.mp3",                   text: "Information, prices, and membership. Press 1 for membership questions. Press 9 to return to the main menu." },
  { filename: "membership_questions.mp3",        text: "Membership questions. Press 1 to learn how membership works. Press 2 to hear our pricing. Press 3 to purchase a membership with a credit card. Press 9 to return to the main menu." },
  { filename: "membership_how_it_works.mp3",     text: "Here is how membership works. As a member, you get full access to the voice line community. Members can browse unlimited caller profiles, send and receive voice messages, and enjoy priority access to new features. We offer three membership options: a 24 hour pass, a 14 day membership, and a 30 day membership. Your remaining time is tracked in hours. When you have less than 60 minutes left, the system will tell you in minutes. Choose the option that works best for you." },
  { filename: "membership_pricing.mp3",          text: "Here are our membership prices. A 24 hour pass is 3 dollars. A 14 day membership is 10 dollars. A 30 day membership is 25 dollars. To purchase, press 3 from the membership menu." },
  { filename: "purchase_pre_menu.mp3",           text: "If you have a promotional code press 1. To purchase 1 day of access for $3.99 press 2. To repeat these choices press 9. To cancel press pound." },
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

  { filename: "live_connect_disclaimer.mp3",  text: "Please be respectful and kind. You are about to request a live one on one connection." },
  { filename: "live_connect_connecting.mp3",  text: "Connecting you now. You can exit the live connection at any time by pressing pound. Enjoy!" },
  { filename: "live_invite_options.mp3",      text: "To accept, press 1. To decline and hear the next caller's greeting, press 2. To hear this caller's greeting, press 3. To block this caller, press 4." },
  { filename: "live_connect_ended.mp3",       text: "Your live connection has ended. Returning you to the male box." },
  { filename: "live_connect_failed.mp3",      text: "We were unable to connect your call. Returning you to the male box." },
  { filename: "live_connect_busy.mp3",        text: "That caller is already connected with someone else. Please try again later." },
  { filename: "live_connect_unavailable.mp3", text: "This caller is not available for a live connection." },
  { filename: "live_connect_left_line.mp3",   text: "Sorry, that caller has left the line." },
  { filename: "live_connect_no_minutes.mp3",  text: "You need at least 5 minutes remaining on your membership to connect live. Please add more time and try again." },
  { filename: "live_invite_expired.mp3",      text: "That live connection invitation has expired. Returning to profiles." },

  { filename: "cs_menu_intro.mp3",          text: "Customer service." },
  { filename: "cs_menu_options.mp3",        text: "Press 1 for your full account details. Press 2 to add time to your account. Press 3 for billing information. Press 4 to leave a message for our billing team. Press star to return to the main menu." },
  { filename: "cs_account_title.mp3",       text: "Account details." },
  { filename: "cs_account_label_status.mp3",     text: "Status:" },
  { filename: "cs_account_label_membership.mp3", text: "Membership type:" },
  { filename: "cs_account_label_time.mp3",       text: "Time remaining:" },
  { filename: "cs_account_greeting_yes.mp3",     text: "You have a greeting recorded." },
  { filename: "cs_account_greeting_no.mp3",      text: "You do not have a greeting recorded yet. You must record a greeting before other callers can hear you." },
  { filename: "cs_account_options.mp3",     text: "Press 2 to add more time. Press 9 to return to customer service. Press star for the main menu." },
  { filename: "cs_account_error.mp3",       text: "We were unable to retrieve your account information at this time. Press 9 to return to customer service. Press star for the main menu." },
  { filename: "cs_billing_title.mp3",       text: "Billing information." },
  { filename: "cs_billing_static.mp3",      text: "Time is deducted from your membership while you are connected to the system. You can add more time at any time by pressing 2 from the main menu. If you were recently charged and your time has not been applied, please leave a message for our billing team and we will investigate promptly." },
  { filename: "cs_billing_options.mp3",     text: "Press 2 to add time now. Press 4 to leave a message for the billing team. Press 9 to return to customer service. Press star for the main menu." },
  { filename: "cs_leave_message_prompt.mp3",text: "Please describe your billing question or issue after the tone. Press any key when you are done." },
  { filename: "cs_message_received.mp3",    text: "Your message has been received. Our billing team will review it and follow up with you as soon as possible. Thank you for calling." },

  { filename: "phrase_you_have.mp3",             text: "You have" },
  { filename: "phrase_and.mp3",                  text: "and" },
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
  // Composite time-remaining announcements — single-file replacements for stitched playback.
  // Covers every minute value callers can encounter (1–1440 min, i.e. up to 24 hours).
  ...Array.from({ length: 1440 }, (_, i) => {
    const n = i + 1;
    return { filename: `time_remaining_${n}.mp3`, text: minutesToAnnouncementText(n) };
  }),
];

// ── MW prompts (uploads/mw/) — female voice for male callers ──────────────
const MW_PROMPTS: Prompt[] = [
  { filename: "gender_select.mp3",  text: "Guys, press one to talk to women. Women, press three to talk to guys." },
  { filename: "mw_main_menu.mp3",   text: "Main menu. If you're ready to join the action press 1. To buy membership time press 2. To manage your membership press 8. For customer service press 0. To repeat these choices press 9." },
  ...MM_PROMPTS.filter(p =>
    p.filename !== "main_menu.mp3" &&
    p.filename !== "mw_main_menu.mp3"
  ).map(p => {
    if (p.filename === "phone_booth_welcome.mp3")
      return { ...p, text: "Welcome to the live connector. Greetings from all the local women here right now. Swap private messages and then connect live for a totally private conversation. You can leave the connector anytime you want by pressing the pound sign." };
    if (p.filename === "welcome_record_name.mp3")
      return { ...p, text: "You need to record a greeting to introduce yourself to the women first. Let's record the name you want to use. After the tone, record just your first name." };
    if (p.filename === "live_connect_ended.mp3")
      return { ...p, text: "Your live connection has ended. Returning you to the live connector." };
    if (p.filename === "live_connect_failed.mp3")
      return { ...p, text: "We were unable to connect your call. Returning you to the live connector." };
    if (p.filename === "phrase_callers_on_the_line.mp3")
      return { ...p, text: "women on the line." };
    if (p.filename === "phrase_caller_on_the_line.mp3")
      return { ...p, text: "woman on the line." };
    return p;
  }),
];

// ── MW_M prompts (uploads/mw_m/) — male voice for female callers ──────────
const MW_M_PROMPTS: Prompt[] = [
  { filename: "mw_main_menu.mp3",  text: "Main menu. If you're ready to join the action press 1. To buy membership time press 2. To manage your membership press 8. For customer service press 0. To repeat these choices press 9." },
  ...MM_PROMPTS.filter(p =>
    p.filename !== "main_menu.mp3" &&
    p.filename !== "mw_main_menu.mp3"
  ).map(p => {
    if (p.filename === "phone_booth_welcome.mp3")
      return { ...p, text: "Welcome to the live connector. Greetings from all the local guys here right now. Swap private messages and then connect live for a totally private conversation. You can leave the connector anytime you want by pressing the pound sign." };
    if (p.filename === "welcome_record_name.mp3")
      return { ...p, text: "You need to record a greeting to introduce yourself to the guys first. Let's record the name you want to use. After the tone, record just your first name." };
    if (p.filename === "live_connect_ended.mp3")
      return { ...p, text: "Your live connection has ended. Returning you to the live connector." };
    if (p.filename === "live_connect_failed.mp3")
      return { ...p, text: "We were unable to connect your call. Returning you to the live connector." };
    if (p.filename === "phrase_callers_on_the_line.mp3")
      return { ...p, text: "guys on the line." };
    if (p.filename === "phrase_caller_on_the_line.mp3")
      return { ...p, text: "guy on the line." };
    return p;
  }),
];

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

const FOLDERS: { folder: string; prompts: Prompt[] }[] = [
  { folder: "mm",   prompts: MM_PROMPTS },
  { folder: "mw",   prompts: MW_PROMPTS },
  { folder: "mw_m", prompts: MW_M_PROMPTS },
];

const DELAY_MS = 2000;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runAudioAutogen(): Promise<void> {
  if (!process.env.ELEVENLABS_API_KEY) {
    console.log("[audio-autogen] ELEVENLABS_API_KEY not set — skipping.");
    return;
  }

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const { folder, prompts } of FOLDERS) {
    const dir = path.join(UPLOADS_DIR, folder);

    for (const prompt of prompts) {
      if (!prompt.text.trim()) { skipped++; continue; }

      const filePath = path.join(dir, prompt.filename);
      if (fs.existsSync(filePath)) { skipped++; continue; }

      try {
        await generateTTS(prompt.text.trim(), prompt.filename, folder);
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

  if (generated > 0 || failed > 0) {
    console.log(`[audio-autogen] run complete — generated: ${generated}, failed: ${failed}, already existed: ${skipped}`);
  } else {
    console.log(`[audio-autogen] all ${skipped} prompt files already exist — nothing to do.`);
  }
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
 * Immediately generate location audio for all three voice folders.
 * Internal — always awaited sequentially.
 */
async function generateLocationForAllFolders(location: string): Promise<void> {
  const filename = locationToFilename(location);
  const text = locationText(location);
  for (const folder of ["mm", "mw", "mw_m"]) {
    const filePath = path.join(UPLOADS_DIR, folder, filename);
    if (fs.existsSync(filePath)) continue;
    try {
      await generateTTS(text, filename, folder);
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

  const voiceFolders = ["mm", "mw", "mw_m"];
  let generated = 0;
  let failed = 0;
  let skipped = 0;

  for (const location of uniqueLocations) {
    const filename = locationToFilename(location);
    const text = locationText(location);

    for (const folder of voiceFolders) {
      const filePath = path.join(UPLOADS_DIR, folder, filename);
      if (fs.existsSync(filePath)) { skipped++; continue; }

      try {
        await generateTTS(text, filename, folder);
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
  } finally {
    running = false;
  }
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
