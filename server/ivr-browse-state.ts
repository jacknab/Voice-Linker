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
  seenUserIds: string[];
  blockedUserIds: Set<string>;
  lastPlayedProfile: BrowseQueueItem | null;
  linkedRegionLoaded: boolean;
  callerRegionId: string | null;
  callerRegionName: string | null;
  localUserIds: string[];
  announcedNewLocalIds: string[];
  linkedRegionSnapshots: { regionId: string; regionName: string; knownUserIds: string[] }[];
  announcedLinkedCallerIds: string[];
  greetingsPlayed: number;
  windowAnnouncementsUsed: number;
  callerCountAnnounced: boolean;
}
