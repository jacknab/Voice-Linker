export type BrowseQueueItemType = "profile" | "message" | "invite";

export type BrowseQueueItem = {
  userId: string;
  recordingUrl: string;
  nameRecordingUrl?: string | null;
  regionId?: string | null;
  regionName?: string | null;
  isPreExisting?: boolean;
  /** When true, play "caller close to you" (or "from [city]" for linked regions)
   *  before the profile greeting. Set on profiles injected at slot 2 in response
   *  to a caller joining AFTER the browse queue was created. */
  isNewCallerAlert?: boolean;
  isNearby?: boolean;
  lat?: number | null;
  lon?: number | null;
  // Priority item metadata (slot 1 injections)
  itemType?: BrowseQueueItemType;
  messageId?: string;            // for 'message' items — DB message ID
  messageRecordingUrl?: string;  // for 'message' items — audio URL of the message
};

export interface CallerBrowseState {
  queue: BrowseQueueItem[];
  // ── ivr-default fields ─────────────────────────────────────────────────────
  seenUserIds: string[];
  heardProfileIds: string[];       // profiles marked heard after slot-0 action
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
  browsingLinked: boolean;
  browsingLinkedRegionId: string | null;
  browsingLinkedRegionName: string | null;
}
