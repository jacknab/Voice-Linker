export type BrowseQueueItem = {
  userId: string;
  recordingUrl: string;
  nameRecordingUrl?: string | null;
  regionId?: string | null;
  regionName?: string | null;
  isPreExisting?: boolean;
  lat?: number | null;
  lon?: number | null;
};

export interface CallerBrowseState {
  queue: BrowseQueueItem[];
  // ── ivr-default fields ─────────────────────────────────────────────────────
  seenUserIds: string[];
  blockedUserIds: Set<string>;
  lastPlayedProfile: BrowseQueueItem | null;
  previousLastPlayedProfile: BrowseQueueItem | null;
  callerRegionId: string | null;
  callerRegionName: string | null;
  callerCountAnnounced: boolean;
  // ── ivr-no-mailbox fields (index-based queue navigation) ───────────────────
  index: number;
  lastPlayedIndex: number | null;
  hasWrapped: boolean;
  // ── shared fields ──────────────────────────────────────────────────────────
  linkedRegionLoaded: boolean;
  localUserIds: string[];
  announcedNewLocalIds: string[];
  linkedRegionSnapshots: { regionId: string; regionName: string; knownUserIds: string[] }[];
  announcedLinkedCallerIds: string[];
  greetingsPlayed: number;
  windowAnnouncementsUsed: number;
  // ── linked-region browsing ──────────────────────────────────────────────────
  // true while the caller is listening to a linked/nearby region's profiles
  browsingLinked: boolean;
  // The linked region currently being browsed (for prompts/logging)
  browsingLinkedRegionId: string | null;
  browsingLinkedRegionName: string | null;
}
