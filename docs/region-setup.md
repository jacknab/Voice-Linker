# Region Setup Guide

Regions are the core organizational unit of the phone chat service. Each region represents a distinct geographic market — for example, a city or metro area — and has its own dedicated phone number that callers dial in to.

---

## What is a Region?

A region groups callers who share a phone number together into a single party line. When someone calls the regional number, they hear greetings from other callers currently on that line. Regions can be linked together so that when a caller exhausts the local queue, they are offered the option to hear callers from a nearby region.

---

## Region Fields

### Market Name
The human-readable name for this region, shown in the admin panel.
Example: `Denver`, `Chicago Metro`, `South Florida`

### URL Slug
A short, URL-safe identifier used internally to route calls and identify the region in API requests. Auto-generated from the Market Name but can be customized.
Rules: lowercase letters, numbers, and hyphens only.
Example: `denver`, `chicago-metro`, `south-florida`

### Phone Number
The Twilio phone number callers dial to join this region's party line. Must be in E.164 format.
Example: `+13035550123`

Each region should have its own unique phone number configured as a Twilio webhook pointing to `/voice/incoming`.

### Timezone
The IANA timezone name for this region. Used for time-of-day display and scheduling logic.
Example: `America/Denver`, `America/Chicago`, `America/New_York`

A full list of valid timezone identifiers: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones

### Default Zip Code
A fallback US zip code that represents the geographic center of this region. When a caller joins the party line but hasn't provided their own zip code, the system uses this zip code to determine their approximate location for proximity-based profile sorting.

This ensures that even callers who skip the zip code prompt still hear nearby profiles first, based on the region's central location.

Example: `80202` (downtown Denver), `60601` (downtown Chicago)

**How it works:**
1. The caller enters the party line
2. If they have their own zip code on file, that is used for proximity sorting
3. If they don't, the system looks up the region's Default Zip Code and uses its latitude/longitude as a stand-in
4. Profiles are then sorted from closest to farthest relative to that point

### Max Capacity
The maximum number of simultaneous callers allowed in this region's party line at any one time.

**What it controls:**
- Once this limit is reached, the system can stop accepting new callers to this region or route them elsewhere (depending on configuration)
- It acts as a guardrail against a single region becoming overloaded
- The value does not affect the number of stored profiles — only how many callers can be live and browsing at the same time

**Typical values:**
- Small regional market: `100–500`
- Mid-size metro: `500–2000`
- Large national market: `2000–5000`

Default: `1000`

### Description
Optional free-text note about this region, visible only in the admin panel. Useful for internal notes about the market, its Twilio configuration, or operational status.

### Linked Nearby Region
An optional connection to another region. When a caller has listened through all active profiles in their region, the system offers them the option to hear callers from the linked region instead.

This is useful for geographic neighbors — for example, a Denver region might be linked to a Colorado Springs region so that callers who exhaust the Denver queue can still hear nearby voices.

**Behavior:**
1. Caller listens through the full local queue (all profiles looped once)
2. System plays: *"You've heard all callers in your area. Press 1 to hear callers close to you from [Linked Region Name]."*
3. If the caller presses 1, the queue is replaced with profiles from the linked region
4. If a new local caller joins while they're listening to the linked region, the system announces it

Only one linked region can be set per region. Linking is one-directional — linking A→B does not automatically link B→A.

### Active Toggle
Controls whether this region is live and accepting callers. Setting a region to **Inactive** prevents new calls from being processed for that number without requiring any Twilio configuration changes.

---

## Proximity Sorting

Once a region has a Default Zip Code, the system automatically resolves its latitude and longitude using the zippopotam.us and OpenStreetMap Nominatim APIs and stores them in the zip code cache table. Subsequent callers benefit from this cached data instantly — no external API calls needed after the first time.

Profiles are sorted in the following order for each caller:

| Priority | Criteria |
|----------|----------|
| 1st | Distance from the caller (closest first) |
| 2nd | Profile creation date (tiebreaker for equal distances) |
| Last | Profiles with no location data (sorted after all located callers) |

---

## Setting Up a New Region

1. Provision a phone number in Twilio for this region
2. Configure the Twilio webhook for that number to point to: `https://yourdomain.com/voice/incoming`
3. Open the Admin panel → **Regional Management** → **Add Region**
4. Fill in Market Name, URL Slug, Phone Number, Timezone, and Default Zip Code
5. Set Max Capacity based on your expected traffic
6. Optionally link to a nearby region
7. Toggle **Active** and save

The region is immediately live once saved with Active status.
