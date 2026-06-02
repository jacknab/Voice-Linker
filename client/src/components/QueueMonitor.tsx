import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone, ChevronRight, X, Shuffle, RefreshCw, Wifi, WifiOff } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface BrowseQueueItem {
  userId: string;
  recordingUrl: string;
  nameRecordingUrl?: string | null;
  regionId?: string | null;
  regionName?: string | null;
}

interface QueueEntry {
  callSid: string;
  phoneNumber: string;
  queue: BrowseQueueItem[];
  greetingsPlayed: number;
  lastUpdate: number;
}

interface ProfileRow {
  id: string;
  userId: string;
  recordingUrl: string;
  nameRecordingUrl?: string | null;
  displayName?: string | null;
  phoneNumber?: string | null;
  regionName?: string | null;
}

// ── QueueMonitor ──────────────────────────────────────────────────────────────

export default function QueueMonitor({ adminKey }: { adminKey: string | null }) {
  const [queues, setQueues] = useState<Record<string, QueueEntry>>({});
  const [connected, setConnected] = useState(false);
  const [selectedCaller, setSelectedCaller] = useState<string | null>(null);
  const [injectSearch, setInjectSearch] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch all available profiles for the inject dropdown
  const { data: allProfiles = [] } = useQuery<ProfileRow[]>({
    queryKey: ["/api/admin/profiles"],
  });

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const keyParam = adminKey ? `?key=${encodeURIComponent(adminKey)}` : "";
    const url = `${proto}://${window.location.host}/ws/queues${keyParam}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string);
        if (msg.type === "snapshot") {
          setQueues(msg.queues ?? {});
        } else if (msg.type === "queue:update") {
          setQueues(prev => ({ ...prev, [msg.callSid]: msg as QueueEntry }));
        } else if (msg.type === "caller:removed") {
          setQueues(prev => {
            const next = { ...prev };
            delete next[msg.callSid];
            return next;
          });
          setSelectedCaller(prev => prev === msg.callSid ? null : prev);
        }
      } catch { /* ignore malformed message */ }
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, [adminKey]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // Send a command to the server
  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const injectProfile = useCallback((callSid: string, profile: ProfileRow) => {
    send({
      type: "queue:inject",
      callSid,
      profile: {
        userId:             profile.userId,
        recordingUrl:       profile.recordingUrl,
        nameRecordingUrl:   profile.nameRecordingUrl ?? null,
        regionName:         profile.regionName ?? null,
      } satisfies BrowseQueueItem,
    });
    setInjectSearch("");
  }, [send]);

  const removeFromQueue = useCallback((callSid: string, userId: string) => {
    send({ type: "queue:remove", callSid, userId });
  }, [send]);

  const callerList = Object.values(queues).sort((a, b) => b.lastUpdate - a.lastUpdate);
  const selected = selectedCaller ? queues[selectedCaller] : null;

  const filteredProfiles = allProfiles.filter(p => {
    if (!injectSearch.trim()) return true;
    const q = injectSearch.toLowerCase();
    return (
      (p.displayName ?? "").toLowerCase().includes(q) ||
      (p.phoneNumber ?? "").includes(q) ||
      (p.regionName ?? "").toLowerCase().includes(q)
    );
  }).slice(0, 20);

  return (
    <div className="flex gap-4 h-full" data-testid="queue-monitor">
      {/* ── Left: caller list ── */}
      <div className="w-72 shrink-0 flex flex-col gap-2">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold">Active Callers</h2>
          <span className="flex items-center gap-1 text-xs">
            {connected
              ? <><Wifi size={12} className="text-green-500" /> <span className="text-green-600 dark:text-green-400">Live</span></>
              : <><WifiOff size={12} className="text-amber-500" /> <span className="text-amber-600 dark:text-amber-400">Reconnecting…</span></>
            }
          </span>
        </div>

        {callerList.length === 0 ? (
          <div className="text-xs text-muted-foreground p-3 rounded border border-dashed border-border text-center">
            No active callers browsing profiles right now.
          </div>
        ) : (
          callerList.map(entry => (
            <button
              key={entry.callSid}
              data-testid={`caller-card-${entry.callSid}`}
              onClick={() => setSelectedCaller(
                selectedCaller === entry.callSid ? null : entry.callSid
              )}
              className={`w-full text-left px-3 py-2.5 rounded border text-sm transition-colors ${
                selectedCaller === entry.callSid
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Phone size={13} className="text-muted-foreground shrink-0" />
                  <span className="font-mono font-medium truncate text-xs">
                    {entry.phoneNumber}
                  </span>
                </div>
                <ChevronRight size={13} className="text-muted-foreground shrink-0" />
              </div>
              <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                <span>{entry.queue.length} in queue</span>
                <span>·</span>
                <span>{entry.greetingsPlayed} played</span>
              </div>
            </button>
          ))
        )}
      </div>

      {/* ── Right: queue detail ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-2 rounded border border-dashed border-border">
            <Shuffle size={22} className="opacity-30" />
            <span>Select a caller to view and edit their queue</span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-sm">{selected.phoneNumber}</span>
                <span className="text-xs text-muted-foreground ml-2">
                  {selected.queue.length} profile{selected.queue.length !== 1 ? "s" : ""} in queue
                  &nbsp;·&nbsp; {selected.greetingsPlayed} played this session
                </span>
              </div>
              <button
                data-testid="btn-close-queue-detail"
                onClick={() => setSelectedCaller(null)}
                className="p-1 rounded hover:bg-muted"
              >
                <X size={14} />
              </button>
            </div>

            {/* Current queue */}
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Current Queue (front → back)
              </p>
              {selected.queue.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Queue is empty — caller will cycle or end</p>
              ) : (
                selected.queue.map((item, i) => (
                  <div
                    key={item.userId}
                    data-testid={`queue-item-${item.userId}`}
                    className={`flex items-center gap-3 px-3 py-2 rounded border text-xs ${
                      i === 0 ? "border-primary/50 bg-primary/5" : "border-border"
                    }`}
                  >
                    <span className={`w-5 shrink-0 text-center font-mono font-bold ${
                      i === 0 ? "text-primary" : "text-muted-foreground"
                    }`}>{i === 0 ? "▶" : i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{item.userId}</div>
                      {item.regionName && (
                        <div className="text-muted-foreground truncate">{item.regionName}</div>
                      )}
                    </div>
                    {item.recordingUrl && (
                      <audio
                        controls
                        src={item.recordingUrl}
                        className="h-6 w-32 shrink-0"
                        data-testid={`audio-queue-${item.userId}`}
                      />
                    )}
                    <button
                      data-testid={`btn-remove-queue-${item.userId}`}
                      onClick={() => removeFromQueue(selected.callSid, item.userId)}
                      className="p-1 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
                      title="Remove from queue"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Inject profile */}
            <div className="mt-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                Inject Profile to Front of Queue
              </p>
              <input
                data-testid="input-inject-search"
                type="text"
                value={injectSearch}
                onChange={e => setInjectSearch(e.target.value)}
                placeholder="Search by name, phone, or region…"
                className="w-full px-3 py-1.5 text-xs border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary mb-1.5"
              />
              {injectSearch.trim() && (
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                  {filteredProfiles.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-1">No matching profiles</p>
                  ) : (
                    filteredProfiles.map(p => (
                      <button
                        key={p.userId}
                        data-testid={`btn-inject-${p.userId}`}
                        onClick={() => injectProfile(selected.callSid, p)}
                        className="flex items-center gap-2 px-3 py-2 rounded border border-border hover:border-primary hover:bg-primary/5 text-xs text-left transition-colors"
                      >
                        <Phone size={11} className="text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{p.displayName ?? p.phoneNumber ?? p.userId}</div>
                          {p.regionName && <div className="text-muted-foreground truncate">{p.regionName}</div>}
                        </div>
                        <span className="text-primary font-semibold shrink-0">+ Inject</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
