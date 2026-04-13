import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryClient, apiRequest, getAdminKey, setAdminKey, clearAdminKey } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import {
  Upload, Trash2, Play, Pause, Plus, Phone, LayoutDashboard,
  MessageSquare, PhoneCall, X, MapPin, Clock, Copy, Eye, EyeOff,
  Pencil, Globe, Volume2, VolumeX, Wand2, CheckCircle, AlertCircle, Loader2,
  CreditCard, Save, LogOut, Settings, Users, ChevronLeft, ChevronRight, ShieldOff,
  Shield, PlusCircle, MinusCircle, ArrowUpDown, Flag, CheckCircle2,
  XCircle, AlertTriangle, Tag, Megaphone, ToggleLeft, ToggleRight,
  BarChart2, TrendingUp, RefreshCw, GitBranch, ShieldAlert, Search, Send, Headphones,
} from "lucide-react";
import IvrFlowMap from "./admin/IvrFlowMap";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

interface ProfileWithUser {
  id: string;
  userId: string;
  recordingUrl: string;
  recordingDuration: number | null;
  siteCategory: string | null;
  gender: string | null;
  transcription: string | null;
  transcriptionStatus: string | null;
  createdAt: string;
  phoneNumber: string;
}

interface Region {
  id: string;
  name: string;
  slug: string;
  stateAbbreviation: string | null;
  phoneNumber: string;
  timezone: string;
  maxCapacity: number;
  description: string | null;
  isActive: boolean;
  linkedRegionIds: string[];
  defaultZipCode: string | null;
  createdAt: string;
  activeCalls: number;
  voiceProfiles: number;
  messagesRelayed: number;
}

type Tab = "dashboard" | "voice-profiles" | "transcriptions" | "regions" | "messages" | "phone-testing" | "audio-gen" | "memberships" | "cards" | "phone-numbers" | "blocked" | "callers" | "flagged" | "zip-codes" | "promo-codes" | "announcements" | "analytics" | "audit-log" | "site-settings" | "ivr-flow" | "mod-log" | "sms-marketing" | "support";

interface FlaggedItem {
  id: string;
  contentType: string;
  contentId: string;
  reason: string;
  status: string;
  createdAt: string | null;
  reviewedAt: string | null;
  reportedByPhone: string | null;
  profilePhone: string | null;
  profileRecordingUrl: string | null;
  profileDuration: number | null;
  messageFromPhone: string | null;
  messageToPhone: string | null;
  messageRecordingUrl: string | null;
}

interface CallerSummary {
  id: string;
  phoneNumber: string;
  membershipTier: string | null;
  remainingSeconds: number | null;
  createdAt: string | null;
  hasProfile: boolean;
  callCount: number;
  messageCount: number;
  blockCount: number;
  accountStatus: string;
}

interface ModerationLogEntry {
  id: string;
  targetUserId: string | null;
  targetPhone: string | null;
  eventType: string;
  reason: string | null;
  triggeredByRule: string | null;
  contentType: string | null;
  contentId: string | null;
  createdAt: string | null;
}

interface CallerDetail {
  user: {
    id: string; phoneNumber: string; membershipTier: string | null;
    remainingSeconds: number | null; stripeCustomerId: string | null;
    membershipNumber: string | null; membershipPin: string | null;
    createdAt: string | null; accountStatus: string | null;
  };
  mailbox: { id: string; mailboxNumber: string; createdAt: string | null } | null;
  profile: { id: string; recordingUrl: string; recordingDuration: number | null; createdAt: string | null } | null;
  zipCode: { code: string; city: string | null; state: string | null; neighborhood: string | null } | null;
  callHistory: { id: string; callSid: string; durationSeconds: number | null; startedAt: string | null; completedAt: string | null; toPhoneNumber: string | null }[];
  sentMessages: { id: string; toPhoneNumber: string; createdAt: string | null; isRead: boolean | null }[];
  receivedMessages: { id: string; fromPhoneNumber: string; createdAt: string | null; isRead: boolean | null }[];
  blockedByUser: { id: string; phoneNumber: string; blockedAt: string | null }[];
  blockedByOthers: { id: string; phoneNumber: string; blockedAt: string | null }[];
}

// ── Shared class tokens for light content area ────────────────────────────────
const C = {
  heading: "text-gray-900 font-mono font-bold tracking-widest uppercase",
  subtext: "text-gray-500 font-mono text-xs",
  label: "block text-gray-500 font-mono text-xs tracking-widest mb-1.5 uppercase",
  input: "w-full bg-white border border-gray-300 rounded px-3 py-2.5 text-gray-900 font-mono text-sm placeholder-gray-400 focus:outline-none focus:border-[#f5a623] transition-colors",
  select: "w-full bg-white border border-gray-300 rounded px-3 py-2.5 text-gray-900 font-mono text-sm focus:outline-none focus:border-[#f5a623] transition-colors appearance-none",
  card: "border border-gray-200 rounded-lg p-5 bg-white space-y-4",
  cardAlt: "border border-gray-200 rounded-lg p-5 bg-gray-50 space-y-4",
  btnPrimary: "flex items-center gap-2 px-4 py-2 bg-[#f5a623] hover:bg-amber-500 text-black font-mono text-xs font-bold tracking-widest uppercase rounded transition-colors disabled:bg-[#f5a623]/40 disabled:cursor-not-allowed",
  btnSecondary: "flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-800 font-mono text-xs tracking-widest uppercase rounded transition-colors",
  btnDanger: "flex items-center gap-1.5 px-3 py-1.5 border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 font-mono text-xs rounded transition-colors disabled:opacity-50",
  btnGhost: "flex items-center gap-1.5 px-3 py-1.5 border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 font-mono text-xs rounded transition-colors",
  th: "text-left px-4 py-3 text-gray-500 font-mono text-xs tracking-widest uppercase bg-gray-50 border-b border-gray-200",
  td: "px-4 py-3 text-gray-800 font-mono text-sm border-b border-gray-100",
  row: "hover:bg-amber-50/40 transition-colors",
  badge: "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-mono text-xs tracking-widest uppercase",
  statValue: "text-[#f5a623] font-mono font-bold text-3xl",
  statLabel: "text-gray-500 font-mono text-xs tracking-widest uppercase mt-1",
  panelHeader: "bg-[#1e293b] text-white font-mono text-xs font-bold tracking-widest uppercase px-4 py-2.5",
  panel: "border border-gray-300 rounded-md overflow-hidden mb-4",
  panelBody: "bg-white",
  fieldRow: "grid grid-cols-[160px_1fr] items-center border-b border-gray-100 last:border-0",
  fieldLabel: "px-4 py-2 text-gray-500 font-mono text-xs tracking-widest uppercase bg-gray-50 border-r border-gray-100",
  fieldValue: "px-4 py-2 text-gray-800 font-mono text-sm",
};

// ── AudioPlayer ───────────────────────────────────────────────────────────────
function AudioPlayer({ src }: { src: string }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { el.play(); setPlaying(true); }
  }
  return (
    <div className="flex items-center gap-2">
      <audio ref={audioRef} src={src} onEnded={() => setPlaying(false)} preload="none" />
      <button
        data-testid={`btn-play-${src}`}
        onClick={toggle}
        className="flex items-center justify-center w-8 h-8 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-600 transition-colors"
      >
        {playing ? <Pause size={13} /> : <Play size={13} />}
      </button>
      <span className="text-gray-400 text-xs font-mono">{playing ? "PLAYING" : "READY"}</span>
    </div>
  );
}

// ── UploadDialog ──────────────────────────────────────────────────────────────
function UploadDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: siteSettings } = useQuery<{ siteCategory: string }>({ queryKey: ["/api/site-settings"] });
  const isMW = siteSettings?.siteCategory === "MW";

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!phoneNumber.trim() || !file) throw new Error("Missing fields");
      if (isMW && !gender) throw new Error("Gender is required for MW greetings");
      const form = new FormData();
      form.append("phoneNumber", phoneNumber.trim());
      form.append("audio", file);
      if (isMW && gender) form.append("gender", gender);
      const res = await fetch("/api/admin/profiles/upload", { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/profiles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Profile created", description: `Greeting uploaded for ${phoneNumber}` });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && (dropped.type === "audio/mpeg" || dropped.name.endsWith(".mp3"))) {
      setFile(dropped);
    } else {
      toast({ title: "Invalid file", description: "Only MP3 files are accepted", variant: "destructive" });
    }
  }

  const isSubmitDisabled = !phoneNumber.trim() || !file || (isMW && !gender) || uploadMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 bg-white rounded-xl border border-gray-200 p-6 shadow-2xl">
        <button data-testid="btn-close-dialog" onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition-colors">
          <X size={18} />
        </button>
        <h2 className="text-gray-900 font-mono text-base font-bold mb-1 tracking-widest uppercase">Upload Profile Greeting</h2>
        <div className="flex items-center gap-2 mb-6">
          <p className="text-gray-500 text-xs font-mono">MP3 file will become the caller's live profile greeting</p>
          <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${isMW ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
            {isMW ? "MW" : "MM"}
          </span>
        </div>
        <div className="space-y-4">
          <div>
            <label className={C.label}>Caller Phone Number</label>
            <input data-testid="input-phone-number" type="tel" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="+1 555 000 0000" className={C.input} />
          </div>

          {isMW && (
            <div>
              <label className={C.label}>Greeting Gender <span className="text-red-500">*</span></label>
              <p className="text-gray-400 text-xs font-mono mb-2">Who recorded this greeting? Male greetings play for women callers; female greetings play for men callers.</p>
              <div className="flex gap-3">
                <label data-testid="radio-gender-male" className={`flex-1 flex items-center gap-2.5 border rounded-lg p-3 cursor-pointer transition-colors ${gender === "male" ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                  <input type="radio" name="gender" value="male" checked={gender === "male"} onChange={() => setGender("male")} className="accent-blue-500" />
                  <span className="text-gray-800 font-mono text-sm font-medium">Male</span>
                  <span className="text-gray-400 font-mono text-xs ml-auto">Women hear this</span>
                </label>
                <label data-testid="radio-gender-female" className={`flex-1 flex items-center gap-2.5 border rounded-lg p-3 cursor-pointer transition-colors ${gender === "female" ? "border-pink-400 bg-pink-50" : "border-gray-200 hover:border-gray-300"}`}>
                  <input type="radio" name="gender" value="female" checked={gender === "female"} onChange={() => setGender("female")} className="accent-pink-500" />
                  <span className="text-gray-800 font-mono text-sm font-medium">Female</span>
                  <span className="text-gray-400 font-mono text-xs ml-auto">Men hear this</span>
                </label>
              </div>
            </div>
          )}

          <div>
            <label className={C.label}>MP3 Audio File</label>
            <div
              data-testid="dropzone-audio"
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`w-full border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${dragOver ? "border-[#f5a623] bg-amber-50" : file ? "border-gray-300 bg-gray-50" : "border-gray-200 hover:border-[#f5a623]/60 hover:bg-amber-50/30"}`}
            >
              <input ref={fileInputRef} type="file" accept=".mp3,audio/mpeg" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} data-testid="input-file-upload" />
              {file ? (
                <div className="space-y-1">
                  <div className="text-gray-800 font-mono text-sm">{file.name}</div>
                  <div className="text-gray-400 font-mono text-xs">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload size={22} className="mx-auto text-gray-400" />
                  <div className="text-gray-400 font-mono text-xs">Drop MP3 here or click to browse</div>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button data-testid="btn-cancel-upload" onClick={onClose} className={C.btnSecondary + " flex-1 justify-center py-2.5"}>Cancel</button>
            <button data-testid="btn-submit-upload" onClick={() => uploadMutation.mutate()} disabled={isSubmitDisabled} className={C.btnPrimary + " flex-1 justify-center py-2.5"}>
              {uploadMutation.isPending ? "Uploading..." : "Upload & Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── RegionDialog ──────────────────────────────────────────────────────────────
function RegionDialog({ region, onClose }: { region?: Region; onClose: () => void }) {
  const { toast } = useToast();
  const isEdit = !!region;
  const [name, setName] = useState(region?.name ?? "");
  const [slug, setSlug] = useState(region?.slug ?? "");
  const [stateAbbreviation, setStateAbbreviation] = useState(region?.stateAbbreviation ?? "");
  const [phoneNumber, setPhoneNumber] = useState(region?.phoneNumber ?? "");
  const [timezone, setTimezone] = useState(region?.timezone ?? "America/New_York");
  const [description, setDescription] = useState(region?.description ?? "");
  const [isActive, setIsActive] = useState(region?.isActive ?? true);
  const [linkedRegionIds, setLinkedRegionIds] = useState<string[]>(region?.linkedRegionIds ?? []);
  const [defaultZipCode, setDefaultZipCode] = useState<string>(region?.defaultZipCode ?? "");

  const { data: allRegions } = useQuery<Region[]>({ queryKey: ["/api/regions"] });
  const otherRegions = (allRegions ?? []).filter(r => r.id !== region?.id);

  function handleNameChange(val: string) {
    setName(val);
    if (!isEdit) setSlug(val.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = { name: name.trim(), slug: slug.trim(), stateAbbreviation: stateAbbreviation.trim() || null, phoneNumber: phoneNumber.trim(), timezone: timezone.trim(), description: description.trim() || null, isActive, linkedRegionIds, defaultZipCode: defaultZipCode.trim() || null };
      if (isEdit) return apiRequest("PUT", `/api/regions/${region.id}`, body);
      return apiRequest("POST", `/api/regions`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/regions"] });
      toast({ title: isEdit ? "Region updated" : "Region created", description: `${name} (${slug})` });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save region", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-xl border border-gray-200 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <button data-testid="btn-close-region-dialog" onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition-colors">
          <X size={18} />
        </button>
        <h2 className="text-gray-900 font-mono text-base font-bold mb-1 tracking-widest uppercase">
          {isEdit ? "Edit Region" : "Add Region"}
        </h2>
        <p className="text-gray-500 text-xs font-mono mb-6">
          {isEdit ? "Update regional market settings" : "Create a new regional phone market"}
        </p>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={C.label}>Market Name</label>
              <input data-testid="input-region-name" type="text" value={name} onChange={e => handleNameChange(e.target.value)} placeholder="Denver" className={C.input} />
            </div>
            <div>
              <label className={C.label}>State / Region Group</label>
              <input data-testid="input-region-state" type="text" value={stateAbbreviation} onChange={e => setStateAbbreviation(e.target.value.toUpperCase())} placeholder="CO" className={C.input + " uppercase"} />
            </div>
          </div>
          <div>
            <label className={C.label}>URL Slug</label>
            <input data-testid="input-region-slug" type="text" value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="denver" className={C.input} />
          </div>
          <div>
            <label className={C.label}>Phone Number</label>
            <input data-testid="input-region-phone" type="tel" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="+1 303 555 0123" className={C.input} />
          </div>
          <div>
            <label className={C.label}>Default Zip Code</label>
            <input data-testid="input-region-default-zip" type="text" inputMode="numeric" maxLength={5} value={defaultZipCode} onChange={e => setDefaultZipCode(e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="e.g. 80202" className={C.input} />
            <p className="text-gray-400 font-mono text-xs mt-1.5">Used for proximity sorting when a caller hasn't provided their own zip code.</p>
          </div>
          <div>
            <label className={C.label}>Timezone</label>
            <input data-testid="input-region-timezone" type="text" value={timezone} onChange={e => setTimezone(e.target.value)} placeholder="America/Denver" className={C.input} />
          </div>
          <div>
            <label className={C.label}>Description</label>
            <input data-testid="input-region-description" type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Colorado Rocky Mountains region" className={C.input} />
          </div>
          <div>
            <label className={C.label}>Linked Nearby Regions</label>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
              {otherRegions.length === 0 ? (
                <div className="px-3 py-2 text-gray-400 font-mono text-xs">No other regions available</div>
              ) : otherRegions.map(r => {
                const checked = linkedRegionIds.includes(r.id);
                return (
                  <button
                    key={r.id}
                    data-testid={`toggle-linked-region-${r.id}`}
                    type="button"
                    onClick={() => setLinkedRegionIds(prev => checked ? prev.filter(id => id !== r.id) : [...prev, r.id])}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${checked ? "bg-amber-50" : "bg-white hover:bg-gray-50"}`}
                  >
                    <span className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${checked ? "bg-[#f5a623] border-[#f5a623]" : "border-gray-300"}`}>
                      {checked && <span className="block w-2 h-2 bg-white rounded-sm" />}
                    </span>
                    <span className="flex-1 font-mono text-xs text-gray-800 font-semibold">{r.name}</span>
                    <span className="font-mono text-xs text-gray-400">{r.phoneNumber}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-gray-400 font-mono text-xs mt-1.5">
              Select all nearby cities to link together. Callers will hear "new caller from [city]" when someone joins a linked region, and "new caller close to you" for their own region.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              data-testid="toggle-region-active"
              type="button"
              onClick={() => setIsActive(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isActive ? "bg-emerald-500" : "bg-gray-200"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isActive ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <span className="text-gray-600 font-mono text-xs tracking-widest uppercase">{isActive ? "Active" : "Inactive"}</span>
          </div>
          {slug && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-gray-400 font-mono text-xs tracking-widest uppercase mb-1">Webhook URL</div>
              <div className="text-[#f5a623] font-mono text-xs break-all">/voice/{slug}</div>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button data-testid="btn-cancel-region" onClick={onClose} className={C.btnSecondary + " flex-1 justify-center py-2.5"}>Cancel</button>
            <button
              data-testid="btn-save-region"
              onClick={() => saveMutation.mutate()}
              disabled={!name.trim() || !slug.trim() || !phoneNumber.trim() || saveMutation.isPending}
              className={C.btnPrimary + " flex-1 justify-center py-2.5"}
            >
              {saveMutation.isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Region"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── RegionsTab ────────────────────────────────────────────────────────────────
const REGIONS_PAGE_SIZE = 50;

function RegionsTab() {
  const { toast } = useToast();
  const [dialog, setDialog] = useState<"add" | Region | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const { data: regions, isLoading } = useQuery<Region[]>({
    queryKey: ["/api/regions"],
    refetchInterval: 10000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/regions/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/regions"] }); toast({ title: "Region deleted" }); },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async (region: Region) => apiRequest("PUT", `/api/regions/${region.id}`, { isActive: !region.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/regions"] }),
    onError: () => toast({ title: "Failed to update region", variant: "destructive" }),
  });

  const rebuildSeoMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/rebuild-seo-pages"),
    onSuccess: (data: any) => toast({ title: "SEO pages rebuilt", description: `${data?.pagesBuilt ?? 0} page(s) generated + sitemap updated` }),
    onError: () => toast({ title: "Failed to rebuild SEO pages", variant: "destructive" }),
  });

  function copyWebhook(slug: string) { navigator.clipboard.writeText(`${origin}/voice/${slug}`); toast({ title: "Webhook URL copied" }); }
  function copyPhone(phone: string) { navigator.clipboard.writeText(phone); toast({ title: "Phone number copied" }); }

  const q = search.trim().toLowerCase();
  const filtered = (regions ?? []).filter(r =>
    !q ||
    r.name.toLowerCase().includes(q) ||
    (r.stateAbbreviation ?? "").toLowerCase().includes(q) ||
    r.slug.toLowerCase().includes(q) ||
    r.phoneNumber.includes(q)
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / REGIONS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * REGIONS_PAGE_SIZE, safePage * REGIONS_PAGE_SIZE);

  function handleSearch(val: string) { setSearch(val); setPage(1); }

  return (
    <div className="space-y-4">
      {dialog === "add" && <RegionDialog onClose={() => setDialog(null)} />}
      {dialog && dialog !== "add" && <RegionDialog region={dialog as Region} onClose={() => setDialog(null)} />}

      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            data-testid="input-region-search"
            type="text"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search name, state, slug, phone..."
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-[#f5a623]/30 focus:border-[#f5a623]"
          />
        </div>
        {regions && (
          <span className="text-gray-400 font-mono text-xs">
            {filtered.length} of {regions.length} region{regions.length !== 1 ? "s" : ""}
          </span>
        )}
        <button
          data-testid="btn-rebuild-seo-pages"
          onClick={() => rebuildSeoMutation.mutate()}
          disabled={rebuildSeoMutation.isPending}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors text-xs font-semibold font-mono disabled:opacity-50"
          title="Rebuild all SEO landing pages and sitemap"
        >
          <Globe size={12} />
          {rebuildSeoMutation.isPending ? "Building..." : "Rebuild SEO Pages"}
        </button>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-gray-400 font-mono text-xs tracking-widest">LOADING REGIONS...</div>
      ) : !regions || regions.length === 0 ? (
        <div className="py-20 text-center">
          <MapPin size={32} className="mx-auto text-gray-300 mb-4" />
          <div className="text-gray-400 font-mono text-xs tracking-widest">NO REGIONS CONFIGURED — ADD ONE TO BEGIN</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-gray-400 font-mono text-xs tracking-widest">NO REGIONS MATCH YOUR SEARCH</div>
      ) : (
        <>
          {/* Table */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2.5 text-left text-gray-500 tracking-widest uppercase font-semibold w-14">State</th>
                    <th className="px-3 py-2.5 text-left text-gray-500 tracking-widest uppercase font-semibold">Name</th>
                    <th className="px-3 py-2.5 text-left text-gray-500 tracking-widest uppercase font-semibold hidden md:table-cell">Phone</th>
                    <th className="px-3 py-2.5 text-left text-gray-500 tracking-widest uppercase font-semibold hidden lg:table-cell">Timezone</th>
                    <th className="px-3 py-2.5 text-center text-gray-500 tracking-widest uppercase font-semibold hidden sm:table-cell w-16">Live</th>
                    <th className="px-3 py-2.5 text-center text-gray-500 tracking-widest uppercase font-semibold hidden sm:table-cell w-16">Profiles</th>
                    <th className="px-3 py-2.5 text-center text-gray-500 tracking-widest uppercase font-semibold hidden sm:table-cell w-16">Msgs</th>
                    <th className="px-3 py-2.5 text-center text-gray-500 tracking-widest uppercase font-semibold w-20">Status</th>
                    <th className="px-3 py-2.5 text-right text-gray-500 tracking-widest uppercase font-semibold w-32">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginated.map(region => (
                    <tr key={region.id} data-testid={`row-region-${region.id}`} className="bg-white hover:bg-amber-50/30 transition-colors group">
                      <td className="px-3 py-2.5">
                        {region.stateAbbreviation ? (
                          <span className="inline-block bg-amber-50 border border-amber-200 text-amber-700 font-bold rounded px-1.5 py-0.5 tracking-widest uppercase text-[11px]">
                            {region.stateAbbreviation}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-gray-900 font-bold tracking-wide">{region.name}</div>
                        <div className="text-gray-400 text-[10px] tracking-widest">{region.slug}</div>
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <span data-testid={`text-phone-${region.id}`}>{region.phoneNumber}</span>
                          <button data-testid={`btn-copy-phone-${region.id}`} onClick={() => copyPhone(region.phoneNumber)} className="text-gray-300 hover:text-[#f5a623] transition-colors opacity-0 group-hover:opacity-100">
                            <Copy size={10} />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 hidden lg:table-cell text-gray-400">{region.timezone}</td>
                      <td className="px-3 py-2.5 hidden sm:table-cell text-center text-gray-700 font-bold">{region.activeCalls}</td>
                      <td className="px-3 py-2.5 hidden sm:table-cell text-center text-gray-700">{region.voiceProfiles}</td>
                      <td className="px-3 py-2.5 hidden sm:table-cell text-center text-gray-700">{region.messagesRelayed}</td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          data-testid={`btn-toggle-region-${region.id}`}
                          onClick={() => toggleMutation.mutate(region)}
                          disabled={toggleMutation.isPending}
                          title={region.isActive ? "Deactivate" : "Activate"}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-semibold text-[10px] tracking-widest transition-colors disabled:opacity-50"
                          style={region.isActive
                            ? { background: "#ecfdf5", borderColor: "#a7f3d0", color: "#059669" }
                            : { background: "#f9fafb", borderColor: "#e5e7eb", color: "#9ca3af" }}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${region.isActive ? "bg-emerald-500" : "bg-gray-300"}`} />
                          {region.isActive ? "Active" : "Off"}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button data-testid={`btn-copy-webhook-${region.id}`} onClick={() => copyWebhook(region.slug)} title="Copy webhook URL" className="p-1 text-gray-300 hover:text-[#f5a623] transition-colors">
                            <Copy size={12} />
                          </button>
                          <button data-testid={`btn-edit-region-${region.id}`} onClick={() => setDialog(region)} className="p-1 text-gray-400 hover:text-[#f5a623] transition-colors">
                            <Pencil size={12} />
                          </button>
                          <button data-testid={`btn-delete-region-${region.id}`} onClick={() => { if (confirm(`Delete region "${region.name}"?`)) deleteMutation.mutate(region.id); }} disabled={deleteMutation.isPending} className="p-1 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-gray-400 font-mono text-xs">
                Page {safePage} of {totalPages} · {filtered.length} regions
              </span>
              <div className="flex items-center gap-1">
                <button
                  data-testid="btn-region-prev"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="px-2.5 py-1.5 text-xs font-mono border border-gray-200 rounded-lg text-gray-500 hover:border-[#f5a623] hover:text-[#f5a623] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Prev
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(safePage - 2, totalPages - 4));
                  const p = start + i;
                  return (
                    <button
                      key={p}
                      data-testid={`btn-region-page-${p}`}
                      onClick={() => setPage(p)}
                      className={`w-8 h-7 text-xs font-mono rounded-lg border transition-colors ${p === safePage ? "bg-[#f5a623] border-[#f5a623] text-white font-bold" : "border-gray-200 text-gray-500 hover:border-[#f5a623] hover:text-[#f5a623]"}`}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  data-testid="btn-region-next"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="px-2.5 py-1.5 text-xs font-mono border border-gray-200 rounded-lg text-gray-500 hover:border-[#f5a623] hover:text-[#f5a623] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const SEEDED_PREFIX = "+1720111";

// ── VoiceProfilesTab ──────────────────────────────────────────────────────────
function VoiceProfilesTab() {
  const { toast } = useToast();
  const [showUpload, setShowUpload] = useState(false);
  const [profileView, setProfileView] = useState<"all" | "real" | "seeded">("real");

  const { data: profiles, isLoading } = useQuery<ProfileWithUser[]>({ queryKey: ["/api/admin/profiles"] });
  const { data: liveData } = useQuery<{ liveUserIds: string[] }>({ queryKey: ["/api/admin/simulator/live"], refetchInterval: 5000 });
  const liveSet = new Set(liveData?.liveUserIds ?? []);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/profiles/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/profiles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Profile deleted" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const allProfiles = profiles ?? [];
  const visibleProfiles = profileView === "seeded"
    ? allProfiles.filter(p => p.phoneNumber.startsWith(SEEDED_PREFIX))
    : profileView === "real"
      ? allProfiles.filter(p => !p.phoneNumber.startsWith(SEEDED_PREFIX))
      : allProfiles;

  const realCount   = allProfiles.filter(p => !p.phoneNumber.startsWith(SEEDED_PREFIX)).length;
  const seededCount = allProfiles.filter(p =>  p.phoneNumber.startsWith(SEEDED_PREFIX)).length;

  return (
    <div className="space-y-4">
      {showUpload && <UploadDialog onClose={() => setShowUpload(false)} />}

      {/* View toggle */}
      <div className="flex items-center gap-1.5">
        {([
          { id: "real",   label: "Real Callers",    count: realCount },
          { id: "seeded", label: "Seeded Profiles",  count: seededCount },
          { id: "all",    label: "All",              count: allProfiles.length },
        ] as const).map(opt => (
          <button
            key={opt.id}
            data-testid={`btn-profile-view-${opt.id}`}
            onClick={() => setProfileView(opt.id)}
            className={`px-3 py-1.5 rounded font-mono text-xs tracking-widest uppercase transition-colors border ${
              profileView === opt.id
                ? "bg-[#f5a623] border-[#f5a623] text-black font-bold"
                : "border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-300 bg-white"
            }`}
          >
            {opt.label}
            <span className="ml-1.5 opacity-70">({opt.count})</span>
          </button>
        ))}
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className={C.th}>Phone</th>
              <th className={C.th}>System</th>
              <th className={C.th}>Audio</th>
              <th className={C.th}>Duration</th>
              <th className={C.th}>Status</th>
              <th className={C.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 font-mono text-xs tracking-widest">LOADING PROFILES...</td></tr>
            ) : visibleProfiles.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 font-mono text-xs tracking-widest">
                {allProfiles.length === 0 ? "NO PROFILES FOUND — UPLOAD ONE TO BEGIN" : "NO PROFILES IN THIS VIEW"}
              </td></tr>
            ) : (
              visibleProfiles.map(profile => {
                const cat = profile.siteCategory ?? "MM";
                const isMW = cat === "MW";
                const isSeeded = profile.phoneNumber.startsWith(SEEDED_PREFIX);
                return (
                  <tr key={profile.id} data-testid={`row-profile-${profile.id}`} className={C.row}>
                    <td className={C.td}>
                      <div className="flex items-center gap-2">
                        <Phone size={12} className="text-gray-400" />
                        <span data-testid={`text-phone-${profile.id}`} className="text-gray-800 font-mono text-sm">{profile.phoneNumber}</span>
                        {isSeeded && (
                          <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-600 leading-none">SEED</span>
                        )}
                      </div>
                    </td>
                    <td className={C.td}>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span data-testid={`badge-system-${profile.id}`} className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${isMW ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                          {cat}
                        </span>
                        {isMW && profile.gender && (
                          <span data-testid={`badge-gender-${profile.id}`} className={`text-xs font-mono px-1.5 py-0.5 rounded border ${profile.gender === "female" ? "border-pink-200 bg-pink-50 text-pink-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}>
                            {profile.gender === "female" ? "♀ Female" : "♂ Male"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={C.td}><AudioPlayer src={profile.recordingUrl} /></td>
                    <td className={C.td}><span className="text-gray-500 font-mono text-xs">{profile.recordingDuration != null ? `${profile.recordingDuration}s` : "—"}</span></td>
                    <td className={C.td}>
                      <span className={`${C.badge} ${liveSet.has(profile.userId) ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-gray-50 text-gray-400"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${liveSet.has(profile.userId) ? "bg-emerald-500 animate-pulse" : "bg-gray-300"}`} />
                        {liveSet.has(profile.userId) ? "Live" : "Offline"}
                      </span>
                    </td>
                    <td className={C.td}>
                      <button data-testid={`btn-delete-profile-${profile.id}`} onClick={() => { if (confirm(`Delete profile for ${profile.phoneNumber}?`)) deleteMutation.mutate(profile.id); }} disabled={deleteMutation.isPending} className={C.btnDanger}>
                        <Trash2 size={12} /> Delete
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {!isLoading && allProfiles.length > 0 && (
        <div className="text-gray-400 font-mono text-xs">{visibleProfiles.length} of {allProfiles.length} profile{allProfiles.length !== 1 ? "s" : ""}</div>
      )}
    </div>
  );
}

// ── SYSTEM_PROMPTS list ───────────────────────────────────────────────────────
// Ordered to follow the actual MM (no-mailbox) IVR call flow.
// Texts match the exact fallback strings used in ivr-no-mailbox.ts playPrompt() calls.
// group values map to the GROUP_TABS filter chips below.
const SYSTEM_PROMPTS: { filename: string; label: string; text: string; group: string }[] = [

  // ── 1. CALL ENTRY — very first things a caller hears ──────────────────────
  { group: "entry", filename: "system_greeting.mp3",    label: "System Greeting",          text: "Welcome to the Male Box. this service assumes no responsibility for personal meetings." },
  { group: "entry", filename: "disclaimer.mp3",         label: "Legal Disclaimer",          text: "" },
  { group: "entry", filename: "motd.mp3",               label: "MOTD / Announcement (Entry)", text: "" },
  { group: "entry", filename: "no_caller_id.mp3",       label: "No Caller ID",              text: "We could not identify your call. Goodbye." },
  { group: "entry", filename: "region_not_active.mp3",  label: "Region Not Active",         text: "This phone number is not currently active. Please try again later." },
  { group: "entry", filename: "region_unavailable.mp3", label: "Region Unavailable",        text: "This market is temporarily unavailable. Please try again later." },
  { group: "entry", filename: "caller_blocked.mp3",     label: "Caller Blocked — Announcement", text: "Caller blocked. You will no longer hear this caller's profile." },
  { group: "entry", filename: "error_generic.mp3",      label: "Generic Error",             text: "An error occurred. Please try again later." },
  { group: "entry", filename: "invalid_choice.mp3",     label: "Invalid Choice",            text: "Invalid choice." },
  { group: "entry", filename: "goodbye.mp3",            label: "Goodbye",                   text: "Thank you for calling. Goodbye." },

  // ── 2. MEMBERSHIP GATEWAY — card entry & verification ─────────────────────
  { group: "membership", filename: "membership_entry_prompt.mp3", label: "Card Entry Prompt",          text: "If you have a membership card, enter your card number now. Otherwise press the pound key." },
  { group: "membership", filename: "link_code_invalid.mp3",       label: "Link Code Invalid",          text: "That code is invalid or has expired. Please generate a new code from your web account and try again." },
  { group: "membership", filename: "membership_invalid.mp3",      label: "Card / Membership Invalid",  text: "We could not find a card with that number. Please check your card and try again." },
  { group: "membership", filename: "membership_linked.mp3",       label: "Card Accepted / Verified",   text: "Card accepted." },
  { group: "membership", filename: "access_expired.mp3",          label: "Access / Time Expired",      text: "Your access has expired." },
  { group: "membership", filename: "free_mode_announcement.mp3",  label: "Free Mode Announcement",     text: "Great news! All calls are completely free right now. No membership required. Enjoy unlimited time on the system. Connecting you now." },
  { group: "membership", filename: "free_trial_offer.mp3",        label: "Free Trial Offer",           text: "We would like to offer you a free trial. To get your free trial now press 1. To get your free trial later press the pound key." },
  { group: "membership", filename: "free_trial_terms.mp3",        label: "Free Trial Terms",           text: "Your free trial will expire in seven days and it must be used from this phone number." },

  // ── 3. NEW CALLER ONBOARDING — recording name & greeting ─────────────────
  { group: "onboarding", filename: "phone_booth_welcome.mp3",      label: "Male Box — Welcome",                    text: "Welcome to the live connector. Greetings from all the local guys here right now. Swap private messages and then connect live for a totally private conversation. You can leave the connector anytime you want by pressing the pound sign." },
  { group: "onboarding", filename: "motd_phone_booth.mp3",         label: "MOTD — Male Box Announcement",          text: "" },
  { group: "onboarding", filename: "welcome_record_name.mp3",      label: "Record Your Name — Prompt",             text: "You need to record a greeting to introduce yourself to the other guys first. Let's record the name you want to use. After the tone, record just your first name." },
  { group: "onboarding", filename: "name_retry.mp3",               label: "Name Not Detected — Retry",             text: "We didn't catch your name. Please try again." },
  { group: "onboarding", filename: "name_saved_record_greeting.mp3", label: "Name Saved — Record Greeting Now",    text: "Great. Now record your greeting for other callers. After the tone, press any key when done." },
  { group: "onboarding", filename: "greeting_error.mp3",           label: "Greeting Too Short — Try Again",        text: "That greeting was too short. Please try again after the tone. Press any key when done." },
  { group: "onboarding", filename: "greeting_setup.mp3",           label: "Returning Caller — Greeting Options",   text: "Your last greeting you recorded is still available. To use it again, press 1. To record a new greeting, press 2. To hear your greeting, press 3. To repeat these choices, press 9. To continue, press pound." },
  { group: "onboarding", filename: "review_greeting.mp3",          label: "Review Your New Greeting",              text: "To hear your greeting, press 1. To re-record, press 2. To accept and continue, press 3. To repeat these choices, press 9." },
  { group: "onboarding", filename: "no_greeting_found.mp3",        label: "No Greeting Found",                     text: "No greeting found." },
  { group: "onboarding", filename: "profile_saved.mp3",            label: "Greeting Saved — Confirmed",            text: "Your greeting has been saved." },
  { group: "onboarding", filename: "profile_save_error.mp3",       label: "Greeting Save Error",                   text: "We could not save your profile. Please try again." },
  { group: "onboarding", filename: "recording_rejected_unclear.mp3",      label: "Auto-Mod Rejected — Unclear Recording",       text: "We need you to re-record your greeting. We couldn't understand what you said. Please speak clearly into the phone so everyone can hear what you have to say about yourself and what you're looking for. Be sure to turn down any loud music or the television before you record. To re-record, press 1." },
  { group: "onboarding", filename: "recording_rejected_phone_number.mp3", label: "Auto-Mod Rejected — Phone Number Detected",   text: "We need you to re-record your greeting. Phone numbers are not allowed in your greeting and it will not be approved if it contains one. To re-record, press 1." },
  { group: "onboarding", filename: "zip_code_prompt.mp3",          label: "Zip Code — Enter for Nearby Sort",      text: "Optional: enter your 5-digit zip code and we'll play callers closest to you first. Press pound to skip." },
  { group: "onboarding", filename: "zip_code_saved.mp3",           label: "Zip Code — Saved",                      text: "Got it. We'll use your zip code to show you nearby callers." },

  // ── 4. MAIN MENU — MM system menu (no-mailbox variant) ────────────────────
  { group: "menu", filename: "main_menu.mp3",      label: "Main Menu",                         text: "Main menu. To enter the male box press star. To add time or purchase a membership press 2. For information on membership prices press 4. To manage your membership press 8. For customer service press 0. To repeat these choices press 9." },
  { group: "menu", filename: "motd_main_menu.mp3", label: "MOTD — Main Menu Announcement",     text: "" },
  { group: "menu", filename: "trial_warning.mp3",  label: "Trial Time Running Low — Warning",  text: "You have less than 15 minutes remaining in your free trial. Stay connected by joining now. You won't be interrupted by ads. Access member only features like off-line messaging, connect live for one on one chat. To join right now press 1. To continue press pound." },
  { group: "menu", filename: "member_warning.mp3", label: "Membership Time Running Low",       text: "You have less than 15 minutes remaining in your membership. To renew now press 1. To continue press pound." },
  { group: "menu", filename: "no_profiles.mp3",    label: "No Profiles Available",             text: "There are no profiles available right now. Please call back later." },

  // ── 5. INFO / PRICING / MEMBERSHIP PURCHASE ───────────────────────────────
  { group: "billing", filename: "info_menu.mp3",                   label: "Info & Membership Menu",          text: "Information, prices, and membership. Press 1 for membership questions. Press 9 to return to the main menu." },
  { group: "billing", filename: "membership_questions.mp3",        label: "Membership Questions Menu",       text: "Membership questions. Press 1 to learn how membership works. Press 2 to hear our pricing. Press 3 to purchase a membership with a credit card. Press 9 to return to the main menu." },
  { group: "billing", filename: "membership_how_it_works.mp3",     label: "How Membership Works",            text: "Here is how membership works. As a member, you get full access to the voice line community. Members can browse unlimited caller profiles, send and receive voice messages, and enjoy priority access to new features. We offer three membership options: a 24 hour pass, a 14 day membership, and a 30 day membership. Your remaining time is tracked in hours. When you have less than 60 minutes left, the system will tell you in minutes. Choose the option that works best for you." },
  { group: "billing", filename: "membership_pricing.mp3",          label: "Membership Pricing",              text: "Here are our membership prices. A 24 hour pass is 3 dollars. A 14 day membership is 10 dollars. A 30 day membership is 25 dollars. To purchase, press 3 from the membership menu." },
  { group: "billing", filename: "purchase_pre_menu.mp3",           label: "Purchase Menu — Package Selection", text: "If you have a promotional code press 1. To purchase 1 day of access for $3.99 press 2. To repeat these choices press 9. To cancel press pound." },
  { group: "billing", filename: "payment_intro.mp3",               label: "Payment Intro — Billing Disclosure", text: "Your purchase, plus any applicable fees and taxes, will appear on your credit card statement as Toby Media. When entering your card information: to correct an incorrect number, press star to delete the last digit entered. To start over, press the star key twice. If you're ready to enter your credit card information press 1." },
  { group: "billing", filename: "package_confirm_prefix.mp3",      label: "Package Confirm — Prefix",        text: "You selected" },
  { group: "billing", filename: "package_confirm_bonus_prefix.mp3",label: "Package Confirm — Bonus Prefix",  text: "Great choice! You selected" },
  { group: "billing", filename: "package_confirm_suffix.mp3",      label: "Package Confirm — Suffix",        text: "If this is correct press one. To select a different package press two." },
  { group: "billing", filename: "package_cancelled.mp3",           label: "Package Cancelled",               text: "Cancelled. Returning to the main menu." },
  { group: "billing", filename: "package_invalid.mp3",             label: "Package Invalid Selection",       text: "Invalid selection." },
  { group: "billing", filename: "payment_session_expired.mp3",     label: "Payment Session Expired",         text: "Your session has expired. Please start again." },
  { group: "billing", filename: "payment_failed.mp3",              label: "Payment Failed",                  text: "Your payment could not be completed at this time. Please try again later." },
  { group: "billing", filename: "payment_declined.mp3",            label: "Payment Declined",                text: "Your card was declined. Please check your details and try again." },
  { group: "billing", filename: "payment_activation_error.mp3",    label: "Payment Activation Error",        text: "Your payment was received but there was an error activating your membership. Please contact customer support." },
  { group: "billing", filename: "payment_success_prefix.mp3",      label: "Payment Success — Prefix",        text: "Payment successful! You now have" },
  { group: "billing", filename: "payment_success_bonus.mp3",       label: "Payment Success — First Purchase Bonus", text: "Plus your first purchase bonus doubles your minutes!" },
  { group: "billing", filename: "payment_success_suffix.mp3",      label: "Payment Success — Suffix",        text: "Thank you for joining. Returning to the main menu." },
  { group: "billing", filename: "motd_post_purchase.mp3",          label: "MOTD — After Purchase Announcement", text: "" },
  { group: "billing", filename: "time_deduction_start.mp3",        label: "Time Deduction — Started",        text: "Time is now being deducted from your membership." },
  { group: "billing", filename: "time_deduction_stop.mp3",         label: "Time Deduction — Stopped",        text: "Time is no longer being deducted from your membership." },

  // ── 6. PROFILE BROWSING — hearing other callers' greetings ───────────────
  { group: "browsing", filename: "profile_options.mp3",           label: "Profile Options — After Hearing a Caller", text: "Press 1 to send this caller a message. Press 2 to skip to the next profile. Press 3 to connect live with this caller. Press 4 to block this caller. Press 5 to hear the previous profile. Press 6 to hear this caller's location. Press 7 to flag this profile for review. Press 9 to return to main menu." },
  { group: "browsing", filename: "new_caller_close_to_you.mp3",   label: "New Caller Alert — Close To You",           text: "New caller close to you." },
  { group: "browsing", filename: "new_caller_closest_to_you.mp3", label: "New Caller Alert — Closest To You",         text: "New caller closest to you." },
  { group: "browsing", filename: "nearby_callers_offer.mp3",      label: "Nearby Callers — Offer After All Heard",    text: "You've heard all the callers in your area. Press 1 to hear callers from nearby cities. Press 2 to start over from the beginning." },
  { group: "browsing", filename: "nearby_callers_intro.mp3",      label: "Nearby Callers — Now Playing Nearby",       text: "Now playing callers from nearby cities. Enjoy!" },
  { group: "browsing", filename: "nearby_callers_none.mp3",       label: "Nearby Callers — None Available",           text: "There are no callers online in nearby cities right now. Starting your area over." },
  { group: "browsing", filename: "no_previous_profile.mp3",       label: "No Previous Profile (Press 5)",             text: "There is no previous profile. Continuing to the next." },
  { group: "browsing", filename: "profile_flagged.mp3",           label: "Profile Flagged for Review",                text: "This profile has been flagged for review. Thank you." },

  // ── 7. MESSAGING — private voice messages ─────────────────────────────────
  { group: "messaging", filename: "message_options.mp3",    label: "Message Options — After Hearing a Message", text: "Press 1 to reply to this message. Press 2 to hear the sender's profile. Press 3 to continue browsing profiles. Press 4 to block this caller. Press 7 to flag this message for review. Press 9 to return to the main menu." },
  { group: "messaging", filename: "record_message.mp3",     label: "Record Message — Prompt",                   text: "Record your message after the tone. Press any key when done." },
  { group: "messaging", filename: "record_reply.mp3",       label: "Record Reply — Prompt",                     text: "Record your reply after the tone. Press any key when done." },
  { group: "messaging", filename: "review_your_message.mp3",label: "Review Recorded Message",                   text: "Here is your recorded message." },
  { group: "messaging", filename: "message_sent.mp3",       label: "Message Sent",                              text: "Your message has been sent. Returning to profiles." },
  { group: "messaging", filename: "message_send_error.mp3", label: "Message Send Error",                        text: "Failed to send your message. Returning to profiles." },
  { group: "messaging", filename: "message_cancelled.mp3",  label: "Message Cancelled",                         text: "Message cancelled." },
  { group: "messaging", filename: "message_flagged.mp3",    label: "Message Flagged for Review",                text: "This message has been flagged for review. Thank you." },
  { group: "messaging", filename: "no_recording.mp3",       label: "No Recording Detected",                     text: "No recording was detected." },

  // ── 8. LIVE 1-ON-1 CONNECT ────────────────────────────────────────────────
  { group: "live", filename: "live_connect_disclaimer.mp3", label: "Live Connect — Disclaimer (Initiator Hears First)", text: "Please be respectful and kind. You are about to request a live one on one connection." },
  { group: "live", filename: "live_connect_ringing.mp3",    label: "Live Connect — Ringing (Sound Effect)",             text: "" },
  { group: "live", filename: "live_connect_connecting.mp3", label: "Live Connect — Connecting Now",                     text: "Connecting you now. You can exit the live connection at any time by pressing pound. Enjoy!" },
  { group: "live", filename: "live_connect_chime.mp3",      label: "Live Connect — Incoming Chime (Sound Effect)",      text: "" },
  { group: "live", filename: "live_invite_options.mp3",     label: "Live Invite — Options (Invitee Hears)",             text: "To accept, press 1. To decline and hear the next caller's greeting, press 2. To hear this caller's greeting, press 3. To block this caller, press 4." },
  { group: "live", filename: "live_connect_ended.mp3",      label: "Live Connect — Call Ended",                         text: "Your live connection has ended. Returning you to the male box." },
  { group: "live", filename: "live_connect_failed.mp3",     label: "Live Connect — Failed to Connect",                  text: "We were unable to connect your call. Returning you to the male box." },
  { group: "live", filename: "live_connect_busy.mp3",       label: "Live Connect — Caller Already Connected",           text: "That caller is already connected with someone else. Please try again later." },
  { group: "live", filename: "live_connect_unavailable.mp3",label: "Live Connect — Caller Unavailable",                 text: "This caller is not available for a live connection." },
  { group: "live", filename: "live_connect_left_line.mp3",  label: "Live Connect — Caller Left the Line",               text: "Sorry, that caller has left the line." },
  { group: "live", filename: "live_connect_no_minutes.mp3", label: "Live Connect — Not Enough Minutes",                 text: "You need at least 5 minutes remaining on your membership to connect live. Please add more time and try again." },
  { group: "live", filename: "live_invite_expired.mp3",     label: "Live Invite — Expired",                             text: "That live connection invitation has expired. Returning to profiles." },

  // ── 9. NUMBERS & PHRASES — chained-audio building blocks ────────────────
  { group: "phrases", filename: "phrase_you_have.mp3", label: "Phrase — «You have»", text: "You have" },
  { group: "phrases", filename: "phrase_minutes_of_pbtr.mp3", label: "Phrase — «minutes remaining»", text: "minutes remaining." },
  { group: "phrases", filename: "phrase_minute_of_pbtr.mp3", label: "Phrase — «minute remaining»", text: "minute remaining." },
  { group: "phrases", filename: "phrase_there_are.mp3", label: "Phrase — «There are»", text: "There are" },
  { group: "phrases", filename: "phrase_there_is.mp3", label: "Phrase — «There is»", text: "There is" },
  { group: "phrases", filename: "phrase_callers_on_the_line.mp3", label: "Phrase — «guys on the line»", text: "guys on the line." },
  { group: "phrases", filename: "phrase_caller_on_the_line.mp3", label: "Phrase — «guy on the line»", text: "guy on the line." },
  { group: "phrases", filename: "num_0.mp3",  label: "Number — 0",   text: "zero" },
  { group: "phrases", filename: "num_1.mp3",  label: "Number — 1",   text: "one" },
  { group: "phrases", filename: "num_2.mp3",  label: "Number — 2",   text: "two" },
  { group: "phrases", filename: "num_3.mp3",  label: "Number — 3",   text: "three" },
  { group: "phrases", filename: "num_4.mp3",  label: "Number — 4",   text: "four" },
  { group: "phrases", filename: "num_5.mp3",  label: "Number — 5",   text: "five" },
  { group: "phrases", filename: "num_6.mp3",  label: "Number — 6",   text: "six" },
  { group: "phrases", filename: "num_7.mp3",  label: "Number — 7",   text: "seven" },
  { group: "phrases", filename: "num_8.mp3",  label: "Number — 8",   text: "eight" },
  { group: "phrases", filename: "num_9.mp3",  label: "Number — 9",   text: "nine" },
  { group: "phrases", filename: "num_10.mp3", label: "Number — 10",  text: "ten" },
  { group: "phrases", filename: "num_11.mp3", label: "Number — 11",  text: "eleven" },
  { group: "phrases", filename: "num_12.mp3", label: "Number — 12",  text: "twelve" },
  { group: "phrases", filename: "num_13.mp3", label: "Number — 13",  text: "thirteen" },
  { group: "phrases", filename: "num_14.mp3", label: "Number — 14",  text: "fourteen" },
  { group: "phrases", filename: "num_15.mp3", label: "Number — 15",  text: "fifteen" },
  { group: "phrases", filename: "num_16.mp3", label: "Number — 16",  text: "sixteen" },
  { group: "phrases", filename: "num_17.mp3", label: "Number — 17",  text: "seventeen" },
  { group: "phrases", filename: "num_18.mp3", label: "Number — 18",  text: "eighteen" },
  { group: "phrases", filename: "num_19.mp3", label: "Number — 19",  text: "nineteen" },
  { group: "phrases", filename: "num_20.mp3", label: "Number — 20",  text: "twenty" },
  { group: "phrases", filename: "num_21.mp3", label: "Number — 21",  text: "twenty-one" },
  { group: "phrases", filename: "num_22.mp3", label: "Number — 22",  text: "twenty-two" },
  { group: "phrases", filename: "num_23.mp3", label: "Number — 23",  text: "twenty-three" },
  { group: "phrases", filename: "num_24.mp3", label: "Number — 24",  text: "twenty-four" },
  { group: "phrases", filename: "num_25.mp3", label: "Number — 25",  text: "twenty-five" },
  { group: "phrases", filename: "num_26.mp3", label: "Number — 26",  text: "twenty-six" },
  { group: "phrases", filename: "num_27.mp3", label: "Number — 27",  text: "twenty-seven" },
  { group: "phrases", filename: "num_28.mp3", label: "Number — 28",  text: "twenty-eight" },
  { group: "phrases", filename: "num_29.mp3", label: "Number — 29",  text: "twenty-nine" },
  { group: "phrases", filename: "num_30.mp3", label: "Number — 30",  text: "thirty" },
  { group: "phrases", filename: "num_31.mp3", label: "Number — 31",  text: "thirty-one" },
  { group: "phrases", filename: "num_32.mp3", label: "Number — 32",  text: "thirty-two" },
  { group: "phrases", filename: "num_33.mp3", label: "Number — 33",  text: "thirty-three" },
  { group: "phrases", filename: "num_34.mp3", label: "Number — 34",  text: "thirty-four" },
  { group: "phrases", filename: "num_35.mp3", label: "Number — 35",  text: "thirty-five" },
  { group: "phrases", filename: "num_36.mp3", label: "Number — 36",  text: "thirty-six" },
  { group: "phrases", filename: "num_37.mp3", label: "Number — 37",  text: "thirty-seven" },
  { group: "phrases", filename: "num_38.mp3", label: "Number — 38",  text: "thirty-eight" },
  { group: "phrases", filename: "num_39.mp3", label: "Number — 39",  text: "thirty-nine" },
  { group: "phrases", filename: "num_40.mp3", label: "Number — 40",  text: "forty" },
  { group: "phrases", filename: "num_41.mp3", label: "Number — 41",  text: "forty-one" },
  { group: "phrases", filename: "num_42.mp3", label: "Number — 42",  text: "forty-two" },
  { group: "phrases", filename: "num_43.mp3", label: "Number — 43",  text: "forty-three" },
  { group: "phrases", filename: "num_44.mp3", label: "Number — 44",  text: "forty-four" },
  { group: "phrases", filename: "num_45.mp3", label: "Number — 45",  text: "forty-five" },
  { group: "phrases", filename: "num_46.mp3", label: "Number — 46",  text: "forty-six" },
  { group: "phrases", filename: "num_47.mp3", label: "Number — 47",  text: "forty-seven" },
  { group: "phrases", filename: "num_48.mp3", label: "Number — 48",  text: "forty-eight" },
  { group: "phrases", filename: "num_49.mp3", label: "Number — 49",  text: "forty-nine" },
  { group: "phrases", filename: "num_50.mp3", label: "Number — 50",  text: "fifty" },
  { group: "phrases", filename: "num_51.mp3", label: "Number — 51",  text: "fifty-one" },
  { group: "phrases", filename: "num_52.mp3", label: "Number — 52",  text: "fifty-two" },
  { group: "phrases", filename: "num_53.mp3", label: "Number — 53",  text: "fifty-three" },
  { group: "phrases", filename: "num_54.mp3", label: "Number — 54",  text: "fifty-four" },
  { group: "phrases", filename: "num_55.mp3", label: "Number — 55",  text: "fifty-five" },
  { group: "phrases", filename: "num_56.mp3", label: "Number — 56",  text: "fifty-six" },
  { group: "phrases", filename: "num_57.mp3", label: "Number — 57",  text: "fifty-seven" },
  { group: "phrases", filename: "num_58.mp3", label: "Number — 58",  text: "fifty-eight" },
  { group: "phrases", filename: "num_59.mp3", label: "Number — 59",  text: "fifty-nine" },
  { group: "phrases", filename: "num_60.mp3", label: "Number — 60",  text: "sixty" },
  { group: "phrases", filename: "num_61.mp3", label: "Number — 61",  text: "sixty-one" },
  { group: "phrases", filename: "num_62.mp3", label: "Number — 62",  text: "sixty-two" },
  { group: "phrases", filename: "num_63.mp3", label: "Number — 63",  text: "sixty-three" },
  { group: "phrases", filename: "num_64.mp3", label: "Number — 64",  text: "sixty-four" },
  { group: "phrases", filename: "num_65.mp3", label: "Number — 65",  text: "sixty-five" },
  { group: "phrases", filename: "num_66.mp3", label: "Number — 66",  text: "sixty-six" },
  { group: "phrases", filename: "num_67.mp3", label: "Number — 67",  text: "sixty-seven" },
  { group: "phrases", filename: "num_68.mp3", label: "Number — 68",  text: "sixty-eight" },
  { group: "phrases", filename: "num_69.mp3", label: "Number — 69",  text: "sixty-nine" },
  { group: "phrases", filename: "num_70.mp3", label: "Number — 70",  text: "seventy" },
  { group: "phrases", filename: "num_71.mp3", label: "Number — 71",  text: "seventy-one" },
  { group: "phrases", filename: "num_72.mp3", label: "Number — 72",  text: "seventy-two" },
  { group: "phrases", filename: "num_73.mp3", label: "Number — 73",  text: "seventy-three" },
  { group: "phrases", filename: "num_74.mp3", label: "Number — 74",  text: "seventy-four" },
  { group: "phrases", filename: "num_75.mp3", label: "Number — 75",  text: "seventy-five" },
  { group: "phrases", filename: "num_76.mp3", label: "Number — 76",  text: "seventy-six" },
  { group: "phrases", filename: "num_77.mp3", label: "Number — 77",  text: "seventy-seven" },
  { group: "phrases", filename: "num_78.mp3", label: "Number — 78",  text: "seventy-eight" },
  { group: "phrases", filename: "num_79.mp3", label: "Number — 79",  text: "seventy-nine" },
  { group: "phrases", filename: "num_80.mp3", label: "Number — 80",  text: "eighty" },
  { group: "phrases", filename: "num_81.mp3", label: "Number — 81",  text: "eighty-one" },
  { group: "phrases", filename: "num_82.mp3", label: "Number — 82",  text: "eighty-two" },
  { group: "phrases", filename: "num_83.mp3", label: "Number — 83",  text: "eighty-three" },
  { group: "phrases", filename: "num_84.mp3", label: "Number — 84",  text: "eighty-four" },
  { group: "phrases", filename: "num_85.mp3", label: "Number — 85",  text: "eighty-five" },
  { group: "phrases", filename: "num_86.mp3", label: "Number — 86",  text: "eighty-six" },
  { group: "phrases", filename: "num_87.mp3", label: "Number — 87",  text: "eighty-seven" },
  { group: "phrases", filename: "num_88.mp3", label: "Number — 88",  text: "eighty-eight" },
  { group: "phrases", filename: "num_89.mp3", label: "Number — 89",  text: "eighty-nine" },
  { group: "phrases", filename: "num_90.mp3", label: "Number — 90",  text: "ninety" },
  { group: "phrases", filename: "num_91.mp3", label: "Number — 91",  text: "ninety-one" },
  { group: "phrases", filename: "num_92.mp3", label: "Number — 92",  text: "ninety-two" },
  { group: "phrases", filename: "num_93.mp3", label: "Number — 93",  text: "ninety-three" },
  { group: "phrases", filename: "num_94.mp3", label: "Number — 94",  text: "ninety-four" },
  { group: "phrases", filename: "num_95.mp3", label: "Number — 95",  text: "ninety-five" },
  { group: "phrases", filename: "num_96.mp3", label: "Number — 96",  text: "ninety-six" },
  { group: "phrases", filename: "num_97.mp3", label: "Number — 97",  text: "ninety-seven" },
  { group: "phrases", filename: "num_98.mp3", label: "Number — 98",  text: "ninety-eight" },
  { group: "phrases", filename: "num_99.mp3", label: "Number — 99",  text: "ninety-nine" },
  { group: "phrases", filename: "num_100.mp3", label: "Number — 100", text: "one hundred" },
  { group: "phrases", filename: "num_200.mp3", label: "Number — 200", text: "two hundred" },
  { group: "phrases", filename: "num_300.mp3", label: "Number — 300", text: "three hundred" },
  { group: "phrases", filename: "num_400.mp3", label: "Number — 400", text: "four hundred" },
  { group: "phrases", filename: "num_500.mp3", label: "Number — 500", text: "five hundred" },
  { group: "phrases", filename: "num_600.mp3", label: "Number — 600", text: "six hundred" },
  { group: "phrases", filename: "num_700.mp3", label: "Number — 700", text: "seven hundred" },
  { group: "phrases", filename: "num_800.mp3", label: "Number — 800", text: "eight hundred" },
  { group: "phrases", filename: "num_900.mp3", label: "Number — 900", text: "nine hundred" },
];

// ── MW_SYSTEM_PROMPTS ─────────────────────────────────────────────────────────
// MW (Men/Women) variant — all prompts use the MW voice (ELEVENLABS_VOICE_ID_MW).
// Derived from SYSTEM_PROMPTS with gender-appropriate text overrides and MW-exclusive prompts.
const MW_SYSTEM_PROMPTS: typeof SYSTEM_PROMPTS = [
  // MW-exclusive: gender gate heard at the very start of every call
  { group: "entry", filename: "gender_select.mp3", label: "Gender Selection (MW Exclusive)", text: "Guys, press one to talk to women. Women, press two to talk to guys." },

  // All MM prompts in order, with MW-specific text overrides applied
  ...SYSTEM_PROMPTS.flatMap(p => {
    // Replace MM main menu with MW version (different menu structure — no mailbox option)
    if (p.filename === "main_menu.mp3") return [{ ...p, filename: "mw_main_menu.mp3", label: "MW Main Menu (MW Exclusive)", text: "Main menu. If you're ready to join the action press 1. To buy membership time press 2. To manage your membership press 8. For customer service press 0. To repeat these choices press 9." }];
    // Phone booth welcome — mentions women for male callers (most common caller on MW)
    if (p.filename === "phone_booth_welcome.mp3") return [{ ...p, label: "Live Connector — Welcome (Male Caller)", text: "Welcome to the live connector. Greetings from all the local women here right now. Swap private messages and then connect live for a totally private conversation. You can leave the connector anytime you want by pressing the pound sign." }];
    // Name recording prompt — mentions women for male callers
    if (p.filename === "welcome_record_name.mp3") return [{ ...p, label: "Record Your Name — Prompt (Male Caller)", text: "You need to record a greeting to introduce yourself to the women first. Let's record the name you want to use. After the tone, record just your first name." }];
    // Live connect ending — remove "male box" reference for MW
    if (p.filename === "live_connect_ended.mp3") return [{ ...p, text: "Your live connection has ended. Returning you to the live connector." }];
    if (p.filename === "live_connect_failed.mp3") return [{ ...p, text: "We were unable to connect your call. Returning you to the live connector." }];
    // Phrase fragments — gender-flipped for MW
    if (p.filename === "phrase_callers_on_the_line.mp3") return [{ ...p, label: "Phrase — «women on the line»", text: "women on the line." }];
    if (p.filename === "phrase_caller_on_the_line.mp3")  return [{ ...p, label: "Phrase — «woman on the line»", text: "woman on the line." }];
    return [p];
  }),

];


// ── MW_MALE_SYSTEM_PROMPTS ────────────────────────────────────────────────────
// MW Male Voice — played to female callers. Stored in uploads/mw_m/.
// Same structure as MW_SYSTEM_PROMPTS but with male-perspective overrides.
const MW_MALE_SYSTEM_PROMPTS: typeof SYSTEM_PROMPTS = [
  // Derived from SYSTEM_PROMPTS with male-voice overrides for female callers
  ...SYSTEM_PROMPTS.flatMap(p => {
    // Replace MM main menu with MW version
    if (p.filename === "main_menu.mp3") return [{ ...p, filename: "mw_main_menu.mp3", label: "MW Main Menu", text: "Main menu. If you're ready to join the action press 1. To buy membership time press 2. To manage your membership press 8. For customer service press 0. To repeat these choices press 9." }];
    // Phone booth welcome — mentions guys for female callers
    if (p.filename === "phone_booth_welcome.mp3") return [{ ...p, label: "Live Connector — Welcome (Female Caller)", text: "Welcome to the live connector. Greetings from all the local guys here right now. Swap private messages and then connect live for a totally private conversation. You can leave the connector anytime you want by pressing the pound sign." }];
    // Name recording prompt — mentions guys for female callers
    if (p.filename === "welcome_record_name.mp3") return [{ ...p, label: "Record Your Name — Prompt (Female Caller)", text: "You need to record a greeting to introduce yourself to the guys first. Let's record the name you want to use. After the tone, record just your first name." }];
    // Live connect ending — remove "male box" reference
    if (p.filename === "live_connect_ended.mp3") return [{ ...p, text: "Your live connection has ended. Returning you to the live connector." }];
    if (p.filename === "live_connect_failed.mp3") return [{ ...p, text: "We were unable to connect your call. Returning you to the live connector." }];
    // Phrase fragments — guys for female callers
    if (p.filename === "phrase_callers_on_the_line.mp3") return [{ ...p, label: "Phrase — «guys on the line»", text: "guys on the line." }];
    if (p.filename === "phrase_caller_on_the_line.mp3")  return [{ ...p, label: "Phrase — «guy on the line»",  text: "guy on the line." }];
    return [p];
  }),
];

// ── AutoResizeTextarea ────────────────────────────────────────────────────────
function AutoResizeTextarea({
  value,
  onChange,
  className,
  "data-testid": testId,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  "data-testid"?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      data-testid={testId}
      rows={1}
      className={className}
      style={{ overflow: "hidden", resize: "none" }}
    />
  );
}

// ── RogerSubTab ───────────────────────────────────────────────────────────────
interface RogerPromptEntry {
  id: string;
  category: string;
  tone: string;
  lineText: string;
  v3Text: string | null;
  usesV3: boolean;
  followUpAction: string | null;
  cooldownSeconds: number;
  requiredMoods: string[];
  minAttentionDrain: number;
  maxAttentionDrain: number;
  audioFilename: string | null;
  audioUrl: string | null;
}

const MOOD_COLORS: Record<string, string> = {
  normal:    "bg-blue-100 text-blue-700 border-blue-200",
  petty:     "bg-orange-100 text-orange-700 border-orange-200",
  activated: "bg-emerald-100 text-emerald-700 border-emerald-200",
  chaos:     "bg-purple-100 text-purple-700 border-purple-200",
  base:      "bg-gray-100 text-gray-600 border-gray-200",
};

const CATEGORY_COLORS: Record<string, string> = {
  picky:        "text-orange-600",
  idle:         "text-gray-500",
  flirty:       "text-pink-600",
  dominant:     "text-red-600",
  game_invite:  "text-indigo-600",
  reengagement: "text-blue-600",
  reward:       "text-emerald-600",
};

const ROGER_MODELS = [
  { id: "eleven_turbo_v2",       label: "Turbo v2",        note: "Fast · consistent · works with all voices" },
  { id: "eleven_turbo_v2_5",     label: "Turbo v2.5",      note: "Slightly more expressive turbo" },
  { id: "eleven_multilingual_v2",label: "Multilingual v2", note: "High quality · multi-language" },
  { id: "eleven_v3",             label: "v3 ✦",            note: "Emotional · requires v3-compatible voice" },
] as const;
type RogerModelId = typeof ROGER_MODELS[number]["id"];

function RogerSubTab() {
  const { toast } = useToast();
  const [moodFilter, setMoodFilter] = useState<"all" | "base" | "normal" | "petty" | "activated" | "chaos" | "v3">("all");
  const [searchText, setSearchText] = useState("");
  const [generating, setGenerating] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const bulkAbortRef = useRef(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [rogerModel, setRogerModel] = useState<RogerModelId>("eleven_turbo_v2");

  const { data: prompts = [], isLoading, refetch } = useQuery<RogerPromptEntry[]>({
    queryKey: ["/api/admin/roger/prompts"],
  });

  const { data: rogerVoice } = useQuery<{ voiceId: string; masked: string }>({
    queryKey: ["/api/admin/roger/voice"],
  });

  const generateMutation = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const res = await fetch("/api/admin/roger/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, text, model: rogerModel }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({ message: "Generation failed" })); throw new Error(err.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/roger/prompts"] });
      setGenerating(null);
    },
    onError: (err: Error) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
      setGenerating(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (filename: string) => {
      const res = await fetch(`/api/admin/tts/prompts/${encodeURIComponent(filename)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Delete failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/roger/prompts"] });
      toast({ title: "Audio file deleted" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  function handlePlay(entry: RogerPromptEntry) {
    if (!entry.audioUrl) return;
    if (playingId === entry.id) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(entry.audioUrl);
    audioRef.current = audio;
    setPlayingId(entry.id);
    audio.onended = () => { setPlayingId(null); audioRef.current = null; };
    audio.onerror = () => { setPlayingId(null); audioRef.current = null; };
    audio.play();
  }

  async function handleGenerateMissing() {
    if (bulkProgress) { bulkAbortRef.current = true; return; }
    const missing = prompts.filter(p => !p.audioUrl);
    if (missing.length === 0) { toast({ title: "All files already generated" }); return; }
    bulkAbortRef.current = false;
    setBulkProgress({ done: 0, total: missing.length, label: "" });
    let done = 0;
    for (const p of missing) {
      if (bulkAbortRef.current) break;
      setBulkProgress({ done, total: missing.length, label: p.id });
      setGenerating(p.id);
      try {
        const res = await fetch("/api/admin/roger/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: p.id, text: p.lineText, model: rogerModel }),
        });
        if (!res.ok) toast({ title: `Failed: ${p.id}`, variant: "destructive" });
      } catch { toast({ title: `Error: ${p.id}`, description: "Network error", variant: "destructive" }); }
      done++;
      // 30-second gap between requests to stay well within ElevenLabs rate limits
      if (!bulkAbortRef.current) await new Promise(r => setTimeout(r, 30000));
    }
    const cancelled = bulkAbortRef.current;
    setGenerating(null);
    setBulkProgress(null);
    bulkAbortRef.current = false;
    queryClient.invalidateQueries({ queryKey: ["/api/admin/roger/prompts"] });
    if (!cancelled) toast({ title: "Bulk generation complete", description: `${done} files generated.` });
  }

  const moodFilteredPrompts = prompts.filter(p => {
    if (moodFilter === "base")      return p.requiredMoods.length === 0;
    if (moodFilter === "v3")        return p.usesV3;
    if (moodFilter !== "all")       return p.requiredMoods.includes(moodFilter);
    return true;
  });

  const filtered = moodFilteredPrompts.filter(p =>
    !searchText ||
    p.id.toLowerCase().includes(searchText.toLowerCase()) ||
    p.lineText.toLowerCase().includes(searchText.toLowerCase()) ||
    (p.v3Text ?? "").toLowerCase().includes(searchText.toLowerCase()) ||
    p.category.toLowerCase().includes(searchText.toLowerCase())
  );

  const generated = prompts.filter(p => p.audioUrl).length;
  const v3Count   = prompts.filter(p => p.usesV3).length;

  const MOOD_TABS = [
    { id: "all",       label: "All",       count: prompts.length },
    { id: "base",      label: "Base",      count: prompts.filter(p => p.requiredMoods.length === 0).length },
    { id: "normal",    label: "Normal",    count: prompts.filter(p => p.requiredMoods.includes("normal")).length },
    { id: "petty",     label: "Petty",     count: prompts.filter(p => p.requiredMoods.includes("petty")).length },
    { id: "activated", label: "Activated", count: prompts.filter(p => p.requiredMoods.includes("activated")).length },
    { id: "chaos",     label: "Chaos",     count: prompts.filter(p => p.requiredMoods.includes("chaos")).length },
    { id: "v3",        label: "v3 ✦",      count: v3Count },
  ] as const;

  return (
    <div className="space-y-5">
      {/* Roger Voice + Model selector */}
      <div className="flex items-center gap-3 flex-wrap px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-amber-600 font-semibold">Voice ID:</span>
          <span className="text-amber-800" data-testid="text-roger-voice-id">
            {rogerVoice ? rogerVoice.masked : "Not configured"}
          </span>
          {rogerVoice && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-bold">ACTIVE</span>
          )}
        </div>
        <div className="h-4 w-px bg-amber-200" />
        <div className="flex items-center gap-1.5 text-xs font-mono">
          <span className="text-amber-600 font-semibold">Model:</span>
          <div className="flex items-center gap-1">
            {ROGER_MODELS.map(m => (
              <button
                key={m.id}
                data-testid={`btn-roger-model-${m.id}`}
                onClick={() => setRogerModel(m.id)}
                title={m.note}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition-colors ${
                  rogerModel === m.id
                    ? "bg-[#f5a623] border-[#f5a623] text-white"
                    : "bg-white border-gray-200 text-gray-500 hover:border-[#f5a623] hover:text-[#f5a623]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        {rogerModel === "eleven_v3" && (
          <div className="ml-auto flex items-center gap-1 text-[10px] font-mono text-violet-700 bg-violet-50 border border-violet-200 rounded px-2 py-0.5">
            <span className="font-bold">v3 ✦</span>
            <span>emotion-tagged text will be used where available</span>
          </div>
        )}
        {rogerModel !== "eleven_v3" && (
          <div className="ml-auto text-[10px] font-mono text-gray-400">
            Plain text only — emotion brackets will not be read aloud
          </div>
        )}
      </div>

      {/* Stats + bulk action */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-3">
          <div className={C.cardAlt + " py-2 px-3 flex flex-col items-center min-w-[80px]"}>
            <div className="font-mono text-xl font-bold text-gray-800">{prompts.length}</div>
            <div className={C.label}>Total</div>
          </div>
          <div className={C.cardAlt + " py-2 px-3 flex flex-col items-center min-w-[80px]"}>
            <div className="font-mono text-xl font-bold text-emerald-600">{generated}</div>
            <div className={C.label}>Generated</div>
          </div>
          <div className={C.cardAlt + " py-2 px-3 flex flex-col items-center min-w-[80px]"}>
            <div className="font-mono text-xl font-bold text-amber-600">{prompts.length - generated}</div>
            <div className={C.label}>Missing</div>
          </div>
          <div className={C.cardAlt + " py-2 px-3 flex flex-col items-center min-w-[80px] border-violet-200"}>
            <div className="font-mono text-xl font-bold text-violet-600">{v3Count}</div>
            <div className={C.label}>v3 ✦</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {bulkProgress && (
            <span className="text-xs font-mono text-gray-500">
              {bulkProgress.done}/{bulkProgress.total} — {bulkProgress.label}
            </span>
          )}
          <button
            data-testid="btn-roger-generate-missing"
            onClick={handleGenerateMissing}
            disabled={!!generating && !bulkProgress}
            className={bulkProgress ? C.btnDanger + " text-xs" : C.btnPrimary + " text-xs"}
          >
            {bulkProgress ? (
              <><Loader2 size={11} className="animate-spin" /> Cancel</>
            ) : (
              <><Wand2 size={11} /> Generate Missing ({prompts.length - generated})</>
            )}
          </button>
          <button
            data-testid="btn-roger-refresh"
            onClick={() => refetch()}
            className={C.btnGhost + " text-xs"}
            title="Refresh status"
          >
            <RefreshCw size={11} />
          </button>
        </div>
      </div>

      {/* Mood filter tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {MOOD_TABS.map(tab => (
          <button
            key={tab.id}
            data-testid={`btn-roger-mood-${tab.id}`}
            onClick={() => setMoodFilter(tab.id)}
            className={`px-3 py-1 rounded text-xs font-mono font-semibold border transition-colors ${
              moodFilter === tab.id
                ? "bg-[#f5a623] border-[#f5a623] text-white"
                : "bg-white border-gray-200 text-gray-500 hover:border-[#f5a623] hover:text-[#f5a623]"
            }`}
          >
            {tab.label}
            <span className="ml-1 opacity-60">({tab.count})</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5 bg-white border border-gray-200 rounded px-2 py-1">
          <Search size={11} className="text-gray-400" />
          <input
            data-testid="input-roger-search"
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Search prompts…"
            className="text-xs font-mono outline-none w-40 text-gray-700 placeholder-gray-400"
          />
        </div>
      </div>

      {/* Prompt table */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-8 justify-center text-gray-400 font-mono text-xs">
          <Loader2 size={14} className="animate-spin" /> Loading Roger prompts…
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 font-mono font-semibold text-gray-500 text-[10px] uppercase tracking-wider w-36">ID / Category</th>
                <th className="text-left px-3 py-2 font-mono font-semibold text-gray-500 text-[10px] uppercase tracking-wider">Line Text</th>
                <th className="text-left px-3 py-2 font-mono font-semibold text-gray-500 text-[10px] uppercase tracking-wider w-24">Mood</th>
                <th className="text-left px-3 py-2 font-mono font-semibold text-gray-500 text-[10px] uppercase tracking-wider w-16">Drain</th>
                <th className="text-left px-3 py-2 font-mono font-semibold text-gray-500 text-[10px] uppercase tracking-wider w-24">Status</th>
                <th className="text-left px-3 py-2 font-mono font-semibold text-gray-500 text-[10px] uppercase tracking-wider w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => {
                const moodKey = entry.requiredMoods[0] ?? "base";
                const isGen = generating === entry.id;
                const isPlaying = playingId === entry.id;
                return (
                  <tr key={entry.id} data-testid={`row-roger-${entry.id}`} className={C.row}>
                    <td className={C.td + " align-top"}>
                      <div className="font-mono text-[10px] font-bold text-gray-800">{entry.id}</div>
                      <div className={`font-mono text-[10px] mt-0.5 ${CATEGORY_COLORS[entry.category] ?? "text-gray-400"}`}>
                        {entry.category}
                      </div>
                      {entry.followUpAction && (
                        <div className="font-mono text-[9px] text-indigo-400 mt-0.5">→ {entry.followUpAction}</div>
                      )}
                    </td>
                    <td className={C.td + " align-top"}>
                      <div className="text-gray-700 font-mono text-[11px] leading-relaxed">{entry.lineText}</div>
                      {entry.usesV3 && entry.v3Text && (
                        <div className="mt-1.5 rounded border border-violet-200 bg-violet-50 px-2 py-1.5">
                          <div className="flex items-center gap-1 mb-1">
                            <span className="px-1 py-0.5 rounded bg-violet-600 text-white text-[8px] font-bold tracking-wider">v3 ✦</span>
                            <span className="text-[9px] text-violet-500 font-mono">eleven_v3 · emotional delivery</span>
                          </div>
                          <div className="text-violet-800 font-mono text-[11px] leading-relaxed italic">{entry.v3Text}</div>
                        </div>
                      )}
                    </td>
                    <td className={C.td + " align-top"}>
                      {entry.requiredMoods.length > 0 ? (
                        <div className="flex flex-wrap gap-0.5">
                          {entry.requiredMoods.map(m => (
                            <span key={m} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${MOOD_COLORS[m] ?? ""}`}>
                              {m}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${MOOD_COLORS.base}`}>
                          base
                        </span>
                      )}
                    </td>
                    <td className={C.td + " align-top"}>
                      <span className="font-mono text-[10px] text-gray-500">
                        {entry.minAttentionDrain}–{entry.maxAttentionDrain}
                      </span>
                    </td>
                    <td className={C.td + " align-top"}>
                      <span className={`${C.badge} ${entry.audioUrl ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-gray-50 text-gray-400"}`}>
                        {entry.audioUrl ? <CheckCircle size={10} /> : <AlertCircle size={10} />}
                        {entry.audioUrl ? "Audio ready" : "No audio"}
                      </span>
                    </td>
                    <td className={C.td + " align-top"}>
                      <div className="flex items-center gap-1">
                        <button
                          data-testid={`btn-roger-gen-${entry.id}`}
                          onClick={() => { setGenerating(entry.id); generateMutation.mutate({ id: entry.id, text: entry.lineText }); }}
                          disabled={!!generating}
                          title={entry.audioUrl ? "Regenerate audio" : "Generate audio"}
                          className={C.btnGhost + " text-[10px]"}
                        >
                          {isGen ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
                        </button>
                        {entry.audioUrl && (
                          <>
                            <button
                              data-testid={`btn-roger-play-${entry.id}`}
                              onClick={() => handlePlay(entry)}
                              title={isPlaying ? "Stop" : "Play audio"}
                              className={C.btnGhost + " text-[10px]"}
                            >
                              {isPlaying ? <Pause size={10} /> : <Play size={10} />}
                            </button>
                            <button
                              data-testid={`btn-roger-delete-${entry.id}`}
                              onClick={() => entry.audioFilename && deleteMutation.mutate(entry.audioFilename)}
                              title="Delete audio file"
                              className={C.btnDanger + " text-[10px]"}
                            >
                              <Trash2 size={10} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400 font-mono text-xs">
                    No prompts match current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── BustedGameSubTab ──────────────────────────────────────────────────────────
interface GameGreetingEntry {
  index: number;
  filename: string;
  audioUrl: string | null;
  plain: string;
  v3: string;
}

function BustedGameSubTab() {
  const { toast } = useToast();
  const [generating, setGenerating] = useState<number | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const bulkAbortRef = useRef(false);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { data: entries = [], isLoading, refetch } = useQuery<GameGreetingEntry[]>({
    queryKey: ["/api/admin/game-greetings"],
  });

  async function handleGenerate(entry: GameGreetingEntry) {
    setGenerating(entry.index);
    try {
      const res = await fetch("/api/admin/game-greetings/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: entry.index, model: "eleven_v3" }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      toast({ title: `Greeting ${entry.index} generated` });
      refetch();
    } catch (e: any) {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(null);
    }
  }

  async function handleGenerateAll() {
    bulkAbortRef.current = false;
    const missing = entries.filter(e => !e.audioUrl);
    if (missing.length === 0) {
      toast({ title: "All greetings already generated" });
      return;
    }
    setBulkProgress({ done: 0, total: missing.length });
    for (let i = 0; i < missing.length; i++) {
      if (bulkAbortRef.current) break;
      const entry = missing[i];
      setGenerating(entry.index);
      try {
        const res = await fetch("/api/admin/game-greetings/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ index: entry.index, model: "eleven_v3" }),
        });
        if (!res.ok) throw new Error((await res.json()).message);
      } catch (e: any) {
        toast({ title: `Greeting ${entry.index} failed`, description: e.message, variant: "destructive" });
      }
      setBulkProgress({ done: i + 1, total: missing.length });
      setGenerating(null);
      if (i < missing.length - 1 && !bulkAbortRef.current) await new Promise(r => setTimeout(r, 4000));
    }
    setBulkProgress(null);
    refetch();
    toast({ title: "Done generating game greetings" });
  }

  async function handleDelete(entry: GameGreetingEntry) {
    try {
      await fetch(`/api/admin/game-greetings/${entry.index}`, { method: "DELETE" });
      refetch();
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  }

  function handlePlay(entry: GameGreetingEntry) {
    if (!entry.audioUrl) return;
    if (playingIdx === entry.index) {
      audioRef.current?.pause();
      setPlayingIdx(null);
      return;
    }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    const a = new Audio(entry.audioUrl);
    a.onended = () => setPlayingIdx(null);
    audioRef.current = a;
    a.play();
    setPlayingIdx(entry.index);
  }

  const missingCount = entries.filter(e => !e.audioUrl).length;
  const NAMES = ["Derek", "Marcus", "Jason", "Chris", "Tony"];

  return (
    <div className="space-y-4">
      <div className={`${C.card} border-indigo-200 bg-indigo-50`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-semibold text-indigo-900 flex items-center gap-2">
              Busted Game — AI Caller Greetings
            </div>
            <div className="text-xs text-indigo-600 mt-0.5">
              5 pre-written AI caller greetings used as the Busted game imposter. Generated using eleven_v3.
              {missingCount > 0 && <span className="ml-2 font-semibold text-amber-700">{missingCount} missing</span>}
            </div>
          </div>
          <div className="flex gap-2">
            {bulkProgress ? (
              <>
                <div className="text-xs text-indigo-700 self-center">{bulkProgress.done}/{bulkProgress.total}</div>
                <button className={`${C.btnAmber} text-xs`} onClick={() => { bulkAbortRef.current = true; }} data-testid="btn-game-cancel-bulk">Cancel</button>
              </>
            ) : (
              <button
                className={`${C.btnAmber} text-xs`}
                onClick={handleGenerateAll}
                disabled={missingCount === 0}
                data-testid="btn-game-generate-all"
              >
                Generate Missing
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-6 text-gray-400 text-sm">Loading…</div>
        ) : (
          <div className="space-y-2">
            {entries.map(entry => {
              const name = NAMES[entry.index - 1] ?? `Caller ${entry.index}`;
              const isGen = generating === entry.index;
              const isPlaying = playingIdx === entry.index;
              return (
                <div key={entry.index} className="flex items-start gap-3 p-3 rounded-lg bg-white border border-indigo-100" data-testid={`row-game-greeting-${entry.index}`}>
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center mt-0.5">{entry.index}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm text-gray-800">{name}</span>
                      {entry.audioUrl ? (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-100 text-emerald-700 font-medium">Generated</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-600 font-medium">Missing</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 leading-relaxed line-clamp-2">{entry.plain}</div>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    {entry.audioUrl && (
                      <button
                        className={`px-2 py-1 rounded text-xs font-medium border ${isPlaying ? "bg-indigo-100 text-indigo-700 border-indigo-300" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
                        onClick={() => handlePlay(entry)}
                        data-testid={`btn-game-play-${entry.index}`}
                      >
                        {isPlaying ? "■" : "▶"}
                      </button>
                    )}
                    <button
                      className={`px-2 py-1 rounded text-xs font-medium border ${isGen ? "opacity-50" : "bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50"}`}
                      onClick={() => handleGenerate(entry)}
                      disabled={isGen || !!bulkProgress}
                      data-testid={`btn-game-gen-${entry.index}`}
                    >
                      {isGen ? "…" : entry.audioUrl ? "Regen" : "Generate"}
                    </button>
                    {entry.audioUrl && (
                      <button
                        className="px-2 py-1 rounded text-xs font-medium border bg-white text-red-500 border-red-200 hover:bg-red-50"
                        onClick={() => handleDelete(entry)}
                        data-testid={`btn-game-delete-${entry.index}`}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-indigo-100">
          <div className="text-xs text-indigo-600 space-y-1">
            <div><span className="font-semibold">How it works:</span> When Roger activates the Busted game, one of these 5 greetings is randomly selected and injected at a random position (2–7 profiles ahead) in the caller's browse queue.</div>
            <div><span className="font-semibold">Voice:</span> Controlled by <code className="bg-indigo-100 px-1 rounded">ELEVENLABS_VOICE_ID_GAME</code> env var. Set a realistic male voice distinct from Roger for best results.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── TTSTab ────────────────────────────────────────────────────────────────────
// Group filter tabs for the system prompts section (mirrors Roger's mood tabs)
// ── GROUP_TABS ────────────────────────────────────────────────────────────────
const GROUP_TABS = [
  { id: "all",        label: "All" },
  { id: "entry",      label: "Call Entry" },
  { id: "membership", label: "Membership" },
  { id: "onboarding", label: "Onboarding" },
  { id: "menu",       label: "Main Menu" },
  { id: "billing",    label: "Info & Billing" },
  { id: "browsing",   label: "Browsing" },
  { id: "messaging",  label: "Messaging" },
  { id: "live",       label: "Live Connect" },
  { id: "phrases",    label: "Numbers & Phrases" },
] as const;

function TTSTab() {
  const { toast } = useToast();
  const [audioGenTab, setAudioGenTab] = useState<"mm" | "mw" | "mw_m" | "roger" | "game">("mm");
  const [customText, setCustomText] = useState("");
  const [customFilename, setCustomFilename] = useState("");
  const [editingText, setEditingText] = useState<Record<string, string>>({});
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const [generateAllProgress, setGenerateAllProgress] = useState<{ done: number; total: number; currentLabel: string } | null>(null);
  const generateAllAbortRef = useRef(false);
  const [playingPromptKey, setPlayingPromptKey] = useState<string | null>(null);
  const promptAudioRef = useRef<HTMLAudioElement | null>(null);

  // Load saved prompt texts from server on mount
  const { data: savedPromptTexts } = useQuery<Record<string, string>>({
    queryKey: ["/api/admin/prompt-texts"],
  });

  useEffect(() => {
    if (savedPromptTexts && !initialized) {
      // Migrate old bare-filename keys (e.g. "main_menu.mp3") to compound keys
      // (e.g. "mm:main_menu.mp3") so each folder has its own independent text.
      // Keys that already contain ":" are already in the new format and pass through as-is.
      const migrated: Record<string, string> = {};
      for (const [k, v] of Object.entries(savedPromptTexts)) {
        if (k.includes(":")) {
          migrated[k] = v;
        } else {
          // Copy old shared value into all three folder variants so existing saved
          // overrides are not silently lost after the migration.
          migrated[`mm:${k}`]    = v;
          migrated[`mw:${k}`]    = v;
          migrated[`mw_m:${k}`]  = v;
        }
      }
      setEditingText(migrated);
      setInitialized(true);
    }
  }, [savedPromptTexts, initialized]);

  const savePromptsMutation = useMutation({
    mutationFn: async (overrides: Record<string, string>) => {
      const res = await fetch("/api/admin/prompt-texts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      setDirtyKeys(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prompt-texts"] });
      toast({ title: "Prompt texts saved", description: "All changes have been saved to the server." });
    },
    onError: () => toast({ title: "Save failed", description: "Could not save prompt texts.", variant: "destructive" }),
  });

  function handleTextChange(filename: string, value: string) {
    const key = `${categoryFolder}:${filename}`;
    setEditingText(prev => ({ ...prev, [key]: value }));
    setDirtyKeys(prev => new Set(prev).add(key));
  }

  function handleSaveAll() {
    savePromptsMutation.mutate(editingText);
  }

  const { data: settings } = useQuery<{ voiceIdMM: string; voiceIdMW: string; voiceIdMW_M: string }>({ queryKey: ["/api/admin/tts/settings"] });
  const { data: siteSettings } = useQuery<{ siteCategory: string }>({ queryKey: ["/api/site-settings"] });
  // Active folder is controlled by the selected audio tab (MM or MW), not site settings
  const categoryFolder: "mm" | "mw" | "mw_m" = audioGenTab === "mw" ? "mw" : audioGenTab === "mw_m" ? "mw_m" : "mm";
  // Prompt list switches with the active tab — MW gets gender-aware texts + MW-exclusive prompts
  const activePrompts = audioGenTab === "mw" ? MW_SYSTEM_PROMPTS : audioGenTab === "mw_m" ? MW_MALE_SYSTEM_PROMPTS : SYSTEM_PROMPTS;
  const { data: existingFiles } = useQuery<{ filename: string; url: string; size: number; folder: string }[]>({ queryKey: ["/api/admin/tts/prompts"] });
  const { data: zipEntries = [] } = useQuery<ZipEntry[]>({ queryKey: ["/api/admin/zip-codes"] });
  const neighborhoodEntries = zipEntries.filter(e => e.audioFile && e.neighborhood);
  const { data: allRegions = [] } = useQuery<Region[]>({ queryKey: ["/api/regions"] });
  const [generatingCity, setGeneratingCity] = useState<string | null>(null);
  const [generateAllCitiesProgress, setGenerateAllCitiesProgress] = useState<{ done: number; total: number; currentLabel: string } | null>(null);
  const generateAllCitiesAbortRef = useRef(false);

  const generateCityMutation = useMutation({
    mutationFn: async ({ regionId, folder }: { regionId: string; folder: string }) => {
      const res = await fetch(`/api/admin/regions/${regionId}/regenerate-city-audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({ message: "Failed" })); throw new Error(err.message); }
      return res.json() as Promise<{ filename: string; url: string; folder: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tts/prompts"] });
      toast({ title: "City audio generated" });
      setGeneratingCity(null);
    },
    onError: (err: Error) => { toast({ title: "Generation failed", description: err.message, variant: "destructive" }); setGeneratingCity(null); },
  });

  const existingMap = new Map<string, { filename: string; url: string; size: number; folder: string }>(
    (existingFiles ?? []).map(f => [`${f.folder}:${f.filename}`, f])
  );
  function fileExistsIn(folder: string, filename: string): boolean {
    return existingMap.has(`${folder}:${filename}`);
  }
  function getFileIn(folder: string, filename: string) {
    return existingMap.get(`${folder}:${filename}`);
  }

  const generateMutation = useMutation({
    mutationFn: async ({ text, filename, folder }: { text: string; filename: string; folder?: string }) => {
      const res = await fetch("/api/admin/tts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, filename, folder: folder ?? undefined }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({ message: "Generation failed" })); throw new Error(err.message); }
      return res.json() as Promise<{ filename: string; url: string; folder: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tts/prompts"] });
      toast({ title: "Audio generated", description: data.filename });
      setGenerating(null);
    },
    onError: (err: Error) => { toast({ title: "Generation failed", description: err.message, variant: "destructive" }); setGenerating(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ filename, folder }: { filename: string; folder: string }) => {
      const folderParam = folder && folder !== "shared" ? `?folder=${encodeURIComponent(folder)}` : "";
      const res = await fetch(`/api/admin/tts/prompts/${encodeURIComponent(filename)}${folderParam}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Delete failed");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/tts/prompts"] }); toast({ title: "File deleted" }); },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  function handleGenerate(filename: string, text: string, folder?: string) {
    const key = `${folder ?? "shared"}:${filename}`;
    setGenerating(key);
    generateMutation.mutate({ text, filename, folder });
  }
  function handleCustomGenerate() {
    if (!customText.trim() || !customFilename.trim()) return;
    const fn = customFilename.trim().replace(/\.mp3$/i, "") + ".mp3";
    const key = `${categoryFolder}:${fn}`;
    setGenerating(key);
    generateMutation.mutate({ text: customText.trim(), filename: fn, folder: categoryFolder });
    setCustomText(""); setCustomFilename("");
  }

  async function handlePreview() {
    if (!customText.trim()) return;
    if (previewing) {
      previewAudioRef.current?.pause();
      previewAudioRef.current = null;
      setPreviewing(false);
      return;
    }
    setPreviewing(true);
    try {
      const res = await fetch("/api/admin/tts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: customText.trim(), folder: categoryFolder }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Preview failed" }));
        throw new Error(err.message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.onended = () => { setPreviewing(false); URL.revokeObjectURL(url); previewAudioRef.current = null; };
      audio.onerror = () => { setPreviewing(false); URL.revokeObjectURL(url); previewAudioRef.current = null; };
      audio.play();
    } catch (err: any) {
      toast({ title: "Preview failed", description: err.message, variant: "destructive" });
      setPreviewing(false);
    }
  }

  async function handleGenerateAll() {
    if (generateAllProgress) {
      generateAllAbortRef.current = true;
      return;
    }
    generateAllAbortRef.current = false;
    const prompts = activePrompts;
    setGenerateAllProgress({ done: 0, total: prompts.length, currentLabel: prompts[0]?.label ?? "" });
    let done = 0;
    for (const prompt of prompts) {
      if (generateAllAbortRef.current) break;
      const text = editingText[`${categoryFolder}:${prompt.filename}`] ?? editingText[prompt.filename] ?? prompt.text;
      const key = `${categoryFolder}:${prompt.filename}`;
      setGenerating(key);
      setGenerateAllProgress({ done, total: prompts.length, currentLabel: prompt.label });
      try {
        const res = await fetch("/api/admin/tts/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.trim(), filename: prompt.filename, folder: categoryFolder }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: "Failed" }));
          toast({ title: `Failed: ${prompt.label}`, description: err.message, variant: "destructive" });
        }
      } catch {
        toast({ title: `Error: ${prompt.label}`, description: "Network error", variant: "destructive" });
      }
      done++;
      // 30-second gap between requests to stay well within ElevenLabs rate limits
      if (!generateAllAbortRef.current) await new Promise(r => setTimeout(r, 30000));
    }
    const wasCancelled = generateAllAbortRef.current;
    setGenerating(null);
    setGenerateAllProgress(null);
    generateAllAbortRef.current = false;
    queryClient.invalidateQueries({ queryKey: ["/api/admin/tts/prompts"] });
    if (!wasCancelled) {
      toast({ title: "Generate All complete", description: `${done} of ${prompts.length} prompts generated into ${categoryFolder.toUpperCase()} folder.` });
    }
  }

  function promptExists(filename: string): boolean {
    return fileExistsIn(categoryFolder, filename) || fileExistsIn("shared", filename);
  }

  function handlePlayPrompt(key: string, url: string) {
    if (playingPromptKey === key) {
      promptAudioRef.current?.pause();
      promptAudioRef.current = null;
      setPlayingPromptKey(null);
      return;
    }
    promptAudioRef.current?.pause();
    const audio = new Audio(url);
    promptAudioRef.current = audio;
    setPlayingPromptKey(key);
    audio.onended = () => { setPlayingPromptKey(null); promptAudioRef.current = null; };
    audio.onerror = () => { setPlayingPromptKey(null); promptAudioRef.current = null; };
    audio.play();
  }

  async function handleGenerateMissing() {
    if (generateAllProgress) {
      generateAllAbortRef.current = true;
      return;
    }
    generateAllAbortRef.current = false;
    const missing = activePrompts.filter(p => !promptExists(p.filename));
    if (missing.length === 0) {
      toast({ title: "Nothing to generate", description: "All prompts already have audio files." });
      return;
    }
    setGenerateAllProgress({ done: 0, total: missing.length, currentLabel: missing[0]?.label ?? "" });
    let done = 0;
    for (const prompt of missing) {
      if (generateAllAbortRef.current) break;
      const text = editingText[`${categoryFolder}:${prompt.filename}`] ?? editingText[prompt.filename] ?? prompt.text;
      if (!text.trim()) { done++; continue; }
      const key = `${categoryFolder}:${prompt.filename}`;
      setGenerating(key);
      setGenerateAllProgress({ done, total: missing.length, currentLabel: prompt.label });
      try {
        const res = await fetch("/api/admin/tts/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.trim(), filename: prompt.filename, folder: categoryFolder }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: "Failed" }));
          toast({ title: `Failed: ${prompt.label}`, description: err.message, variant: "destructive" });
        }
      } catch {
        toast({ title: `Error: ${prompt.label}`, description: "Network error", variant: "destructive" });
      }
      done++;
      // 30-second gap between requests to stay well within ElevenLabs rate limits
      if (!generateAllAbortRef.current) await new Promise(r => setTimeout(r, 30000));
    }
    const wasCancelled = generateAllAbortRef.current;
    setGenerating(null);
    setGenerateAllProgress(null);
    generateAllAbortRef.current = false;
    queryClient.invalidateQueries({ queryKey: ["/api/admin/tts/prompts"] });
    if (!wasCancelled) {
      toast({ title: "Generate Missing complete", description: `${done} of ${missing.length} missing prompts generated.` });
    }
  }

  async function handleGenerateAllCities() {
    if (generateAllCitiesProgress) {
      generateAllCitiesAbortRef.current = true;
      return;
    }
    const regions = allRegions;
    if (regions.length === 0) {
      toast({ title: "No regions", description: "Add regions first." });
      return;
    }
    generateAllCitiesAbortRef.current = false;
    setGenerateAllCitiesProgress({ done: 0, total: regions.length, currentLabel: regions[0]?.name ?? "" });
    let done = 0;
    for (const region of regions) {
      if (generateAllCitiesAbortRef.current) break;
      setGeneratingCity(region.id);
      setGenerateAllCitiesProgress({ done, total: regions.length, currentLabel: region.name });
      try {
        const res = await fetch(`/api/admin/regions/${region.id}/regenerate-city-audio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folder: categoryFolder }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: "Failed" }));
          toast({ title: `Failed: ${region.name}`, description: err.message, variant: "destructive" });
        }
      } catch {
        toast({ title: `Error: ${region.name}`, description: "Network error", variant: "destructive" });
      }
      done++;
      if (!generateAllCitiesAbortRef.current) await new Promise(r => setTimeout(r, 30000));
    }
    const wasCancelled = generateAllCitiesAbortRef.current;
    setGeneratingCity(null);
    setGenerateAllCitiesProgress(null);
    generateAllCitiesAbortRef.current = false;
    queryClient.invalidateQueries({ queryKey: ["/api/admin/tts/prompts"] });
    if (!wasCancelled) {
      toast({ title: "City audio complete", description: `${done} of ${regions.length} ${categoryFolder.toUpperCase()} city files generated.` });
    }
  }

  const groupFiltered = groupFilter === "all" ? activePrompts : activePrompts.filter(p => p.group === groupFilter);
  const filtered = groupFiltered.filter(p =>
    !searchText ||
    p.label.toLowerCase().includes(searchText.toLowerCase()) ||
    p.filename.toLowerCase().includes(searchText.toLowerCase())
  );
  const generatedCount = activePrompts.filter(p => promptExists(p.filename)).length;
  const missingCount = activePrompts.length - generatedCount;

  const subTabBar = (
    <div className="flex border-b border-gray-200 gap-1 mb-6">
      {([
        { id: "mm",    label: "MM Prompts" },
        { id: "mw",    label: "MW Female Voice" },
        { id: "mw_m",  label: "MW Male Voice" },
        { id: "roger", label: "Roger" },
        { id: "game",  label: "Busted Game" },
      ] as const).map(tab => (
        <button
          key={tab.id}
          data-testid={`btn-audio-gen-tab-${tab.id}`}
          onClick={() => setAudioGenTab(tab.id)}
          className={`px-4 py-2 text-sm font-mono font-semibold border-b-2 -mb-px transition-colors ${
            audioGenTab === tab.id
              ? "border-[#f5a623] text-[#f5a623]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  if (audioGenTab === "roger") {
    return (
      <div className="space-y-6">
        {subTabBar}
        <RogerSubTab />
      </div>
    );
  }

  if (audioGenTab === "game") {
    return (
      <div className="space-y-6">
        {subTabBar}
        <BustedGameSubTab />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {subTabBar}
      <div className="grid grid-cols-2 gap-4">
        <div className={C.cardAlt}>
          <div className={C.label}>Active Mode</div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`px-3 py-1 rounded font-mono text-sm font-bold text-white ${categoryFolder === "mw" ? "bg-purple-600" : "bg-blue-600"}`}>
              {categoryFolder.toUpperCase()}
            </span>
            <span className="text-gray-400 text-xs">Switch via the MM / MW tabs above</span>
          </div>
        </div>
        <div className={C.cardAlt}>
          <div className={C.label}>MM Voice ID</div>
          <div className="text-[#f5a623] font-mono text-sm break-all">{settings?.voiceIdMM ?? "Loading..."}</div>
          <div className="text-gray-400 font-mono text-xs">Set via ELEVENLABS_VOICE_ID_MM in .env</div>
        </div>
        <div className={C.cardAlt}>
          <div className={C.label}>MW Female Voice ID</div>
          <div className="text-[#f5a623] font-mono text-sm break-all">{settings?.voiceIdMW ?? "Loading..."}</div>
          <div className="text-gray-400 font-mono text-xs">Set via ELEVENLABS_VOICE_ID_MW in .env</div>
        </div>
        <div className={C.cardAlt}>
          <div className={C.label}>MW Male Voice ID</div>
          <div className="text-[#f5a623] font-mono text-sm break-all">{settings?.voiceIdMW_M ?? "Loading..."}</div>
          <div className="text-gray-400 font-mono text-xs">Set via ELEVENLABS_VOICE_ID_MW_M in .env</div>
        </div>
      </div>

      <div className={C.card}>
        <h3 className="text-gray-800 font-mono text-sm font-bold tracking-widest uppercase flex items-center gap-2">
          <Settings size={14} className="text-[#f5a623]" /> Active Audio Folder
        </h3>
        <p className="text-gray-400 font-mono text-xs -mt-1">
          Audio is generated into the <span className="text-[#f5a623] font-bold">{categoryFolder.toUpperCase()}</span> folder. Use the tabs above to switch between MM, MW Female Voice, and MW Male Voice prompt sets.
        </p>
        <div className="flex gap-2 mt-2">
          {([
            { id: "mm",   label: "MM",   hint: "Men seeking Men" },
            { id: "mw",   label: "MW ♀",  hint: "MW Female Voice (heard by male callers)" },
            { id: "mw_m", label: "MW ♂",  hint: "MW Male Voice (heard by female callers)" },
          ] as const).map(opt => (
            <div
              key={opt.id}
              data-testid={`indicator-category-${opt.id}`}
              title={opt.hint}
              className={`px-3 py-1.5 rounded text-xs font-mono font-bold border cursor-default select-none ${
                categoryFolder === opt.id
                  ? "bg-[#f5a623] border-[#f5a623] text-white"
                  : "bg-gray-100 border-gray-200 text-gray-400"
              }`}
            >
              {opt.label}
              {categoryFolder === opt.id && <span className="ml-1.5 text-[10px] opacity-80">← active</span>}
            </div>
          ))}
        </div>
      </div>

      <div className={C.card}>
        <h3 className="text-gray-800 font-mono text-sm font-bold tracking-widest uppercase flex items-center gap-2">
          <Wand2 size={14} className="text-[#f5a623]" /> Custom Audio File
          <span className="ml-auto text-[10px] font-normal normal-case text-gray-400 border border-gray-200 rounded px-2 py-0.5">
            → {categoryFolder.toUpperCase()} folder
          </span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={C.label}>Output Filename</label>
            <input data-testid="input-custom-filename" type="text" value={customFilename} onChange={e => setCustomFilename(e.target.value)} placeholder="my_custom_prompt" className={C.input} />
            <div className="text-gray-400 font-mono text-xs mt-1">.mp3 appended automatically</div>
          </div>
          <div>
            <label className={C.label}>Text to Speak</label>
            <div className="flex gap-2 items-center">
              <button
                data-testid="btn-preview-tts"
                type="button"
                onClick={handlePreview}
                disabled={!customText.trim()}
                title={previewing ? "Stop preview" : "Preview audio via ElevenLabs"}
                className={`flex-shrink-0 flex items-center justify-center w-9 h-9 rounded border transition-colors ${
                  previewing
                    ? "bg-[#f5a623] border-[#f5a623] text-white"
                    : "bg-white border-gray-300 text-gray-500 hover:border-[#f5a623] hover:text-[#f5a623] disabled:opacity-40 disabled:cursor-not-allowed"
                }`}
              >
                {previewing ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
              </button>
              <input
                data-testid="input-custom-text"
                type="text"
                value={customText}
                onChange={e => setCustomText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleCustomGenerate(); }}
                placeholder="Enter text to convert to speech..."
                className={C.input + " flex-1"}
              />
            </div>
          </div>
        </div>
        <button data-testid="btn-generate-custom" onClick={handleCustomGenerate} disabled={!customText.trim() || !customFilename.trim() || !!generating} className={C.btnPrimary}>
          {generating === `${categoryFolder}:${customFilename.trim().replace(/\.mp3$/i, "") + ".mp3"}` ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
          Generate
        </button>
      </div>

      {neighborhoodEntries.length > 0 && (
        <div className={C.card}>
          <h3 className="text-gray-800 font-mono text-sm font-bold tracking-widest uppercase flex items-center gap-2">
            <MapPin size={14} className="text-[#f5a623]" /> Neighborhood Audio Files
          </h3>
          <p className="text-gray-400 font-mono text-xs -mt-1">
            One audio file per neighborhood. Generate each so the system knows what to play for that zip code area.
          </p>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={C.th}>Neighborhood</th>
                  <th className={C.th}>File</th>
                  <th className={C.th + " w-32"}>Status</th>
                  <th className={C.th + " w-40"}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {neighborhoodEntries.map(entry => {
                  const filename = entry.audioFile!;
                  const exists = fileExistsIn("shared", filename);
                  const isGen = generating === `shared:${filename}`;
                  const existingFile = getFileIn("shared", filename);
                  return (
                    <tr key={entry.id} data-testid={`row-neighborhood-audio-${entry.id}`} className={C.row}>
                      <td className={C.td + " w-48"}>
                        <div className="text-gray-800 font-mono text-xs font-bold">{entry.neighborhood}</div>
                        <div className="text-gray-400 font-mono text-[10px] mt-0.5">{entry.code}</div>
                      </td>
                      <td className={C.td}>
                        <span className="font-mono text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">{filename}</span>
                      </td>
                      <td className={C.td}>
                        <span className={`${C.badge} ${exists ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-gray-50 text-gray-400"}`}>
                          {exists ? <CheckCircle size={10} /> : <AlertCircle size={10} />}
                          {exists ? "Audio ready" : "No audio"}
                        </span>
                      </td>
                      <td className={C.td}>
                        <div className="flex items-center gap-1.5">
                          <button
                            data-testid={`btn-generate-neighborhood-${entry.id}`}
                            onClick={() => handleGenerate(filename, entry.neighborhood!, "shared")}
                            disabled={!!generating}
                            className={C.btnGhost + " text-[10px]"}
                          >
                            {isGen ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
                            {exists ? "Regen" : "Generate"}
                          </button>
                          {exists && (
                            <>
                              {existingFile && <AudioPlayer src={existingFile.url} />}
                              <button
                                data-testid={`btn-delete-neighborhood-${entry.id}`}
                                onClick={() => deleteMutation.mutate({ filename, folder: "shared" })}
                                className={C.btnDanger + " text-[10px]"}
                              >
                                <Trash2 size={10} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {allRegions.length > 0 && (
        <div className={C.card}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-gray-800 font-mono text-sm font-bold tracking-widest uppercase flex items-center gap-2">
              <MapPin size={14} className="text-[#f5a623]" /> City Name Audio Files
            </h3>
            <button
              data-testid="btn-generate-all-cities"
              onClick={handleGenerateAllCities}
              disabled={!!generatingCity && !generateAllCitiesProgress}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-bold border transition-colors ${
                generateAllCitiesProgress
                  ? "bg-red-50 border-red-300 text-red-600 hover:bg-red-100"
                  : "bg-[#f5a623] border-[#f5a623] text-white hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
              }`}
            >
              {generateAllCitiesProgress
                ? <><X size={12} /> Cancel</>
                : <><Wand2 size={12} /> Generate All ({allRegions.length})</>}
            </button>
          </div>
          <p className="text-gray-400 font-mono text-xs -mt-1">
            One audio file per region. Used in the linked-regions IVR menu when a caller has heard all local callers and is offered nearby cities.
            The menu says: <span className="text-gray-600 italic">"You have heard all the callers close to you. Press 1 to hear [guys from Denver]. Press 2 to hear [guys from Boulder]. Press 3 to start over."</span>
            <br />The bracketed parts play from these pre-generated ElevenLabs files. New regions auto-generate on creation. This menu is triggered automatically — no manual setup needed.
          </p>
          {generateAllCitiesProgress && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono text-gray-500">
                <span className="truncate max-w-xs">{generateAllCitiesProgress.currentLabel}</span>
                <span className="flex-shrink-0 ml-2 text-[#f5a623] font-bold">{generateAllCitiesProgress.done} / {generateAllCitiesProgress.total}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-[#f5a623] h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${(generateAllCitiesProgress.done / generateAllCitiesProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={C.th}>Region</th>
                  <th className={C.th}>File</th>
                  <th className={C.th + " w-32"}>Status</th>
                  <th className={C.th + " w-40"}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {allRegions.map(region => {
                  const slug = region.slug.replace(/[^a-z0-9_\-]/g, "_");
                  const filename = `city_${slug}.mp3`;
                  const exists = fileExistsIn(categoryFolder, filename);
                  const existingFile = getFileIn(categoryFolder, filename);
                  const isGen = generatingCity === region.id;
                  return (
                    <tr key={region.id} data-testid={`row-city-audio-${region.id}`} className={C.row}>
                      <td className={C.td}>
                        <div className="text-gray-800 font-mono text-xs font-bold">{region.name}</div>
                        <div className="text-gray-400 font-mono text-[10px] mt-0.5">{region.slug}</div>
                      </td>
                      <td className={C.td}>
                        <span className="font-mono text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">{categoryFolder}/{filename}</span>
                        <div className="text-gray-400 font-mono text-[10px] mt-0.5 italic">"{`guys from ${region.name}.`}"</div>
                      </td>
                      <td className={C.td}>
                        <span className={`${C.badge} ${exists ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-gray-50 text-gray-400"}`}>
                          {exists ? <CheckCircle size={10} /> : <AlertCircle size={10} />}
                          {exists ? "Audio ready" : "No audio"}
                        </span>
                      </td>
                      <td className={C.td}>
                        <div className="flex items-center gap-1.5">
                          <button
                            data-testid={`btn-generate-city-${region.id}`}
                            onClick={() => { setGeneratingCity(region.id); generateCityMutation.mutate({ regionId: region.id, folder: categoryFolder }); }}
                            disabled={!!generatingCity}
                            className={C.btnGhost + " text-[10px]"}
                          >
                            {isGen ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
                            {exists ? "Regen" : "Generate"}
                          </button>
                          {exists && existingFile && <AudioPlayer src={existingFile.url} />}
                          {exists && (
                            <button
                              data-testid={`btn-delete-city-${region.id}`}
                              onClick={() => deleteMutation.mutate({ filename, folder: categoryFolder })}
                              className={C.btnDanger + " text-[10px]"}
                            >
                              <Trash2 size={10} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── System Prompts (Roger-style) ── */}
      <div className="space-y-4">
        {/* Stats row + bulk actions */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex gap-3">
            <div className={C.cardAlt + " py-2 px-3 flex flex-col items-center min-w-[72px]"}>
              <div className="font-mono text-xl font-bold text-gray-800">{activePrompts.length}</div>
              <div className={C.label}>Total</div>
            </div>
            <div className={C.cardAlt + " py-2 px-3 flex flex-col items-center min-w-[72px]"}>
              <div className="font-mono text-xl font-bold text-emerald-600">{generatedCount}</div>
              <div className={C.label}>Generated</div>
            </div>
            <div className={C.cardAlt + " py-2 px-3 flex flex-col items-center min-w-[72px]"}>
              <div className="font-mono text-xl font-bold text-amber-600">{missingCount}</div>
              <div className={C.label}>Missing</div>
            </div>
            <div className={C.cardAlt + " py-2 px-3 flex flex-col items-center min-w-[72px]"}>
              <div className="font-mono text-xs font-bold text-blue-600 uppercase pt-1">{categoryFolder.toUpperCase()}</div>
              <div className={C.label}>Folder</div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {dirtyKeys.size > 0 && (
              <button
                data-testid="btn-save-prompt-texts"
                onClick={handleSaveAll}
                disabled={savePromptsMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-bold border bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {savePromptsMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                Save {dirtyKeys.size} change{dirtyKeys.size !== 1 ? "s" : ""}
              </button>
            )}
            <button
              data-testid="btn-generate-missing"
              onClick={handleGenerateMissing}
              disabled={!!generating && !generateAllProgress}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-bold border transition-colors ${
                generateAllProgress
                  ? "bg-red-50 border-red-300 text-red-600 hover:bg-red-100"
                  : "bg-[#f5a623] border-[#f5a623] text-white hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
              }`}
            >
              {generateAllProgress
                ? <><X size={12} /> Cancel</>
                : <><Wand2 size={12} /> Generate Missing ({missingCount})</>}
            </button>
            <button
              data-testid="btn-generate-all"
              onClick={handleGenerateAll}
              disabled={!!generating && !generateAllProgress}
              className={C.btnGhost + " text-xs"}
              title="Regenerate every prompt (overwrites existing)"
            >
              <Wand2 size={11} /> Regen All
            </button>
          </div>
        </div>

        {/* Bulk progress bar */}
        {generateAllProgress && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono text-gray-500">
              <span className="truncate max-w-xs">{generateAllProgress.currentLabel}</span>
              <span className="flex-shrink-0 ml-2 text-[#f5a623] font-bold">{generateAllProgress.done} / {generateAllProgress.total}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-[#f5a623] h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${(generateAllProgress.done / generateAllProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Group filter chips + search */}
        <div className="flex items-center gap-1 flex-wrap">
          {GROUP_TABS.map(tab => {
            const count = tab.id === "all" ? activePrompts.length : activePrompts.filter(p => p.group === tab.id).length;
            return (
              <button
                key={tab.id}
                data-testid={`btn-prompt-group-${tab.id}`}
                onClick={() => setGroupFilter(tab.id)}
                className={`px-3 py-1 rounded text-xs font-mono font-semibold border transition-colors ${
                  groupFilter === tab.id
                    ? "bg-[#f5a623] border-[#f5a623] text-white"
                    : "bg-white border-gray-200 text-gray-500 hover:border-[#f5a623] hover:text-[#f5a623]"
                }`}
              >
                {tab.label}
                <span className="ml-1 opacity-60">({count})</span>
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-1.5 bg-white border border-gray-200 rounded px-2 py-1">
            <Search size={11} className="text-gray-400" />
            <input
              data-testid="input-search-prompts"
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Search prompts…"
              className="text-xs font-mono outline-none w-40 text-gray-700 placeholder-gray-400"
            />
          </div>
        </div>

        {/* Prompt table */}
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 font-mono font-semibold text-gray-500 text-[10px] uppercase tracking-wider w-56">Prompt / File</th>
                <th className="text-left px-3 py-2 font-mono font-semibold text-gray-500 text-[10px] uppercase tracking-wider">Text to Speak</th>
                <th className="text-left px-3 py-2 font-mono font-semibold text-gray-500 text-[10px] uppercase tracking-wider w-24">Status</th>
                <th className="text-left px-3 py-2 font-mono font-semibold text-gray-500 text-[10px] uppercase tracking-wider w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(prompt => {
                const exists = promptExists(prompt.filename);
                const isGen = generating === `${categoryFolder}:${prompt.filename}`;
                const existingFile = getFileIn(categoryFolder, prompt.filename) ?? getFileIn("shared", prompt.filename);
                const promptKey = `${categoryFolder}:${prompt.filename}`;
                const currentText = editingText[promptKey] ?? editingText[prompt.filename] ?? prompt.text;
                const isDirty = dirtyKeys.has(promptKey);
                const isPlaying = playingPromptKey === prompt.filename;
                return (
                  <tr key={prompt.filename} data-testid={`row-prompt-${prompt.filename}`} className={C.row}>
                    <td className={C.td + " align-top"}>
                      <div className="text-gray-800 font-mono text-[11px] font-bold leading-tight">{prompt.label}</div>
                      <div className="text-gray-400 font-mono text-[10px] mt-0.5">{prompt.filename}</div>
                    </td>
                    <td className={C.td + " align-top"}>
                      <div className="relative">
                        <AutoResizeTextarea
                          data-testid={`textarea-prompt-${prompt.filename}`}
                          value={currentText}
                          onChange={v => handleTextChange(prompt.filename, v)}
                          className={`w-full bg-gray-50 border rounded px-2.5 py-1.5 text-gray-700 font-mono text-xs placeholder-gray-400 focus:outline-none transition-colors ${isDirty ? "border-amber-400 bg-amber-50 focus:border-amber-500" : "border-gray-200 focus:border-[#f5a623]"}`}
                        />
                        {isDirty && (
                          <span className="absolute top-1 right-1.5 text-[9px] font-bold text-amber-500 font-mono select-none pointer-events-none">unsaved</span>
                        )}
                      </div>
                    </td>
                    <td className={C.td + " align-top"}>
                      <span className={`${C.badge} ${exists ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-gray-50 text-gray-400"}`}>
                        {exists ? <CheckCircle size={10} /> : <AlertCircle size={10} />}
                        {exists ? "Audio ready" : "No audio"}
                      </span>
                    </td>
                    <td className={C.td + " align-top"}>
                      <div className="flex items-center gap-1">
                        <button
                          data-testid={`btn-generate-${prompt.filename}`}
                          onClick={() => handleGenerate(prompt.filename, currentText, categoryFolder)}
                          disabled={!!generating}
                          title={exists ? "Regenerate audio" : "Generate audio"}
                          className={C.btnGhost + " text-[10px]"}
                        >
                          {isGen ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
                        </button>
                        {exists && existingFile && (
                          <button
                            data-testid={`btn-play-prompt-${prompt.filename}`}
                            onClick={() => handlePlayPrompt(prompt.filename, existingFile.url)}
                            title={isPlaying ? "Stop" : "Play audio"}
                            className={C.btnGhost + " text-[10px]"}
                          >
                            {isPlaying ? <Pause size={10} /> : <Play size={10} />}
                          </button>
                        )}
                        {exists && (
                          <button
                            data-testid={`btn-delete-prompt-${prompt.filename}`}
                            onClick={() => deleteMutation.mutate({ filename: prompt.filename, folder: categoryFolder })}
                            title="Delete audio file"
                            className={C.btnDanger + " text-[10px]"}
                          >
                            <Trash2 size={10} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-gray-400 font-mono text-xs">
                    No prompts match current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── MembershipsTab ────────────────────────────────────────────────────────────
function MembershipsTab() {
  const { toast } = useToast();
  interface MembershipSettings { freeTrialMinutes: number; plan1Name: string; plan1Minutes: number; plan1PriceCents: number; plan2Name: string; plan2Minutes: number; plan2PriceCents: number; plan3Name: string; plan3Minutes: number; plan3PriceCents: number; bonusPlanKey: string | null; billingMode: string; paypalEmail: string | null; paypalSandbox: boolean; freeMode: boolean; freeModeScheduleDays: number[]; }

  const { data: ms, isLoading, isFetching } = useQuery<MembershipSettings>({ queryKey: ["/api/admin/membership-settings"] });

  const [freeTrialMinutes, setFreeTrialMinutes] = useState("");
  const [plan1Name, setPlan1Name] = useState(""); const [plan1Minutes, setPlan1Minutes] = useState(""); const [plan1Price, setPlan1Price] = useState("");
  const [plan2Name, setPlan2Name] = useState(""); const [plan2Minutes, setPlan2Minutes] = useState(""); const [plan2Price, setPlan2Price] = useState("");
  const [plan3Name, setPlan3Name] = useState(""); const [plan3Minutes, setPlan3Minutes] = useState(""); const [plan3Price, setPlan3Price] = useState("");
  const [bonusPlanKey, setBonusPlanKey] = useState<string | null>(null);
  const [billingMode, setBillingMode] = useState<"per_minute" | "per_day" | "per_24h">("per_minute");
  const [paypalEmail, setPaypalEmail] = useState("");
  const [paypalSandbox, setPaypalSandbox] = useState(false);
  const [freeMode, setFreeMode] = useState(false);
  const [freeModeScheduleDays, setFreeModeScheduleDays] = useState<number[]>([]);
  const [initialized, setInitialized] = useState(false);

  if (ms && !isFetching && !initialized) {
    setFreeTrialMinutes(String(ms.freeTrialMinutes));
    setPlan1Name(ms.plan1Name); setPlan1Minutes(String(ms.plan1Minutes)); setPlan1Price((ms.plan1PriceCents / 100).toFixed(2));
    setPlan2Name(ms.plan2Name); setPlan2Minutes(String(ms.plan2Minutes)); setPlan2Price((ms.plan2PriceCents / 100).toFixed(2));
    setPlan3Name(ms.plan3Name); setPlan3Minutes(String(ms.plan3Minutes)); setPlan3Price((ms.plan3PriceCents / 100).toFixed(2));
    setBonusPlanKey(ms.bonusPlanKey ?? null);
    setBillingMode((ms.billingMode ?? "per_minute") as "per_minute" | "per_day" | "per_24h");
    setPaypalEmail(ms.paypalEmail ?? "");
    setPaypalSandbox(ms.paypalSandbox ?? false);
    setFreeMode(ms.freeMode ?? false);
    setFreeModeScheduleDays(ms.freeModeScheduleDays ?? []);
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const toMinutes = (v: string) => Math.max(1, parseInt(v) || 0);
      const toCents = (v: string) => Math.round(parseFloat(v) * 100);
      return apiRequest("PUT", "/api/admin/membership-settings", {
        freeTrialMinutes: toMinutes(freeTrialMinutes),
        plan1Name: plan1Name.trim() || "Plan 1", plan1Minutes: toMinutes(plan1Minutes), plan1PriceCents: toCents(plan1Price),
        plan2Name: plan2Name.trim() || "Plan 2", plan2Minutes: toMinutes(plan2Minutes), plan2PriceCents: toCents(plan2Price),
        plan3Name: plan3Name.trim() || "Plan 3", plan3Minutes: toMinutes(plan3Minutes), plan3PriceCents: toCents(plan3Price),
        bonusPlanKey: bonusPlanKey || "",
        billingMode,
        paypalEmail: paypalEmail.trim() || null,
        paypalSandbox,
        freeMode,
        freeModeScheduleDays,
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/membership-settings"] }); toast({ title: "Membership settings saved" }); },
    onError: (err: Error) => toast({ title: "Failed to save settings", description: err.message, variant: "destructive" }),
  });

  // Helper: display a human-readable duration for a minute count
  function fmtMinutes(m: number): string {
    if (m <= 0) return "—";
    if (billingMode === "per_day") {
      const days = Math.floor(m / 1440);
      const hrs = Math.floor((m % 1440) / 60);
      if (days === 0) return hrs === 1 ? "1 hr" : `${hrs} hrs`;
      if (hrs === 0) return days === 1 ? "1 day" : `${days} days`;
      return `${days} day${days !== 1 ? "s" : ""} ${hrs} hr${hrs !== 1 ? "s" : ""}`;
    }
    const hrs = Math.floor(m / 60);
    const mins = m % 60;
    if (m < 60) return `${m} min`;
    if (mins === 0) return `${hrs} hr${hrs !== 1 ? "s" : ""}`;
    return `${hrs} hr ${mins} min`;
  }

  const plans = [
    { label: "Plan 1", keyBadge: "Press 1", planKey: "plan1", name: plan1Name, setName: setPlan1Name, minutes: plan1Minutes, setMinutes: setPlan1Minutes, price: plan1Price, setPrice: setPlan1Price, testPrefix: "plan1" },
    { label: "Plan 2", keyBadge: "Press 2", planKey: "plan2", name: plan2Name, setName: setPlan2Name, minutes: plan2Minutes, setMinutes: setPlan2Minutes, price: plan2Price, setPrice: setPlan2Price, testPrefix: "plan2" },
    { label: "Plan 3", keyBadge: "Press 3", planKey: "plan3", name: plan3Name, setName: setPlan3Name, minutes: plan3Minutes, setMinutes: setPlan3Minutes, price: plan3Price, setPrice: setPlan3Price, testPrefix: "plan3" },
  ];

  if (isLoading) return <div className="py-20 text-center text-gray-400 font-mono text-xs tracking-widest">LOADING SETTINGS...</div>;

  return (
    <div className="space-y-6">

      {/* ── Free Mode ────────────────────────────────────────────────────────── */}
      {(() => {
        const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const todayDow = new Date().getDay();
        const scheduledToday = freeModeScheduleDays.includes(todayDow);
        const effectivelyActive = freeMode || scheduledToday;
        const toggleDay = (d: number) => setFreeModeScheduleDays(prev =>
          prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
        );
        return (
          <div className={`${C.card} border-2 ${effectivelyActive ? "border-green-400 bg-green-50" : freeModeScheduleDays.length > 0 ? "border-yellow-300 bg-yellow-50" : "border-gray-200"}`}>
            {/* ── Manual override row ── */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className={`font-mono text-sm font-bold tracking-widest uppercase mb-1 ${freeMode ? "text-green-700" : "text-gray-800"}`}>
                  Free Mode
                  {freeMode && <span className="ml-2 text-xs bg-green-500 text-white px-2 py-0.5 rounded-full normal-case tracking-normal">ALWAYS ON</span>}
                  {!freeMode && scheduledToday && <span className="ml-2 text-xs bg-green-500 text-white px-2 py-0.5 rounded-full normal-case tracking-normal">ON TODAY</span>}
                  {!freeMode && !scheduledToday && freeModeScheduleDays.length > 0 && <span className="ml-2 text-xs bg-yellow-500 text-white px-2 py-0.5 rounded-full normal-case tracking-normal">SCHEDULED</span>}
                </h3>
                <p className="text-gray-500 font-mono text-xs leading-relaxed">
                  <strong>Always On</strong> forces free access every day. Use <strong>Schedule</strong> to activate automatically on specific days of the week.
                </p>
              </div>
              <div className="flex flex-col items-center gap-1 flex-shrink-0">
                <button
                  data-testid="btn-toggle-free-mode"
                  type="button"
                  onClick={() => setFreeMode(v => !v)}
                  className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none ${freeMode ? "bg-green-500" : "bg-gray-300"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${freeMode ? "translate-x-6" : "translate-x-0"}`} />
                </button>
                <span className="font-mono text-[10px] text-gray-400 tracking-wider">{freeMode ? "ALWAYS ON" : "ALWAYS OFF"}</span>
              </div>
            </div>

            {/* ── Scheduled days picker ── */}
            <div className="mt-4">
              <p className="font-mono text-[10px] text-gray-400 tracking-widest uppercase mb-2">Auto-Schedule — check days to enable free mode</p>
              <div className="flex gap-1.5 flex-wrap">
                {DAY_LABELS.map((label, d) => {
                  const selected = freeModeScheduleDays.includes(d);
                  const isToday = d === todayDow;
                  return (
                    <button
                      key={d}
                      data-testid={`btn-free-mode-day-${d}`}
                      type="button"
                      onClick={() => toggleDay(d)}
                      disabled={freeMode}
                      className={`w-11 py-1.5 rounded font-mono text-xs font-bold border transition-colors
                        ${freeMode ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
                        ${selected && !freeMode ? "bg-green-500 border-green-500 text-white" : "bg-white border-gray-300 text-gray-600 hover:border-green-400"}
                        ${isToday && !selected ? "ring-1 ring-yellow-400" : ""}
                        ${isToday && selected ? "ring-1 ring-green-600" : ""}
                      `}
                    >
                      {label}
                      {isToday && <span className="block text-[8px] leading-none mt-0.5 opacity-70">today</span>}
                    </button>
                  );
                })}
              </div>
              {freeMode && (
                <p className="mt-1.5 font-mono text-[10px] text-gray-400">Schedule is inactive — Always On overrides it.</p>
              )}
            </div>

            {/* ── Status banner ── */}
            {effectivelyActive && (
              <div className="mt-3 px-3 py-2.5 rounded-lg bg-green-100 border border-green-300 text-green-800 text-xs leading-relaxed">
                <strong>Free Mode is active{freeMode ? " (Always On)" : " (scheduled day)"}.</strong> All callers skip membership checks and go straight to the main menu. Remember to save to apply changes.
              </div>
            )}
            {!effectivelyActive && freeModeScheduleDays.length > 0 && (
              <div className="mt-3 px-3 py-2.5 rounded-lg bg-yellow-50 border border-yellow-300 text-yellow-800 text-xs leading-relaxed">
                <strong>Schedule set.</strong> Free mode will activate automatically on: {freeModeScheduleDays.sort().map(d => DAY_LABELS[d]).join(", ")}. Save to apply.
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Billing Mode ─────────────────────────────────────────────────────── */}
      <div className={C.card}>
        <h3 className="text-gray-800 font-mono text-sm font-bold tracking-widest uppercase mb-1">Billing Mode</h3>
        <p className="text-gray-400 font-mono text-xs mb-4">
          Controls how member time is consumed. Choose one mode and save — it applies to every caller.
        </p>
        <div className="flex gap-3">
          <button
            data-testid="btn-billing-mode-per-minute"
            type="button"
            onClick={() => setBillingMode("per_minute")}
            className={`flex-1 flex items-start gap-3 px-4 py-3.5 rounded-lg border text-sm transition-colors ${billingMode === "per_minute" ? "border-[#f5a623] bg-amber-50" : "border-gray-200 bg-gray-50 hover:border-gray-300"}`}
          >
            <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${billingMode === "per_minute" ? "border-[#f5a623] bg-[#f5a623]" : "border-gray-300"}`}>
              {billingMode === "per_minute" && <span className="w-2 h-2 rounded-full bg-white" />}
            </span>
            <div className="text-left">
              <div className={`font-mono font-bold tracking-widest uppercase text-xs ${billingMode === "per_minute" ? "text-amber-700" : "text-gray-500"}`}>Per Minute</div>
              <div className="text-xs font-normal text-gray-500 mt-1 leading-snug">
                Time is deducted from the member's balance during active calls only. Calls are free if balance hits zero.
              </div>
            </div>
          </button>
          <button
            data-testid="btn-billing-mode-per-day"
            type="button"
            onClick={() => setBillingMode("per_day")}
            className={`flex-1 flex items-start gap-3 px-4 py-3.5 rounded-lg border text-sm transition-colors ${billingMode === "per_day" ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-gray-50 hover:border-gray-300"}`}
          >
            <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${billingMode === "per_day" ? "border-blue-400 bg-blue-400" : "border-gray-300"}`}>
              {billingMode === "per_day" && <span className="w-2 h-2 rounded-full bg-white" />}
            </span>
            <div className="text-left">
              <div className={`font-mono font-bold tracking-widest uppercase text-xs ${billingMode === "per_day" ? "text-blue-700" : "text-gray-500"}`}>Per Day</div>
              <div className="text-xs font-normal text-gray-500 mt-1 leading-snug">
                One day is deducted from every active member's balance at 11:59 PM nightly. Calls are always free — no per-minute tracking.
              </div>
            </div>
          </button>
          <button
            data-testid="btn-billing-mode-per-24h"
            type="button"
            onClick={() => setBillingMode("per_24h")}
            className={`flex-1 flex items-start gap-3 px-4 py-3.5 rounded-lg border text-sm transition-colors ${billingMode === "per_24h" ? "border-purple-400 bg-purple-50" : "border-gray-200 bg-gray-50 hover:border-gray-300"}`}
          >
            <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${billingMode === "per_24h" ? "border-purple-400 bg-purple-400" : "border-gray-300"}`}>
              {billingMode === "per_24h" && <span className="w-2 h-2 rounded-full bg-white" />}
            </span>
            <div className="text-left">
              <div className={`font-mono font-bold tracking-widest uppercase text-xs ${billingMode === "per_24h" ? "text-purple-700" : "text-gray-500"}`}>24-Hour Pass</div>
              <div className="text-xs font-normal text-gray-500 mt-1 leading-snug">
                Access expires 24 hours after purchase, regardless of call time. Callers hear hours remaining at entry. No per-minute deduction.
              </div>
            </div>
          </button>
        </div>
        {billingMode === "per_day" && (
          <div className="mt-3 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs leading-relaxed">
            <strong>How per-day works:</strong> Each plan's "minutes" value represents how many days a member gets
            (1,440 min = 1 day, 14,400 min = 10 days, 43,200 min = 30 days). New members are protected by a
            24-hour grace period — the first deduction doesn't happen until a full day after purchase,
            even if they buy late at night.
          </div>
        )}
        {billingMode === "per_24h" && (
          <div className="mt-3 px-3 py-2.5 rounded-lg bg-purple-50 border border-purple-200 text-purple-800 text-xs leading-relaxed">
            <strong>How 24-hour pass works:</strong> Each purchase starts a 24-hour countdown from the moment of payment. Callers hear "Your backdoor access pass expires in X hours" when they call in. Upload 24 audio files named <code>backdoor_expires_1hr.mp3</code> through <code>backdoor_expires_24hr.mp3</code> via the Audio Manager for the best caller experience.
          </div>
        )}
      </div>

      {/* ── Free Trial ───────────────────────────────────────────────────────── */}
      <div className={C.card}>
        <h3 className="text-gray-800 font-mono text-sm font-bold tracking-widest uppercase mb-1">Free Trial</h3>
        <p className="text-gray-400 font-mono text-xs mb-3">
          {billingMode === "per_day"
            ? "Minutes granted to first-time callers. In per-day mode, 1,440 min = 1 free day."
            : "Minutes of call time granted automatically to first-time callers with no membership."}
        </p>
        <div className="max-w-xs">
          <label className={C.label}>Free Trial Minutes</label>
          <input
            data-testid="input-free-trial-minutes"
            type="number" min="1"
            value={freeTrialMinutes}
            onChange={e => setFreeTrialMinutes(e.target.value)}
            className={C.input}
            placeholder="90"
          />
          {(parseInt(freeTrialMinutes) || 0) > 0 && (
            <p className="mt-1.5 font-mono text-xs text-gray-400">
              = {fmtMinutes(parseInt(freeTrialMinutes) || 0)} of free access
            </p>
          )}
        </div>
      </div>

      {/* ── Membership Plans ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div>
          <h3 className="text-gray-700 font-mono text-sm font-bold tracking-widest uppercase">Membership Plans</h3>
          <p className="text-gray-400 font-mono text-xs mt-1">
            {billingMode === "per_day"
              ? "Set how many days each plan provides. Use multiples of 1,440 min (= 1 day). Callers press 1, 2, or 3 to select."
              : "Set how many minutes each plan provides. Callers press 1, 2, or 3 to select."}
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map(plan => {
            const mins = parseInt(plan.minutes) || 0;
            const doubleMins = mins * 2;
            return (
              <div key={plan.label} className={C.card}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-gray-900 font-mono text-sm font-bold tracking-widest uppercase">{plan.label}</h4>
                  <span className={`${C.badge} border-amber-200 bg-amber-50 text-amber-700`}>{plan.keyBadge}</span>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className={C.label}>Plan Name</label>
                    <input
                      data-testid={`input-${plan.testPrefix}-name`}
                      type="text" value={plan.name}
                      onChange={e => plan.setName(e.target.value)}
                      placeholder="e.g. Premium"
                      className={C.input}
                    />
                  </div>
                  <div>
                    <label className={C.label}>{billingMode === "per_day" ? "Minutes (1,440 = 1 day)" : "Minutes"}</label>
                    <input
                      data-testid={`input-${plan.testPrefix}-minutes`}
                      type="number" min="1"
                      value={plan.minutes}
                      onChange={e => plan.setMinutes(e.target.value)}
                      placeholder={billingMode === "per_day" ? "43200" : "43200"}
                      className={C.input}
                    />
                    {mins > 0 && (
                      <p className="mt-1 font-mono text-xs text-gray-400">= {fmtMinutes(mins)}</p>
                    )}
                  </div>
                  <div>
                    <label className={C.label}>Price (USD)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-sm">$</span>
                      <input
                        data-testid={`input-${plan.testPrefix}-price`}
                        type="number" min="0" step="0.01"
                        value={plan.price}
                        onChange={e => plan.setPrice(e.target.value)}
                        placeholder="25.00"
                        className={C.input + " pl-7"}
                      />
                    </div>
                  </div>
                </div>
                <div className="pt-3 border-t border-gray-100 space-y-2 mt-3">
                  <button
                    data-testid={`btn-bonus-${plan.testPrefix}`}
                    type="button"
                    onClick={() => setBonusPlanKey(bonusPlanKey === plan.planKey ? null : plan.planKey)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded border text-xs font-mono tracking-widest uppercase transition-colors ${bonusPlanKey === plan.planKey ? "border-[#f5a623] bg-amber-50 text-amber-700" : "border-gray-200 bg-gray-50 text-gray-400 hover:border-gray-300 hover:text-gray-500"}`}
                  >
                    <span>First-time buyer bonus</span>
                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${bonusPlanKey === plan.planKey ? "border-[#f5a623] bg-[#f5a623]" : "border-gray-300"}`}>
                      {bonusPlanKey === plan.planKey && <span className="w-2 h-2 rounded-full bg-white" />}
                    </span>
                  </button>
                  {bonusPlanKey === plan.planKey && (
                    <p className="text-amber-600 font-mono text-xs">
                      First-time buyers get double — {fmtMinutes(doubleMins)} for the price of {fmtMinutes(mins)}.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Stripe Webhook Setup ─────────────────────────────────────────────── */}
      <div className={C.card}>
        <h3 className="text-gray-800 font-mono text-sm font-bold tracking-widest uppercase mb-1">Stripe Webhook Setup</h3>
        <p className="text-gray-400 font-mono text-xs mb-4">
          Paste this URL into your Stripe Dashboard under <strong className="text-gray-500">Developers → Webhooks → Add endpoint</strong>.
          After creating the endpoint, copy the generated Signing Secret and save it as{" "}
          <code className="bg-gray-100 px-1 rounded text-gray-600">STRIPE_WEBHOOK_SECRET</code> in your environment secrets.
        </p>
        <div>
          <label className={C.label}>Stripe Webhook URL</label>
          <div className="flex items-center gap-2">
            <code
              data-testid="text-stripe-webhook-url"
              className="flex-1 font-mono text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-700 break-all select-all"
            >
              {typeof window !== "undefined" ? window.location.origin : ""}/api/stripe/webhook
            </code>
            <button
              type="button"
              data-testid="btn-copy-stripe-webhook"
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/api/stripe/webhook`);
                toast({ title: "Webhook URL copied to clipboard" });
              }}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors font-mono text-xs"
            >
              <Copy size={13} />
              Copy
            </button>
          </div>
          <p className="mt-2 font-mono text-xs text-gray-400 leading-relaxed">
            Recommended Stripe events:{" "}
            <code className="bg-gray-100 px-1 rounded text-gray-600">checkout.session.completed</code>,{" "}
            <code className="bg-gray-100 px-1 rounded text-gray-600">payment_intent.succeeded</code>.
          </p>
        </div>
      </div>

      {/* ── PayPal Setup ─────────────────────────────────────────────────────── */}
      <div className={C.card}>
        <div className="flex items-center gap-2 mb-1">
          <CreditCard size={14} className="text-blue-500" />
          <h3 className="text-gray-800 font-mono text-sm font-bold tracking-widest uppercase">PayPal Setup</h3>
        </div>
        <p className="text-gray-400 font-mono text-xs mb-4 leading-relaxed">
          Enable PayPal as a payment method on the membership page. Enter your PayPal business email below, then
          configure your PayPal account to send IPN notifications to the URL shown below.
        </p>

        {/* PayPal Business Email */}
        <div className="mb-4">
          <label className={C.label}>PayPal Business Email</label>
          <input
            data-testid="input-paypal-email"
            type="email"
            value={paypalEmail}
            onChange={e => setPaypalEmail(e.target.value)}
            placeholder="payments@yourdomain.com"
            className={C.input}
          />
          <p className="mt-1 font-mono text-xs text-gray-400">
            The email address associated with your PayPal Business account. Leave blank to disable PayPal.
          </p>
        </div>

        {/* Sandbox toggle */}
        <div className="mb-5">
          <button
            data-testid="btn-paypal-sandbox-toggle"
            type="button"
            onClick={() => setPaypalSandbox(v => !v)}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm transition-colors ${paypalSandbox ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-gray-50 hover:border-gray-300"}`}
          >
            <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${paypalSandbox ? "border-amber-500 bg-amber-500" : "border-gray-300"}`}>
              {paypalSandbox && <span className="w-2 h-2 rounded-full bg-white" />}
            </span>
            <div className="text-left">
              <div className={`font-mono font-bold tracking-widest uppercase text-xs ${paypalSandbox ? "text-amber-700" : "text-gray-500"}`}>
                Sandbox Mode {paypalSandbox ? "(ON)" : "(OFF)"}
              </div>
              <div className="text-xs font-normal text-gray-500 mt-0.5">
                Enable for testing with PayPal Sandbox accounts. Disable for live payments.
              </div>
            </div>
          </button>
        </div>

        {/* IPN URL */}
        <div>
          <label className={C.label}>PayPal IPN URL</label>
          <div className="flex items-center gap-2">
            <code
              data-testid="text-paypal-ipn-url"
              className="flex-1 font-mono text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-700 break-all select-all"
            >
              {typeof window !== "undefined" ? window.location.origin : ""}/api/paypal/ipn
            </code>
            <button
              type="button"
              data-testid="btn-copy-paypal-ipn"
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/api/paypal/ipn`);
                toast({ title: "PayPal IPN URL copied to clipboard" });
              }}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors font-mono text-xs"
            >
              <Copy size={13} />
              Copy
            </button>
          </div>
          <div className="mt-3 px-3 py-3 rounded-lg bg-blue-50 border border-blue-200 space-y-1.5">
            <p className="font-mono text-xs font-bold text-blue-800 tracking-widest uppercase">PayPal IPN Setup Steps</p>
            <ol className="list-decimal list-inside space-y-1 text-blue-700 text-xs leading-relaxed">
              <li>Log in to your PayPal Business account</li>
              <li>Go to <strong>Account Settings → Notifications → Instant payment notifications</strong></li>
              <li>Click <strong>Update</strong> and enter the IPN URL above</li>
              <li>Set <strong>IPN messages</strong> to <em>Receive IPN messages (Enabled)</em></li>
              <li>Save. PayPal will now notify this server when payments complete.</li>
            </ol>
          </div>
        </div>
      </div>

      {/* ── Save ─────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <p className="font-mono text-xs text-gray-400">
          Changes take effect immediately after saving.
        </p>
        <button
          data-testid="btn-save-membership-settings"
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#f5a623] hover:bg-amber-500 text-white font-mono font-bold text-xs tracking-widest uppercase transition-colors disabled:opacity-60"
        >
          {saveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Settings size={13} />}
          {saveMutation.isPending ? "Saving…" : "Save Settings"}
        </button>
      </div>

    </div>
  );
}

// ── DashboardTab ──────────────────────────────────────────────────────────────
const MAILBOX_CATEGORY_LABELS: Record<string, string> = {
  quick_hot_talk: "Quick Hot Talk",
  bicurious: "Bi-Curious",
  kink: "Kink",
  total_tops: "Total Tops",
  strictly_bottoms: "Strictly Bottoms",
  trans: "Trans",
  cock_suckers: "Cock Suckers",
  hung_cocks: "Hung Cocks",
  uncut_cocks: "Uncut Cocks",
  twinks: "Twinks",
  bears: "Bears",
  daddys: "Daddys",
  // legacy slug still in DB
  total_top_strictly_bottoms: "Total Tops / Strict Bottoms",
};

interface MailboxStats {
  total: number;
  byCategory: { category: string | null; count: number }[];
}

function DashboardTab() {
  const { data: stats } = useQuery<{ users: number; profiles: number; messages: number; activeCalls: number }>({
    queryKey: ["/api/stats"],
    refetchInterval: 5000,
  });

  const { data: siteData } = useQuery<{ siteCategory: string }>({
    queryKey: ["/api/site-settings"],
    staleTime: 5 * 60 * 1000,
  });

  const isMM = (siteData?.siteCategory ?? "MM") === "MM";

  const { data: mailboxStats } = useQuery<MailboxStats>({
    queryKey: ["/api/admin/mailbox-stats"],
    enabled: isMM,
    refetchInterval: 30000,
  });

  const items = [
    { label: "Live on the Line", value: stats?.activeCalls ?? 0, icon: <PhoneCall size={18} className="text-emerald-500" /> },
    { label: "Registered Users", value: stats?.users ?? 0, icon: <Phone size={18} className="text-[#f5a623]" /> },
    { label: "Voice Profiles", value: stats?.profiles ?? 0, icon: <Volume2 size={18} className="text-[#f5a623]" /> },
    { label: "Messages Relayed", value: stats?.messages ?? 0, icon: <MessageSquare size={18} className="text-emerald-500" /> },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map(item => (
          <div key={item.label} className="border border-gray-200 rounded-xl p-5 bg-white hover:border-gray-300 transition-colors">
            <div className="flex items-center justify-between mb-3">
              {item.icon}
            </div>
            <div className={C.statValue}>{String(item.value).padStart(4, "0")}</div>
            <div className={C.statLabel}>{item.label}</div>
          </div>
        ))}
      </div>

      {isMM && (
        <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag size={15} className="text-[#f5a623]" />
              <span className="font-mono font-bold text-sm tracking-widest uppercase text-gray-800">Mailboxes &amp; Personal Ads</span>
            </div>
            <span className="font-mono text-xs text-gray-400">
              {mailboxStats ? `${mailboxStats.total.toLocaleString()} total` : "—"}
            </span>
          </div>
          <div className="p-5">
            {!mailboxStats ? (
              <div className="flex items-center gap-2 text-gray-400 font-mono text-xs py-4 justify-center">
                <Loader2 size={13} className="animate-spin" /> Loading…
              </div>
            ) : mailboxStats.total === 0 ? (
              <div className="text-gray-400 font-mono text-xs text-center py-4">No mailboxes registered yet.</div>
            ) : (
              <div className="space-y-3">
                {/* Total bar */}
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-gray-500 w-44 shrink-0">All Categories</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className="bg-[#f5a623] h-2 rounded-full w-full" />
                  </div>
                  <span className="font-mono text-xs font-bold text-gray-800 w-8 text-right">{mailboxStats.total}</span>
                </div>
                <div className="border-t border-gray-100 pt-3 space-y-2.5">
                  {mailboxStats.byCategory.map(row => {
                    const label = row.category
                      ? (MAILBOX_CATEGORY_LABELS[row.category] ?? row.category)
                      : "Uncategorised";
                    const pct = mailboxStats.total > 0 ? (row.count / mailboxStats.total) * 100 : 0;
                    return (
                      <div key={row.category ?? "null"} className="flex items-center gap-3" data-testid={`stat-category-${row.category ?? "null"}`}>
                        <span className="font-mono text-xs text-gray-500 w-44 shrink-0 truncate">{label}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                          <div
                            className="bg-blue-400 h-1.5 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs text-gray-600 w-8 text-right">{row.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Messages Tab ──────────────────────────────────────────────────────────────
interface MessageEntry {
  id: string;
  fromPhone: string;
  toPhone: string;
  recordingUrl: string;
  isRead: boolean | null;
  createdAt: string | null;
}

function MessagesTab() {
  const [search, setSearch] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { data: msgs = [], isLoading } = useQuery<MessageEntry[]>({
    queryKey: ["/api/admin/messages"],
  });

  const filtered = msgs.filter(m =>
    m.fromPhone.includes(search) || m.toPhone.includes(search)
  );

  function fmtDate(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  }

  function togglePlay(msg: MessageEntry) {
    if (playingId === msg.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(msg.recordingUrl);
    audio.onended = () => setPlayingId(null);
    audio.play();
    audioRef.current = audio;
    setPlayingId(msg.id);
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <input
          data-testid="input-messages-search"
          type="text"
          placeholder="Filter by phone number…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-200 rounded px-3 py-1.5 font-mono text-xs bg-white text-gray-700 focus:outline-none w-64"
        />
        <span className="text-gray-400 font-mono text-xs">
          {filtered.length} message{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-400 font-mono text-xs py-10 justify-center">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-400 font-mono text-xs text-center py-16">
          {search ? "No matches found." : "No messages on record yet."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-100">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-gray-500 uppercase tracking-widest">
                <th className="text-left px-4 py-3">From</th>
                <th className="text-left px-4 py-3">To</th>
                <th className="text-left px-4 py-3">Sent</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Play</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((msg, i) => (
                <tr
                  key={msg.id}
                  data-testid={`row-message-${i}`}
                  className="border-b border-gray-50 last:border-0 hover:bg-amber-50 transition-colors"
                >
                  <td className="px-4 py-3 text-gray-600" data-testid={`text-msg-from-${i}`}>{msg.fromPhone}</td>
                  <td className="px-4 py-3 text-gray-800 font-semibold" data-testid={`text-msg-to-${i}`}>{msg.toPhone}</td>
                  <td className="px-4 py-3 text-gray-400">{fmtDate(msg.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span
                      data-testid={`status-msg-read-${i}`}
                      className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-semibold ${
                        msg.isRead
                          ? "bg-green-50 text-green-600"
                          : "bg-amber-50 text-amber-600"
                      }`}
                    >
                      {msg.isRead ? "Read" : "Unread"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      data-testid={`btn-play-msg-${i}`}
                      onClick={() => togglePlay(msg)}
                      className="inline-flex items-center gap-1.5 text-xs font-mono text-amber-600 hover:text-amber-800 border border-amber-200 hover:border-amber-400 rounded px-2 py-1 transition-colors"
                    >
                      {playingId === msg.id
                        ? <><Pause size={11} /> Stop</>
                        : <><Play size={11} /> Play</>
                      }
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Website Settings Tab ───────────────────────────────────────────────────
interface SiteSettingsData {
  siteName: string;
  fallbackPhoneNumber: string;
  customerServiceEmail: string | null;
  customerServicePhone: string | null;
  siteCategory: string;
}

function SiteLabelRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-6 items-start py-5 border-b border-gray-100 last:border-0">
      <div className="sm:pt-1">
        <p className="text-sm font-semibold text-gray-700">{label}</p>
        {hint && <p className="text-xs text-gray-400 mt-0.5 leading-snug">{hint}</p>}
      </div>
      <div className="sm:col-span-2">{children}</div>
    </div>
  );
}

function WebsiteSettingsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<SiteSettingsData>({
    queryKey: ["/api/admin/site-settings"],
  });

  const [siteName, setSiteName] = useState("");
  const [fallbackPhone, setFallbackPhone] = useState("");
  const [csEmail, setCsEmail] = useState("");
  const [csPhone, setCsPhone] = useState("");
  const [siteCategory, setSiteCategory] = useState("MM");
  const [initialized, setInitialized] = useState(false);

  if (!initialized && data) {
    setSiteName(data.siteName);
    setFallbackPhone(data.fallbackPhoneNumber);
    setCsEmail(data.customerServiceEmail ?? "");
    setCsPhone(data.customerServicePhone ?? "");
    setSiteCategory(data.siteCategory ?? "MM");
    setInitialized(true);
  }

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/admin/site-settings", {
        siteName,
        fallbackPhoneNumber: fallbackPhone,
        customerServiceEmail: csEmail || null,
        customerServicePhone: csPhone || null,
        siteCategory,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/site-settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/site-settings"] });
      toast({ title: "Saved", description: "Website settings updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h2 className="text-base font-semibold text-gray-900 mb-1">Website Settings</h2>
      <p className="text-sm text-gray-500 mb-6">These values control how your public-facing site appears and how callers can reach support.</p>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-2">
          <SiteLabelRow label="Site Name" hint="Shown in the browser tab, header, and footer.">
            <input
              type="text"
              value={siteName}
              onChange={e => setSiteName(e.target.value)}
              placeholder="Male Box"
              data-testid="input-site-name"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </SiteLabelRow>

          <SiteLabelRow label="Fallback Phone Number" hint="Displayed when a caller's local number cannot be determined.">
            <input
              type="text"
              value={fallbackPhone}
              onChange={e => setFallbackPhone(e.target.value)}
              placeholder="800-730-2508"
              data-testid="input-fallback-phone"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </SiteLabelRow>

          <SiteLabelRow label="Customer Service Email" hint="If set, shown in the footer as a support contact. Leave blank to hide.">
            <input
              type="email"
              value={csEmail}
              onChange={e => setCsEmail(e.target.value)}
              placeholder="support@example.com"
              data-testid="input-cs-email"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </SiteLabelRow>

          <SiteLabelRow label="Customer Service Phone" hint="If set, shown on the public site as a support number. Leave blank to hide.">
            <input
              type="text"
              value={csPhone}
              onChange={e => setCsPhone(e.target.value)}
              placeholder="800-555-0100"
              data-testid="input-cs-phone"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </SiteLabelRow>

          <SiteLabelRow
            label="Site Category"
            hint="Sets the audience type for this system. MM = Men seeking Men (gay). MW = Men seeking Women (straight). Controls hero images and on-site language."
          >
            <select
              value={siteCategory}
              onChange={e => setSiteCategory(e.target.value)}
              data-testid="select-site-category"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="MM">MM — Men seeking Men (gay / bi)</option>
              <option value="MW">MW — Men seeking Women (straight)</option>
            </select>
          </SiteLabelRow>
        </div>
      </div>

      <div className="flex justify-end mt-5">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          data-testid="button-save-site-settings"
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
        >
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </button>
      </div>
    </div>
  );
}

function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-gray-300 font-mono text-xs tracking-widest uppercase">{label} — Coming Soon</div>
    </div>
  );
}

// ── IVR Tester Tab ────────────────────────────────────────────────────────────
interface IVRLogEntry {
  type: "say" | "play" | "keypress" | "system" | "record" | "conference" | "hangup" | "pay";
  content: string;
  text?: string;
  ts: number;
}

// ── colour tokens for the dark-navy phone-tester UI ──────────────────────────
const PT = {
  bg:        "#0d1424",
  card:      "#131d30",
  cardBorder:"#1e2d47",
  keyBg:     "#1a2540",
  keyBorder: "#2a3d5e",
  keyText:   "#8fa3c8",
  keyHover:  "#22345a",
  purple:    "#6c42c9",
  purpleHov: "#7c52d9",
  green:     "#22c55e",
  greenHov:  "#16a34a",
  red:       "#ef4444",
  logBg:     "#0b1120",
  logBorder: "#1a2a42",
  dimText:   "#4a6080",
  mutedText: "#6b84a8",
};

function formatElapsed(cs: number): string {
  const totalSec  = Math.floor(cs / 100);
  const cents     = cs % 100;
  const mins      = Math.floor(totalSec / 60);
  const secs      = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}.${cents.toString().padStart(2, "0")}`;
}

function IVRTesterTab() {
  const { toast } = useToast();
  const logEndRef   = useRef<HTMLDivElement>(null);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const [fromNumber,         setFromNumber]         = useState("+19999999999");
  const [sessionId,          setSessionId]          = useState<string | null>(null);
  const [log,                setLog]                = useState<IVRLogEntry[]>([]);
  const [connected,          setConnected]          = useState(false);
  const [ended,              setEnded]              = useState(false);
  const [waitingForInput,    setWaitingForInput]    = useState(false);
  const [waitingForRecording,setWaitingForRecording]= useState(false);
  const [numDigits,          setNumDigits]          = useState<number | null>(null);
  const [digitBuffer,        setDigitBuffer]        = useState("");
  const [loading,            setLoading]            = useState(false);
  const [elapsed,            setElapsed]            = useState(0); // centiseconds

  // Audio queue
  const audioQueue   = useRef<IVRLogEntry[]>([]);
  const audioPlaying = useRef(false);
  const currentAudio = useRef<HTMLAudioElement | null>(null);

  // ── Timer ────────────────────────────────────────────────────────────────
  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 10);
  }
  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }
  useEffect(() => () => stopTimer(), []);

  // ── Audio ─────────────────────────────────────────────────────────────────
  function stopAudio() {
    if (currentAudio.current) { currentAudio.current.pause(); currentAudio.current = null; }
    window.speechSynthesis?.cancel();
    audioQueue.current   = [];
    audioPlaying.current = false;
  }

  function processAudioQueue() {
    if (audioPlaying.current || audioQueue.current.length === 0) return;
    const entry = audioQueue.current.shift()!;
    audioPlaying.current = true;

    // Reveal this entry in the log exactly when it starts playing
    setLog(prev => [...prev, entry]);
    scrollToBottom();

    if (entry.type === "play" && entry.content.startsWith("/")) {
      const audio = new Audio(entry.content);
      currentAudio.current = audio;
      audio.onended = () => { audioPlaying.current = false; currentAudio.current = null; processAudioQueue(); };
      audio.onerror = () => { audioPlaying.current = false; currentAudio.current = null; processAudioQueue(); };
      audio.play().catch(() => { audioPlaying.current = false; processAudioQueue(); });
    } else if (entry.type === "say" && entry.content && window.speechSynthesis) {
      const utt = new SpeechSynthesisUtterance(entry.content);
      utt.rate = 0.92;
      utt.onend  = () => { audioPlaying.current = false; processAudioQueue(); };
      utt.onerror = () => { audioPlaying.current = false; processAudioQueue(); };
      window.speechSynthesis.speak(utt);
    } else {
      audioPlaying.current = false;
      processAudioQueue();
    }
  }

  function enqueueAudio(entries: IVRLogEntry[]) {
    // Only queue audio entries — they reveal themselves one-by-one as each plays
    for (const e of entries) {
      if (e.type === "say" || e.type === "play") audioQueue.current.push(e);
    }
    processAudioQueue();
  }

  function scrollToBottom() {
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
  }

  // ── Apply API result ─────────────────────────────────────────────────────
  function applyResult(result: {
    entries: IVRLogEntry[];
    status: string;
    waitingForInput: boolean;
    waitingForRecording: boolean;
    numDigits: number | null;
  }) {
    // Non-audio entries (system messages, keypress, record, hangup, etc.) appear immediately.
    // Audio entries (play, say) are revealed one-at-a-time via processAudioQueue as each plays.
    const immediate = result.entries.filter(e => e.type !== "play" && e.type !== "say");
    if (immediate.length > 0) setLog(prev => [...prev, ...immediate]);
    setWaitingForInput(result.waitingForInput);
    setWaitingForRecording(result.waitingForRecording ?? false);
    setNumDigits(result.numDigits);
    if (result.status === "ended") {
      setEnded(true);
      setConnected(false);
      stopTimer();
    }
    enqueueAudio(result.entries);
    scrollToBottom();
  }

  // ── Connect / Disconnect ─────────────────────────────────────────────────
  async function handleConnect() {
    if (loading) return;
    stopAudio();
    stopTimer();
    setLoading(true);
    setLog([]);
    setDigitBuffer("");
    setEnded(false);
    setWaitingForInput(false);
    setWaitingForRecording(false);
    setNumDigits(null);
    try {
      const res = await fetch("/api/ivr-tester/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromNumber: fromNumber.trim() || "+19999999999" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSessionId(data.sessionId);
      setConnected(true);
      startTimer();
      applyResult(data);
    } catch (err: any) {
      toast({ title: "Connection failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    stopAudio();
    stopTimer();
    if (sessionId) {
      try { await fetch(`/api/ivr-tester/${sessionId}`, { method: "DELETE" }); } catch { /* best effort */ }
    }
    setLog(prev => [...prev, { type: "hangup", content: "Disconnected by admin.", ts: Date.now() }]);
    setConnected(false);
    setEnded(true);
    setSessionId(null);
    setWaitingForInput(false);
    setWaitingForRecording(false);
    setDigitBuffer("");
    scrollToBottom();
  }

  // ── Send Digits ──────────────────────────────────────────────────────────
  async function sendDigits(digits: string) {
    if (!sessionId || !connected || ended || loading) return;

    // Stop whatever is currently playing before sending the new input
    stopAudio();

    let toSend = digits;
    if (numDigits && numDigits > 1) {
      const next = digitBuffer + digits;
      setDigitBuffer(next);
      setLog(prev => [...prev, { type: "keypress", content: digits, ts: Date.now() }]);
      scrollToBottom();
      if (next.length < numDigits) return;
      toSend = next;
      setDigitBuffer("");
    }

    setLoading(true);
    try {
      const res = await fetch("/api/ivr-tester/input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, digits: toSend }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      applyResult(data);
    } catch (err: any) {
      toast({ title: "Input failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  // ── Keyboard listener ────────────────────────────────────────────────────
  const canType = connected && !ended && waitingForInput && !loading;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!canType) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (/^[0-9*#]$/.test(k)) { e.preventDefault(); sendDigits(k); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canType, sessionId, connected, ended, loading, numDigits, digitBuffer]);

  // ── Keys layout ──────────────────────────────────────────────────────────
  const keys = ["1","2","3","4","5","6","7","8","9","*","0","#"];
  const keySub: Record<string,string> = {
    "1":"","2":"ABC","3":"DEF","4":"GHI","5":"JKL","6":"MNO",
    "7":"PQRS","8":"TUV","9":"WXYZ","*":"","0":"+","#":"",
  };

  const showBuffer = numDigits && numDigits > 1 && digitBuffer.length > 0;

  // ── Log helpers ──────────────────────────────────────────────────────────
  function getFilename(path: string): string {
    return path.split("/").pop() ?? path;
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const dialerCardStyle: React.CSSProperties = {
    background: PT.card, border: `1px solid ${PT.cardBorder}`,
    borderRadius: 16, padding: "1.5rem 1.25rem", display: "flex",
    flexDirection: "column", gap: "1rem",
  };

  return (
    <div style={{ background: PT.bg, minHeight: "100%", padding: "1.5rem", display: "flex", gap: "1.25rem", alignItems: "flex-start" }}>

      {/* ── Left: Dialer ─────────────────────────────────────────────────── */}
      <div style={{ width: 310, flexShrink: 0, ...dialerCardStyle }}>

        {/* Timer */}
        <div style={{ textAlign: "center", paddingTop: "0.5rem" }}>
          <div style={{ fontFamily: "monospace", fontSize: "2.6rem", fontWeight: 300, color: connected ? "#c8d8f0" : PT.dimText, letterSpacing: "0.06em", lineHeight: 1 }}>
            {formatElapsed(elapsed)}
          </div>
          <div style={{ fontSize: "0.72rem", color: PT.mutedText, marginTop: "0.4rem" }}>
            {connected
              ? waitingForRecording
                ? "Recording prompt active — press Play Greeting to skip"
                : waitingForInput
                  ? "Waiting for your input…"
                  : loading ? "Processing…" : "On the line"
              : ended
                ? "Call ended"
                : "Ready — press Start when your call connects"}
          </div>
        </div>

        {/* Caller number input (only when not connected) */}
        {!connected && (
          <input
            data-testid="input-ivr-from-number"
            type="tel"
            value={fromNumber}
            onChange={e => setFromNumber(e.target.value)}
            placeholder="+19999999999"
            style={{
              width: "100%", boxSizing: "border-box", background: PT.keyBg,
              border: `1px solid ${PT.keyBorder}`, borderRadius: 8, padding: "0.5rem 0.75rem",
              fontFamily: "monospace", fontSize: "0.82rem", color: "#aabbd4",
              outline: "none", textAlign: "center",
            }}
          />
        )}

        {/* Digit buffer */}
        {showBuffer && (
          <div style={{ background: "#1a1a00", border: "1px solid #5a5200", borderRadius: 8, padding: "0.5rem", textAlign: "center", fontFamily: "monospace" }}>
            <span style={{ fontSize: "1.5rem", letterSpacing: "0.15em", color: "#f5d020" }}>{digitBuffer}</span>
            <span style={{ color: "#f5d020", opacity: 0.5 }} className="animate-pulse">_</span>
            <div style={{ fontSize: "0.68rem", color: "#a09000", marginTop: 2 }}>
              {numDigits! - digitBuffer.length} more digit{numDigits! - digitBuffer.length !== 1 ? "s" : ""}
            </div>
          </div>
        )}

        {/* Keypad */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
          {keys.map(k => (
            <button
              key={k}
              data-testid={`btn-ivr-key-${k}`}
              onClick={() => sendDigits(k)}
              disabled={!canType}
              style={{
                background: canType ? PT.keyBg : "#111826",
                border: `1px solid ${canType ? PT.keyBorder : "#151e2d"}`,
                borderRadius: 10, padding: "0.8rem 0.25rem",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                cursor: canType ? "pointer" : "not-allowed",
                transition: "background 0.12s, border-color 0.12s, transform 0.08s",
                userSelect: "none",
              }}
              onMouseEnter={e => { if (canType) { e.currentTarget.style.background = PT.keyHover; e.currentTarget.style.borderColor = "#3a5a8a"; } }}
              onMouseLeave={e => { e.currentTarget.style.background = canType ? PT.keyBg : "#111826"; e.currentTarget.style.borderColor = canType ? PT.keyBorder : "#151e2d"; }}
              onMouseDown={e => { if (canType) e.currentTarget.style.transform = "scale(0.93)"; }}
              onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
            >
              <span style={{ fontFamily: "monospace", fontSize: "1.4rem", fontWeight: 400, color: canType ? "#c5d9f0" : PT.dimText, lineHeight: 1 }}>{k}</span>
              {keySub[k] && <span style={{ fontSize: "0.55rem", color: PT.dimText, marginTop: 2, letterSpacing: "0.12em" }}>{keySub[k]}</span>}
            </button>
          ))}
        </div>

        {/* Play Greeting / Bypass button */}
        <button
          data-testid="btn-ivr-play-greeting"
          onClick={() => {
            if (waitingForRecording && connected) {
              sendDigits("#"); // bypass recording — any key triggers submission of empty recording
            }
          }}
          disabled={!connected || ended || (!waitingForRecording)}
          style={{
            width: "100%", padding: "0.8rem",
            background: waitingForRecording ? PT.purple : "#1e2d47",
            border: `1px solid ${waitingForRecording ? "#8f62e8" : PT.keyBorder}`,
            borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
            gap: "0.5rem", cursor: waitingForRecording ? "pointer" : "default",
            transition: "background 0.15s",
          }}
          onMouseEnter={e => { if (waitingForRecording) e.currentTarget.style.background = PT.purpleHov; }}
          onMouseLeave={e => { e.currentTarget.style.background = waitingForRecording ? PT.purple : "#1e2d47"; }}
        >
          <Wand2 size={16} style={{ color: waitingForRecording ? "#e0d0ff" : PT.dimText }} />
          <span style={{ fontFamily: "monospace", fontSize: "0.85rem", fontWeight: 600, color: waitingForRecording ? "#e0d0ff" : PT.dimText, letterSpacing: "0.04em" }}>
            {waitingForRecording ? "Skip Recording →" : "Play Greeting"}
          </span>
        </button>

        {/* Start / End button */}
        {!connected ? (
          <button
            data-testid="btn-ivr-connect"
            onClick={handleConnect}
            disabled={loading}
            style={{
              width: "100%", padding: "0.85rem",
              background: loading ? "#145a2e" : PT.green,
              border: "none", borderRadius: 10,
              display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
              cursor: loading ? "not-allowed" : "pointer", transition: "background 0.15s",
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = PT.greenHov; }}
            onMouseLeave={e => { e.currentTarget.style.background = loading ? "#145a2e" : PT.green; }}
          >
            {loading
              ? <Loader2 size={17} style={{ color: "#fff", animation: "spin 1s linear infinite" }} />
              : <Phone size={17} style={{ color: "#fff" }} />}
            <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "0.9rem", color: "#fff", letterSpacing: "0.06em" }}>
              {loading ? "Connecting…" : "Start"}
            </span>
          </button>
        ) : (
          <button
            data-testid="btn-ivr-disconnect"
            onClick={handleDisconnect}
            style={{
              width: "100%", padding: "0.85rem",
              background: PT.red, border: "none", borderRadius: 10,
              display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
              cursor: "pointer", transition: "background 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#c53030"; }}
            onMouseLeave={e => { e.currentTarget.style.background = PT.red; }}
          >
            <PhoneCall size={17} style={{ color: "#fff" }} />
            <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "0.9rem", color: "#fff", letterSpacing: "0.06em" }}>End Call</span>
          </button>
        )}

        {/* Tip */}
        <p style={{ fontSize: "0.68rem", color: PT.dimText, textAlign: "center", margin: 0 }}>
          Tip: you can also use your keyboard (0–9, *, #) while connected
        </p>
      </div>

      {/* ── Right: Activity Log ───────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, background: PT.card, border: `1px solid ${PT.cardBorder}`, borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "0.9rem 1.1rem", borderBottom: `1px solid ${PT.logBorder}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Clock size={14} style={{ color: "#6b84a8" }} />
            <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "0.8rem", color: "#8fa3c8", letterSpacing: "0.08em" }}>Activity Log</span>
          </div>
          {log.length > 0 && (
            <button
              data-testid="btn-ivr-clear-log"
              onClick={() => setLog([])}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "monospace", fontSize: "0.68rem", color: PT.dimText, letterSpacing: "0.08em" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#8fa3c8")}
              onMouseLeave={e => (e.currentTarget.style.color = PT.dimText)}
            >CLEAR</button>
          )}
        </div>

        {/* Entries */}
        <div style={{ flex: 1, overflowY: "auto", background: PT.logBg, minHeight: 420, maxHeight: 620, padding: "0.75rem" }}>
          {log.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", minHeight: 300, color: PT.dimText }}>
              <Phone size={32} style={{ opacity: 0.25, marginBottom: "0.75rem" }} />
              <div style={{ fontFamily: "monospace", fontSize: "0.8rem", color: PT.mutedText }}>No activity yet</div>
              <div style={{ fontFamily: "monospace", fontSize: "0.7rem", color: PT.dimText, marginTop: "0.25rem" }}>Press Start once your call connects</div>
            </div>
          ) : (
            log.map((entry, i) => {
              const isKey = entry.type === "keypress";
              return (
                <div key={i} data-testid={`log-entry-${i}`}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: "0.5rem",
                    padding: "0.45rem 0.3rem", borderBottom: `1px solid ${PT.logBorder}`,
                    justifyContent: isKey ? "flex-end" : "flex-start",
                  }}>

                  {/* Left-aligned entries */}
                  {!isKey && (() => {
                    if (entry.type === "play") {
                      const filename = getFilename(entry.content);
                      return (
                        <>
                          <Play size={11} style={{ color: "#a78bfa", flexShrink: 0, marginTop: 3 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div>
                              <span style={{ fontFamily: "monospace", fontSize: "0.65rem", color: "#6b84a8", letterSpacing: "0.06em", marginRight: "0.4rem" }}>MP3</span>
                              <span style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "#c4b5fd", fontWeight: 600, wordBreak: "break-all" }}>
                                {filename}
                              </span>
                            </div>
                            {entry.text ? (
                              <div style={{ marginTop: "0.2rem", borderLeft: "2px solid #3a3060", paddingLeft: "0.4rem" }}>
                                <span style={{ fontFamily: "monospace", fontSize: "0.6rem", fontWeight: 700, color: "#7c5fa8", letterSpacing: "0.05em", marginRight: "0.3rem" }}>EXPECTED:</span>
                                <span style={{ fontFamily: "monospace", fontSize: "0.72rem", color: "#a89ec8", fontStyle: "italic" }}>{entry.text}</span>
                              </div>
                            ) : (
                              <div style={{ marginTop: "0.15rem", paddingLeft: "0.4rem", borderLeft: "2px solid #2a2040" }}>
                                <span style={{ fontFamily: "monospace", fontSize: "0.6rem", color: "#4a3a60", fontStyle: "italic" }}>no expected text mapped</span>
                              </div>
                            )}
                          </div>
                        </>
                      );
                    }
                    if (entry.type === "say") {
                      return (
                        <>
                          <Volume2 size={11} style={{ color: "#60a5fa", flexShrink: 0, marginTop: 3 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{
                              fontFamily: "monospace", fontSize: "0.6rem", fontWeight: 700,
                              background: "#7c3aed22", border: "1px solid #7c3aed55",
                              borderRadius: 4, padding: "0 4px", color: "#a78bfa",
                              marginRight: "0.4rem", letterSpacing: "0.06em",
                            }}>TTS</span>
                            <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "#cbd5e1" }}>
                              {entry.content}
                            </span>
                          </div>
                        </>
                      );
                    }
                    if (entry.type === "record") {
                      return (
                        <>
                          <Wand2 size={11} style={{ color: "#f97316", flexShrink: 0, marginTop: 3 }} />
                          <span style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#fdba74" }}>{entry.content}</span>
                        </>
                      );
                    }
                    if (entry.type === "conference") {
                      return (
                        <>
                          <Users size={11} style={{ color: "#4ade80", flexShrink: 0, marginTop: 3 }} />
                          <span style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#86efac" }}>{entry.content}</span>
                        </>
                      );
                    }
                    if (entry.type === "hangup") {
                      return (
                        <>
                          <PhoneCall size={11} style={{ color: "#f87171", flexShrink: 0, marginTop: 3 }} />
                          <span style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#fca5a5" }}>{entry.content}</span>
                        </>
                      );
                    }
                    if (entry.type === "pay") {
                      return (
                        <>
                          <CreditCard size={11} style={{ color: "#2dd4bf", flexShrink: 0, marginTop: 3 }} />
                          <span style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#99f6e4" }}>{entry.content}</span>
                        </>
                      );
                    }
                    // system / default
                    return (
                      <>
                        <Settings size={11} style={{ color: "#6b84a8", flexShrink: 0, marginTop: 3 }} />
                        <span style={{ fontFamily: "monospace", fontSize: "0.72rem", color: "#6b84a8", fontStyle: "italic" }}>{entry.content}</span>
                      </>
                    );
                  })()}

                  {/* Right-aligned key presses */}
                  {isKey && (
                    <>
                      <span style={{ fontFamily: "monospace", fontSize: "0.85rem", fontWeight: 700, color: "#fbbf24" }}>▶ {entry.content}</span>
                      <Phone size={11} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 3 }} />
                    </>
                  )}
                </div>
              );
            })
          )}
          <div ref={logEndRef} />
        </div>

        {/* Legend */}
        <div style={{ borderTop: `1px solid ${PT.logBorder}`, padding: "0.5rem 0.75rem", background: PT.logBg, display: "flex", flexWrap: "wrap", gap: "0.9rem" }}>
          {[
            { icon: <Play size={10} style={{ color: "#a78bfa" }} />, label: "MP3 File",   color: "#a78bfa" },
            { icon: <Volume2 size={10} style={{ color: "#60a5fa" }} />, label: "TTS (no audio file)", color: "#60a5fa" },
            { icon: <Phone size={10} style={{ color: "#fbbf24" }} />,  label: "Key Press", color: "#fbbf24" },
            { icon: <Wand2 size={10} style={{ color: "#f97316" }} />,  label: "Record",    color: "#f97316" },
            { icon: <PhoneCall size={10} style={{ color: "#f87171" }} />, label: "Hangup",  color: "#f87171" },
          ].map(item => (
            <span key={item.label} style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontFamily: "monospace", fontSize: "0.65rem", color: item.color }}>
              {item.icon} {item.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Phone Numbers Tab ─────────────────────────────────────────────────────────
interface PhoneStat {
  phoneNumber: string;
  regionId: string | null;
  regionName: string | null;
  callCount: number;
  totalSeconds: number;
  lastCallAt: string | null;
}

function callCountDot(n: number) {
  const color =
    n >= 60 ? "bg-green-500" :
    n >= 30 ? "bg-yellow-400" :
    n >= 10 ? "bg-orange-400" :
    n >= 1  ? "bg-red-400"    : "bg-gray-300";
  return <span className={`inline-block w-2.5 h-2.5 rounded-full mr-2 flex-shrink-0 ${color}`} />;
}

function PhoneNumbersTab() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data: stats = [], isLoading } = useQuery<PhoneStat[]>({
    queryKey: ["/api/admin/phone-stats", year, month],
    queryFn: () =>
      fetch(`/api/admin/phone-stats?year=${year}&month=${month}`)
        .then(r => r.json()),
  });

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function fmtDuration(secs: number) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function fmtDate(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <select
          data-testid="select-phone-stats-year"
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="border border-gray-200 rounded px-2 py-1 font-mono text-xs bg-white text-gray-700 focus:outline-none"
        >
          {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          data-testid="select-phone-stats-month"
          value={month}
          onChange={e => setMonth(Number(e.target.value))}
          className="border border-gray-200 rounded px-2 py-1 font-mono text-xs bg-white text-gray-700 focus:outline-none"
        >
          {months.map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-400 font-mono text-xs py-10 justify-center">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : stats.length === 0 ? (
        <div className="text-gray-400 font-mono text-xs text-center py-16">No call data for this period.</div>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-100">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-gray-500 uppercase tracking-widest">
                <th className="text-left px-4 py-3">Phone Number</th>
                <th className="text-left px-4 py-3">Region</th>
                <th className="text-right px-4 py-3">Calls</th>
                <th className="text-right px-4 py-3">Total Duration</th>
                <th className="text-right px-4 py-3">Last Call</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((row, i) => (
                <tr
                  key={row.phoneNumber ?? i}
                  data-testid={`row-phone-stat-${i}`}
                  className="border-b border-gray-50 last:border-0 hover:bg-amber-50 transition-colors"
                >
                  <td className="px-4 py-3 flex items-center">
                    {callCountDot(row.callCount)}
                    <span data-testid={`text-phone-number-${i}`} className="text-gray-800">{row.phoneNumber ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{row.regionName ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-right text-gray-800 font-semibold">{row.callCount}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{fmtDuration(row.totalSeconds)}</td>
                  <td className="px-4 py-3 text-right text-gray-400">{fmtDate(row.lastCallAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-4 text-xs font-mono text-gray-400">
        {[
          { color: "bg-green-500",  label: "60+ calls" },
          { color: "bg-yellow-400", label: "30–59 calls" },
          { color: "bg-orange-400", label: "10–29 calls" },
          { color: "bg-red-400",    label: "1–9 calls" },
          { color: "bg-gray-300",   label: "0 calls" },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Blocked Numbers Tab ───────────────────────────────────────────────────────
interface BlockedEntry {
  id: string;
  blockerPhone: string;
  blockedPhone: string;
  createdAt: string;
}

function BlockedNumbersTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const { data: entries = [], isLoading, refetch } = useQuery<BlockedEntry[]>({
    queryKey: ["/api/admin/blocked"],
  });

  const unblockMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/admin/blocked/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blocked"] });
      toast({ title: "Unblocked", description: "The block has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not remove block.", variant: "destructive" });
    },
  });

  const filtered = entries.filter(e =>
    e.blockerPhone.includes(search) || e.blockedPhone.includes(search)
  );

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <input
          data-testid="input-blocked-search"
          type="text"
          placeholder="Filter by phone number…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-200 rounded px-3 py-1.5 font-mono text-xs bg-white text-gray-700 focus:outline-none w-64"
        />
        <span className="text-gray-400 font-mono text-xs">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-400 font-mono text-xs py-10 justify-center">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-400 font-mono text-xs text-center py-16">
          {search ? "No matches found." : "No blocked numbers on record."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-100">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-gray-500 uppercase tracking-widest">
                <th className="text-left px-4 py-3">Blocked By</th>
                <th className="text-left px-4 py-3">Blocked Number</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-right px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr
                  key={row.id}
                  data-testid={`row-blocked-${i}`}
                  className="border-b border-gray-50 last:border-0 hover:bg-amber-50 transition-colors"
                >
                  <td className="px-4 py-3 text-gray-600" data-testid={`text-blocker-${i}`}>{row.blockerPhone}</td>
                  <td className="px-4 py-3 text-gray-800 font-semibold" data-testid={`text-blocked-${i}`}>{row.blockedPhone}</td>
                  <td className="px-4 py-3 text-gray-400">{fmtDate(row.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      data-testid={`btn-unblock-${i}`}
                      onClick={() => unblockMutation.mutate(row.id)}
                      disabled={unblockMutation.isPending}
                      className="text-xs font-mono text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 rounded px-2 py-1 transition-colors disabled:opacity-40"
                    >
                      {unblockMutation.isPending ? <Loader2 size={11} className="animate-spin inline" /> : "Unblock"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtSecs(secs: number | null | undefined) {
  if (secs == null) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
function fmtMins(secs: number | null | undefined) {
  if (secs == null) return "—";
  return `${Math.floor(secs / 60).toLocaleString()} min`;
}

// ── CallerDetailView ──────────────────────────────────────────────────────────
const CALLS_PER_PAGE = 10;

function CallerDetailView({ callerId, allCallers, onBack }: { callerId: string; allCallers: CallerSummary[]; onBack: () => void }) {
  const { toast } = useToast();
  const [creditInput, setCreditInput] = useState("");
  const [creditMode, setCreditMode] = useState<"add" | "remove">("add");
  const [callHistoryPage, setCallHistoryPage] = useState(0);
  const [pinInput, setPinInput] = useState("");
  const [showPinInput, setShowPinInput] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: detail, isLoading, refetch } = useQuery<CallerDetail>({
    queryKey: ["/api/admin/callers", callerId],
    queryFn: () => fetch(`/api/admin/callers/${callerId}`).then(r => r.json()),
  });

  const creditMutation = useMutation({
    mutationFn: async () => {
      const mins = parseFloat(creditInput);
      if (isNaN(mins) || mins <= 0) throw new Error("Enter a valid number of minutes");
      const delta = Math.round(mins * 60) * (creditMode === "remove" ? -1 : 1);
      return apiRequest("PATCH", `/api/admin/callers/${callerId}/credits`, { deltaSeconds: delta });
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/callers"] });
      setCreditInput("");
      toast({ title: `Credits ${creditMode === "add" ? "added" : "removed"}` });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const blockMutation = useMutation({
    mutationFn: async ({ action, targetId }: { action: "block" | "unblock"; targetId: string }) => {
      if (action === "block") return apiRequest("POST", `/api/admin/callers/${callerId}/block/${targetId}`, {});
      return apiRequest("DELETE", `/api/admin/callers/${callerId}/block/${targetId}`);
    },
    onSuccess: () => { refetch(); queryClient.invalidateQueries({ queryKey: ["/api/admin/callers"] }); },
    onError: () => toast({ title: "Action failed", variant: "destructive" }),
  });

  const pinMutation = useMutation({
    mutationFn: async (pin: string | null) => apiRequest("PATCH", `/api/admin/callers/${callerId}/pin`, { pin }),
    onSuccess: () => {
      refetch();
      setPinInput("");
      setShowPinInput(false);
      toast({ title: "PIN updated" });
    },
    onError: () => toast({ title: "Failed to update PIN", variant: "destructive" }),
  });

  const accountStatusMutation = useMutation({
    mutationFn: async (status: "active" | "restricted" | "banned") =>
      apiRequest("PATCH", `/api/admin/users/${callerId}/account-status`, { status }),
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/callers"] });
      toast({ title: "Account status updated" });
    },
    onError: () => toast({ title: "Failed to update account status", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/admin/callers/${callerId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/callers"] });
      toast({ title: "Caller record deleted" });
      onBack();
    },
    onError: () => toast({ title: "Failed to delete caller record", variant: "destructive" }),
  });

  // Build options for adding a new block — exclude self and already-blocked users
  const blockedIds = new Set(detail?.blockedByUser.map(b => b.phoneNumber) ?? []);
  const blockableCallers = allCallers.filter(c => c.id !== callerId && !blockedIds.has(c.phoneNumber));
  const [blockTarget, setBlockTarget] = useState("");

  if (isLoading) return (
    <div className="flex items-center gap-2 text-gray-400 font-mono text-xs py-16 justify-center">
      <Loader2 size={14} className="animate-spin" /> Loading caller record…
    </div>
  );
  if (!detail) return (
    <div className="text-gray-400 font-mono text-xs py-16 text-center">Caller not found.</div>
  );

  const { user, profile, zipCode, callHistory, sentMessages, receivedMessages, blockedByUser, blockedByOthers } = detail;

  return (
    <div className="space-y-0">
      {/* Back + header */}
      <div className="flex items-center gap-3 mb-5">
        <button data-testid="btn-back-to-directory" onClick={onBack} className={C.btnSecondary + " !py-1.5"}>
          <ChevronLeft size={13} /> Directory
        </button>
        <div className="flex-1">
          <div className="text-gray-900 font-mono font-bold text-sm tracking-widest uppercase">{user.phoneNumber}</div>
          <div className="text-gray-400 font-mono text-xs">Caller Record</div>
        </div>
        {!showDeleteConfirm ? (
          <button
            data-testid="btn-delete-caller"
            onClick={() => setShowDeleteConfirm(true)}
            className={C.btnDanger + " !py-1.5"}
          >
            Delete Record
          </button>
        ) : (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded px-3 py-1.5">
            <span className="text-red-700 font-mono text-xs font-semibold">Delete this caller permanently?</span>
            <button
              data-testid="btn-delete-caller-confirm"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className={C.btnDanger + " !py-1"}
            >
              {deleteMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : null}
              Yes, Delete
            </button>
            <button
              data-testid="btn-delete-caller-cancel"
              onClick={() => setShowDeleteConfirm(false)}
              className={C.btnSecondary + " !py-1"}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* ── Caller Information ── */}
      <div className={C.panel}>
        <div className={C.panelHeader}>Caller Information</div>
        <div className={C.panelBody}>
          <div className={C.fieldRow}><span className={C.fieldLabel}>Phone Number</span><span className={C.fieldValue} data-testid="detail-phone">{user.phoneNumber}</span></div>
          <div className={C.fieldRow}><span className={C.fieldLabel}>Joined</span><span className={C.fieldValue}>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}</span></div>
          <div className={C.fieldRow}><span className={C.fieldLabel}>Membership Tier</span><span className={C.fieldValue}>{user.membershipTier ?? <span className="text-gray-400">None</span>}</span></div>
          <div className={C.fieldRow}>
            <span className={C.fieldLabel}>Account Status</span>
            <span className={C.fieldValue}>
              <span className="inline-flex items-center gap-2 flex-wrap">
                {user.accountStatus === "banned" ? (
                  <span data-testid="status-badge-banned" className={`${C.badge} border-red-200 bg-red-50 text-red-600`}>Banned</span>
                ) : user.accountStatus === "restricted" ? (
                  <span data-testid="status-badge-restricted" className={`${C.badge} border-orange-200 bg-orange-50 text-orange-600`}>Restricted</span>
                ) : (
                  <span data-testid="status-badge-active" className={`${C.badge} border-emerald-200 bg-emerald-50 text-emerald-600`}>Active</span>
                )}
                {user.accountStatus !== "restricted" && (
                  <button
                    data-testid="btn-restrict-user"
                    onClick={() => accountStatusMutation.mutate("restricted")}
                    disabled={accountStatusMutation.isPending}
                    className={C.btnGhost + " text-orange-600 border-orange-200 bg-orange-50 hover:bg-orange-100"}
                  >Restrict</button>
                )}
                {user.accountStatus !== "banned" && (
                  <button
                    data-testid="btn-ban-user"
                    onClick={() => accountStatusMutation.mutate("banned")}
                    disabled={accountStatusMutation.isPending}
                    className={C.btnDanger}
                  >Ban</button>
                )}
                {user.accountStatus !== "active" && (
                  <button
                    data-testid="btn-unban-user"
                    onClick={() => accountStatusMutation.mutate("active")}
                    disabled={accountStatusMutation.isPending}
                    className={C.btnSecondary}
                  >Restore Active</button>
                )}
              </span>
            </span>
          </div>
          <div className={C.fieldRow}>
            <span className={C.fieldLabel}>Mailbox Number</span>
            <span className={C.fieldValue} data-testid="detail-mailbox-number">
              {detail.mailbox
                ? <span className="font-mono font-bold tracking-widest">{detail.mailbox.mailboxNumber}</span>
                : <span className="text-gray-400">—</span>}
            </span>
          </div>
          <div className={C.fieldRow}>
            <span className={C.fieldLabel}>Credit Balance</span>
            <span className={C.fieldValue}>{fmtMins(user.remainingSeconds)} <span className="text-gray-400 text-xs">({user.remainingSeconds?.toLocaleString() ?? 0} sec)</span></span>
          </div>
          <div className={C.fieldRow}><span className={C.fieldLabel}>Membership No.</span><span className={C.fieldValue}>{user.membershipNumber ? <span className="font-mono font-bold tracking-widest">{user.membershipNumber}</span> : <span className="text-gray-400">—</span>}</span></div>
          <div className={C.fieldRow}>
            <span className={C.fieldLabel}>Access PIN</span>
            <span className={C.fieldValue}>
              {user.membershipPin
                ? <span className="inline-flex items-center gap-2"><span className="font-mono font-bold tracking-widest">••••</span><span className="text-gray-400 text-xs">(set)</span></span>
                : <span className="text-gray-400">Not set</span>}
            </span>
          </div>
          <div className={C.fieldRow}><span className={C.fieldLabel}>Stripe Customer</span><span className={C.fieldValue}>{user.stripeCustomerId ?? <span className="text-gray-400">—</span>}</span></div>
          <div className={C.fieldRow}>
            <span className={C.fieldLabel}>Voice Profile</span>
            <span className={C.fieldValue}>
              {profile ? (
                <span className="inline-flex flex-col gap-2">
                  <span className="inline-flex items-center gap-2">
                    <span className={`${C.badge} border-emerald-200 bg-emerald-50 text-emerald-700`}><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Active</span>
                    <span className="text-gray-400 text-xs">{fmtSecs(profile.recordingDuration)}</span>
                  </span>
                  <AudioPlayer src={profile.recordingUrl} />
                </span>
              ) : <span className={`${C.badge} border-gray-200 bg-gray-50 text-gray-400`}>No Profile</span>}
            </span>
          </div>
          <div className={C.fieldRow}>
            <span className={C.fieldLabel}>Zip Code</span>
            <span className={C.fieldValue} data-testid="detail-zip-code">
              {zipCode ? (
                <span className="inline-flex items-center gap-2">
                  <span className="font-mono font-bold">{zipCode.code}</span>
                  {(zipCode.city || zipCode.state) && (
                    <span className="text-gray-400 text-xs">
                      {[zipCode.city, zipCode.state].filter(Boolean).join(", ")}
                    </span>
                  )}
                  {zipCode.neighborhood && (
                    <span className="text-gray-400 text-xs">· {zipCode.neighborhood}</span>
                  )}
                </span>
              ) : <span className="text-gray-400">—</span>}
            </span>
          </div>
        </div>
      </div>

      {/* ── Credit Adjustment ── */}
      <div className={C.panel}>
        <div className={C.panelHeader}>Credit Adjustment</div>
        <div className={C.panelBody + " p-4"}>
          <div className="flex items-center gap-3">
            <div className="flex rounded overflow-hidden border border-gray-300">
              <button
                data-testid="btn-credit-mode-add"
                onClick={() => setCreditMode("add")}
                className={`px-3 py-2 font-mono text-xs tracking-widest flex items-center gap-1.5 transition-colors ${creditMode === "add" ? "bg-emerald-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
              ><PlusCircle size={12} /> Add</button>
              <button
                data-testid="btn-credit-mode-remove"
                onClick={() => setCreditMode("remove")}
                className={`px-3 py-2 font-mono text-xs tracking-widest flex items-center gap-1.5 transition-colors border-l border-gray-300 ${creditMode === "remove" ? "bg-red-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
              ><MinusCircle size={12} /> Remove</button>
            </div>
            <input
              data-testid="input-credit-minutes"
              type="number"
              min="1"
              step="1"
              placeholder="Minutes"
              value={creditInput}
              onChange={e => setCreditInput(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 font-mono text-sm text-gray-800 w-32 focus:outline-none focus:border-[#f5a623]"
            />
            <button
              data-testid="btn-apply-credits"
              onClick={() => creditMutation.mutate()}
              disabled={!creditInput || creditMutation.isPending}
              className={C.btnPrimary}
            >
              {creditMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Apply
            </button>
            {creditInput && !isNaN(parseFloat(creditInput)) && (
              <span className={`font-mono text-xs ${creditMode === "add" ? "text-emerald-600" : "text-red-500"}`}>
                {creditMode === "add" ? "+" : "−"}{parseFloat(creditInput).toFixed(0)} min ({Math.round(parseFloat(creditInput) * 60)} sec)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── PIN Management ── */}
      <div className={C.panel}>
        <div className={C.panelHeader}>Access PIN Management</div>
        <div className={C.panelBody + " p-4 space-y-3"}>
          <p className="font-mono text-xs text-gray-500">
            A 4-digit PIN lets this member call in from any phone using their membership number + PIN.
            {user.membershipPin ? " This member currently has a PIN set." : " This member has no PIN set."}
          </p>
          {!showPinInput ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowPinInput(true)}
                className={C.btnGhost}
              >
                {user.membershipPin ? "Change PIN" : "Set PIN"}
              </button>
              {user.membershipPin && (
                <button
                  onClick={() => pinMutation.mutate(null)}
                  disabled={pinMutation.isPending}
                  className={C.btnDanger}
                >
                  {pinMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : null}
                  Clear PIN
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder="4-digit PIN"
                value={pinInput}
                onChange={e => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="border border-gray-300 rounded px-3 py-2 font-mono text-sm text-gray-800 w-28 focus:outline-none focus:border-[#f5a623] tracking-widest"
              />
              <button
                onClick={() => pinMutation.mutate(pinInput)}
                disabled={pinInput.length !== 4 || pinMutation.isPending}
                className={C.btnPrimary}
              >
                {pinMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                Save PIN
              </button>
              <button
                onClick={() => { setShowPinInput(false); setPinInput(""); }}
                className={C.btnSecondary}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Call History ── */}
      {(() => {
        const totalPages = Math.max(1, Math.ceil(callHistory.length / CALLS_PER_PAGE));
        const safePage = Math.min(callHistoryPage, totalPages - 1);
        const pageSlice = callHistory.slice(safePage * CALLS_PER_PAGE, (safePage + 1) * CALLS_PER_PAGE);
        return (
          <div className={C.panel}>
            <div className={C.panelHeader}>
              Call History <span className="opacity-60 font-normal ml-2">({callHistory.length})</span>
            </div>
            <div className={C.panelBody}>
              {callHistory.length === 0 ? (
                <div className="px-4 py-6 text-gray-400 font-mono text-xs text-center">No calls on record.</div>
              ) : (
                <>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-4 py-2 text-gray-400 font-mono text-xs tracking-widest uppercase bg-gray-50">Date</th>
                        <th className="text-left px-4 py-2 text-gray-400 font-mono text-xs tracking-widest uppercase bg-gray-50">To Number</th>
                        <th className="text-left px-4 py-2 text-gray-400 font-mono text-xs tracking-widest uppercase bg-gray-50">Duration</th>
                        <th className="text-left px-4 py-2 text-gray-400 font-mono text-xs tracking-widest uppercase bg-gray-50">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageSlice.map((call, i) => {
                        const isCompleted = !!call.completedAt || call.durationSeconds !== null;
                        const startedMs = call.startedAt ? new Date(call.startedAt).getTime() : null;
                        const isStale = !isCompleted && startedMs !== null && (Date.now() - startedMs) > 30 * 60 * 1000;
                        const statusLabel = isCompleted ? "Completed" : isStale ? "Ended" : "In Progress";
                        const statusClass = (isCompleted || isStale)
                          ? "border-gray-200 bg-gray-50 text-gray-500"
                          : "border-amber-200 bg-amber-50 text-amber-700";
                        return (
                          <tr key={call.id} data-testid={`row-call-${i}`} className="border-b border-gray-50 last:border-0 hover:bg-amber-50/30 transition-colors">
                            <td className="px-4 py-2 text-gray-600 font-mono text-xs">{call.startedAt ? new Date(call.startedAt).toLocaleString() : "—"}</td>
                            <td className="px-4 py-2 text-gray-700 font-mono text-xs">{call.toPhoneNumber ?? "—"}</td>
                            <td className="px-4 py-2 text-gray-700 font-mono text-xs">{fmtSecs(call.durationSeconds)}</td>
                            <td className="px-4 py-2">
                              <span className={`${C.badge} ${statusClass}`}>{statusLabel}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 bg-gray-50">
                      <button
                        data-testid="btn-calls-prev"
                        onClick={() => setCallHistoryPage(p => Math.max(0, p - 1))}
                        disabled={safePage === 0}
                        className="flex items-center gap-1 px-2 py-1 font-mono text-xs text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft size={12} /> Prev
                      </button>
                      <span className="font-mono text-xs text-gray-400">
                        Page {safePage + 1} of {totalPages}
                      </span>
                      <button
                        data-testid="btn-calls-next"
                        onClick={() => setCallHistoryPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={safePage === totalPages - 1}
                        className="flex items-center gap-1 px-2 py-1 font-mono text-xs text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        Next <ChevronRight size={12} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Messages ── */}
      <div className={C.panel}>
        <div className={C.panelHeader}>Messages <span className="opacity-60 font-normal ml-2">(Sent: {sentMessages.length} / Received: {receivedMessages.length})</span></div>
        <div className={C.panelBody}>
          {sentMessages.length === 0 && receivedMessages.length === 0 ? (
            <div className="px-4 py-6 text-gray-400 font-mono text-xs text-center">No messages on record.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-2 text-gray-400 font-mono text-xs tracking-widest uppercase bg-gray-50">Direction</th>
                  <th className="text-left px-4 py-2 text-gray-400 font-mono text-xs tracking-widest uppercase bg-gray-50">With</th>
                  <th className="text-left px-4 py-2 text-gray-400 font-mono text-xs tracking-widest uppercase bg-gray-50">Date</th>
                  <th className="text-left px-4 py-2 text-gray-400 font-mono text-xs tracking-widest uppercase bg-gray-50">Read</th>
                </tr>
              </thead>
              <tbody>
                {sentMessages.map((m, i) => (
                  <tr key={`s-${m.id}`} data-testid={`row-msg-sent-${i}`} className="border-b border-gray-50 last:border-0 hover:bg-amber-50/30 transition-colors">
                    <td className="px-4 py-2"><span className={`${C.badge} border-blue-200 bg-blue-50 text-blue-600`}>Sent</span></td>
                    <td className="px-4 py-2 text-gray-700 font-mono text-xs">{m.toPhoneNumber}</td>
                    <td className="px-4 py-2 text-gray-500 font-mono text-xs">{m.createdAt ? new Date(m.createdAt).toLocaleString() : "—"}</td>
                    <td className="px-4 py-2 text-gray-400 font-mono text-xs">{m.isRead ? "Yes" : "No"}</td>
                  </tr>
                ))}
                {receivedMessages.map((m, i) => (
                  <tr key={`r-${m.id}`} data-testid={`row-msg-received-${i}`} className="border-b border-gray-50 last:border-0 hover:bg-amber-50/30 transition-colors">
                    <td className="px-4 py-2"><span className={`${C.badge} border-emerald-200 bg-emerald-50 text-emerald-600`}>Received</span></td>
                    <td className="px-4 py-2 text-gray-700 font-mono text-xs">{m.fromPhoneNumber}</td>
                    <td className="px-4 py-2 text-gray-500 font-mono text-xs">{m.createdAt ? new Date(m.createdAt).toLocaleString() : "—"}</td>
                    <td className="px-4 py-2 text-gray-400 font-mono text-xs">{m.isRead ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Blocks ── */}
      <div className={C.panel}>
        <div className={C.panelHeader}>Block Management</div>
        <div className={C.panelBody}>
          {/* Blocked by this user */}
          <div className="px-4 pt-3 pb-1">
            <div className="text-gray-500 font-mono text-xs tracking-widest uppercase mb-2">Blocked By This Caller</div>
            {blockedByUser.length === 0 ? (
              <div className="text-gray-400 font-mono text-xs py-2">No blocks placed by this caller.</div>
            ) : (
              <div className="space-y-1">
                {blockedByUser.map(b => (
                  <div key={b.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-2">
                      <Shield size={12} className="text-red-400" />
                      <span className="text-gray-700 font-mono text-xs">{b.phoneNumber}</span>
                      <span className="text-gray-400 font-mono text-xs">{b.blockedAt ? new Date(b.blockedAt).toLocaleDateString() : ""}</span>
                    </div>
                    <button
                      data-testid={`btn-unblock-by-user-${b.id}`}
                      onClick={() => {
                        const target = allCallers.find(c => c.phoneNumber === b.phoneNumber);
                        if (target) blockMutation.mutate({ action: "unblock", targetId: target.id });
                      }}
                      disabled={blockMutation.isPending}
                      className={C.btnDanger + " !py-1 !text-xs"}
                    ><ShieldOff size={11} /> Unblock</button>
                  </div>
                ))}
              </div>
            )}
            {/* Add a block */}
            <div className="flex items-center gap-2 pt-3">
              <select
                data-testid="select-block-target"
                value={blockTarget}
                onChange={e => setBlockTarget(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1.5 font-mono text-xs text-gray-700 focus:outline-none focus:border-[#f5a623] flex-1 max-w-xs"
              >
                <option value="">— Select caller to block —</option>
                {blockableCallers.map(c => (
                  <option key={c.id} value={c.id}>{c.phoneNumber}</option>
                ))}
              </select>
              <button
                data-testid="btn-add-block"
                onClick={() => { if (blockTarget) { blockMutation.mutate({ action: "block", targetId: blockTarget }); setBlockTarget(""); } }}
                disabled={!blockTarget || blockMutation.isPending}
                className={C.btnDanger}
              ><Shield size={11} /> Block</button>
            </div>
          </div>
          {/* Blocked by others */}
          {blockedByOthers.length > 0 && (
            <div className="px-4 pt-3 pb-3 border-t border-gray-100 mt-2">
              <div className="text-gray-500 font-mono text-xs tracking-widest uppercase mb-2">Blocked By Others ({blockedByOthers.length})</div>
              <div className="space-y-1">
                {blockedByOthers.map(b => (
                  <div key={b.id} className="flex items-center gap-2 py-1">
                    <Shield size={12} className="text-gray-400" />
                    <span className="text-gray-600 font-mono text-xs">{b.phoneNumber}</span>
                    <span className="text-gray-400 font-mono text-xs">{b.blockedAt ? new Date(b.blockedAt).toLocaleDateString() : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── CallersTab ────────────────────────────────────────────────────────────────
function CallersTab() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"joined" | "phone" | "credits" | "calls">("joined");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: callers, isLoading } = useQuery<CallerSummary[]>({
    queryKey: ["/api/admin/callers"],
    refetchInterval: 30000,
  });

  const filtered = (callers ?? [])
    .filter(c => c.phoneNumber.includes(search.trim()))
    .sort((a, b) => {
      if (sort === "phone")   return a.phoneNumber.localeCompare(b.phoneNumber);
      if (sort === "credits") return (b.remainingSeconds ?? 0) - (a.remainingSeconds ?? 0);
      if (sort === "calls")   return b.callCount - a.callCount;
      return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
    });

  if (selectedId) {
    return <CallerDetailView callerId={selectedId} allCallers={callers ?? []} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          data-testid="input-caller-search"
          type="text"
          placeholder="Search phone number…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-200 rounded px-3 py-1.5 font-mono text-xs bg-white text-gray-700 focus:outline-none w-56 focus:border-[#f5a623]"
        />
        <div className="flex items-center gap-1.5 text-gray-400 font-mono text-xs">
          <ArrowUpDown size={12} />
          Sort:
          {(["joined", "phone", "credits", "calls"] as const).map(s => (
            <button
              key={s}
              data-testid={`btn-sort-${s}`}
              onClick={() => setSort(s)}
              className={`px-2 py-0.5 rounded font-mono text-xs tracking-widest uppercase transition-colors ${sort === s ? "bg-[#f5a623] text-black" : "text-gray-400 hover:text-gray-700"}`}
            >{s}</button>
          ))}
        </div>
        <span className="ml-auto text-gray-400 font-mono text-xs">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Directory table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className={C.th}>Phone Number</th>
              <th className={C.th}>Joined</th>
              <th className={C.th}>Tier</th>
              <th className={C.th}>Status</th>
              <th className={C.th}>Credits</th>
              <th className={C.th}>Profile</th>
              <th className={C.th}>Calls</th>
              <th className={C.th}>Msgs</th>
              <th className={C.th}>Blocks</th>
              <th className={C.th}></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400 font-mono text-xs tracking-widest">LOADING CALLERS…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400 font-mono text-xs tracking-widest">
                {search ? "NO MATCHES FOUND" : "NO CALLERS REGISTERED"}
              </td></tr>
            ) : (
              filtered.map(caller => (
                <tr key={caller.id} data-testid={`row-caller-${caller.id}`} className={C.row + " cursor-pointer"} onClick={() => setSelectedId(caller.id)}>
                  <td className={C.td}>
                    <div className="flex items-center gap-2">
                      <Phone size={12} className="text-gray-400" />
                      <span data-testid={`text-caller-phone-${caller.id}`} className="text-gray-900 font-mono text-sm">{caller.phoneNumber}</span>
                    </div>
                  </td>
                  <td className={C.td + " text-gray-400 text-xs"}>{caller.createdAt ? new Date(caller.createdAt).toLocaleDateString() : "—"}</td>
                  <td className={C.td}>
                    {caller.membershipTier ? (
                      <span className={`${C.badge} border-amber-200 bg-amber-50 text-amber-700`}>{caller.membershipTier}</span>
                    ) : (
                      <span className="text-gray-400 font-mono text-xs">—</span>
                    )}
                  </td>
                  <td className={C.td}>
                    {caller.accountStatus === "banned" ? (
                      <span data-testid={`status-banned-${caller.id}`} className={`${C.badge} border-red-200 bg-red-50 text-red-600`}>Banned</span>
                    ) : caller.accountStatus === "restricted" ? (
                      <span data-testid={`status-restricted-${caller.id}`} className={`${C.badge} border-orange-200 bg-orange-50 text-orange-600`}>Restricted</span>
                    ) : (
                      <span className={`${C.badge} border-emerald-200 bg-emerald-50 text-emerald-600`}>Active</span>
                    )}
                  </td>
                  <td className={C.td + " text-gray-600 text-xs"}>{fmtMins(caller.remainingSeconds)}</td>
                  <td className={C.td}>
                    {caller.hasProfile ? (
                      <span className={`${C.badge} border-emerald-200 bg-emerald-50 text-emerald-700`}><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Yes</span>
                    ) : (
                      <span className={`${C.badge} border-gray-200 bg-gray-50 text-gray-400`}>No</span>
                    )}
                  </td>
                  <td className={C.td + " text-gray-600 text-xs text-center"}>{caller.callCount}</td>
                  <td className={C.td + " text-gray-600 text-xs text-center"}>{caller.messageCount}</td>
                  <td className={C.td + " text-gray-600 text-xs text-center"}>{caller.blockCount > 0 ? <span className="text-red-400">{caller.blockCount}</span> : <span className="text-gray-300">0</span>}</td>
                  <td className={C.td}>
                    <button
                      data-testid={`btn-view-caller-${caller.id}`}
                      onClick={e => { e.stopPropagation(); setSelectedId(caller.id); }}
                      className={C.btnGhost + " !py-1"}
                    ><Eye size={11} /> View</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Flagged Content Queue ──────────────────────────────────────────────────────
const FLAG_REASONS = [
  "Inappropriate language",
  "Explicit/adult content",
  "Hate speech",
  "Spam or solicitation",
  "Impersonation",
  "Harassment",
  "Other",
];

// ── FlaggedAudioPlayer ────────────────────────────────────────────────────────
function FlaggedAudioPlayer({ url, label }: { url: string; label: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play(); setPlaying(true); }
  };

  return (
    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={e => {
          const a = e.currentTarget;
          setProgress(a.duration ? a.currentTime / a.duration : 0);
        }}
        onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
        onEnded={() => { setPlaying(false); setProgress(0); }}
      />
      <button
        data-testid={`btn-play-flagged-audio`}
        onClick={toggle}
        className="w-7 h-7 rounded-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0 transition-colors"
      >
        {playing ? <Pause size={12} /> : <Play size={12} />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-600 font-medium truncate">{label}</div>
        <div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
      {duration > 0 && (
        <span className="text-[10px] font-mono text-gray-400 flex-shrink-0">
          {fmtSecs(Math.round(duration))}
        </span>
      )}
    </div>
  );
}

// ── FlaggedCard ───────────────────────────────────────────────────────────────
function FlaggedCard({
  item,
  onResolve,
  onDelete,
  resolving,
  deleting,
}: {
  item: FlaggedItem;
  onResolve: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  resolving: boolean;
  deleting: boolean;
}) {
  const isProfile = item.contentType === "profile";
  const isMessage = item.contentType === "message";
  const recordingUrl = isProfile ? item.profileRecordingUrl : item.messageRecordingUrl;

  const contentOwner = isProfile
    ? item.profilePhone
    : item.messageFromPhone;

  const contentTypeLabel = isProfile ? "Profile Greeting" : "Voice Message";

  const statusColors: Record<string, string> = {
    pending:  "bg-amber-50 border-amber-300 text-amber-700",
    approved: "bg-emerald-50 border-emerald-300 text-emerald-700",
    removed:  "bg-red-50 border-red-300 text-red-600",
  };
  const statusColor = statusColors[item.status] ?? "bg-gray-50 border-gray-300 text-gray-500";

  const typeColors = isProfile
    ? "bg-blue-50 border-blue-200 text-blue-700"
    : "bg-purple-50 border-purple-200 text-purple-700";

  return (
    <div
      data-testid={`row-flag-${item.id}`}
      className={`border rounded-xl overflow-hidden ${
        item.status === "pending"
          ? "border-amber-200 bg-white"
          : item.status === "removed"
          ? "border-red-100 bg-red-50/30"
          : "border-gray-200 bg-gray-50/50"
      }`}
    >
      {/* Card header */}
      <div className={`flex items-center gap-3 px-4 py-3 border-b ${
        item.status === "pending" ? "bg-amber-50/60 border-amber-100" :
        item.status === "removed" ? "bg-red-50/60 border-red-100" :
        "bg-gray-50 border-gray-100"
      }`}>
        <span className={`${C.badge} ${typeColors} text-[11px]`}>{contentTypeLabel}</span>
        <span className={`${C.badge} ${statusColor} text-[11px]`}>{item.status.toUpperCase()}</span>
        <span className="ml-auto text-xs text-gray-400">
          Flagged {item.createdAt ? new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
        </span>
        {item.reviewedAt && (
          <span className="text-xs text-gray-400">
            · Reviewed {new Date(item.reviewedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        )}
      </div>

      {/* Card body */}
      <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: flagged content info */}
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">
              {isProfile ? "Caller's Profile" : "Voice Message"}
            </div>
            {isProfile && contentOwner && (
              <div className="flex items-center gap-2">
                <Phone size={13} className="text-gray-400 flex-shrink-0" />
                <span className="font-mono text-sm text-gray-800 font-semibold">{contentOwner}</span>
              </div>
            )}
            {isMessage && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-gray-400 w-6">FROM</span>
                  <Phone size={11} className="text-gray-400" />
                  <span className="font-mono text-sm text-gray-800 font-semibold">{item.messageFromPhone ?? "Unknown"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-gray-400 w-6">TO</span>
                  <Phone size={11} className="text-gray-400" />
                  <span className="font-mono text-sm text-gray-700">{item.messageToPhone ?? "Unknown"}</span>
                </div>
              </div>
            )}
            {isProfile && item.profileDuration != null && (
              <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                <Volume2 size={10} /> {fmtSecs(item.profileDuration)} recording
              </div>
            )}
          </div>

          {/* Audio player */}
          {recordingUrl ? (
            <FlaggedAudioPlayer
              url={recordingUrl}
              label={isProfile ? "Play Profile Greeting" : "Play Voice Message"}
            />
          ) : (
            <div className="flex items-center gap-2 bg-gray-50 border border-dashed border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-400">
              <VolumeX size={13} /> No recording available
            </div>
          )}
        </div>

        {/* Right: report info */}
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">
              Reported By
            </div>
            <div className="flex items-center gap-2">
              {item.reportedByPhone ? (
                <>
                  <Phone size={13} className="text-gray-400 flex-shrink-0" />
                  <span className="font-mono text-sm text-gray-700">{item.reportedByPhone}</span>
                </>
              ) : (
                <span className="text-xs text-gray-400 italic">System / auto-flagged</span>
              )}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">
              Reason
            </div>
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              <AlertTriangle size={13} className="text-amber-500 mt-0.5 flex-shrink-0" />
              <span className="text-sm text-amber-800">{item.reason}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions footer */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex-wrap">
        {item.status === "pending" && (
          <>
            <button
              data-testid={`btn-approve-flag-${item.id}`}
              onClick={() => onResolve(item.id, "approved")}
              disabled={resolving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
            >
              <CheckCircle2 size={13} /> Approve — Content OK
            </button>
            <button
              data-testid={`btn-remove-flag-${item.id}`}
              onClick={() => onResolve(item.id, "removed")}
              disabled={resolving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
            >
              <XCircle size={13} /> Remove Content
            </button>
          </>
        )}
        {item.status !== "pending" && (
          <button
            data-testid={`btn-reopen-flag-${item.id}`}
            onClick={() => onResolve(item.id, "pending")}
            disabled={resolving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 bg-white hover:bg-gray-50 text-gray-600 transition-colors"
          >
            <Flag size={13} /> Re-open Review
          </button>
        )}
        <button
          data-testid={`btn-delete-flag-${item.id}`}
          onClick={() => onDelete(item.id)}
          disabled={deleting}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 bg-white hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-gray-400 transition-colors"
        >
          <Trash2 size={13} /> Dismiss Record
        </button>
      </div>
    </div>
  );
}

// ── FlaggedContentTab ─────────────────────────────────────────────────────────
function FlaggedContentTab() {
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "removed" | "all">("pending");
  const [showAddFlag, setShowAddFlag] = useState(false);
  const [addForm, setAddForm] = useState({ contentType: "profile", contentId: "", reason: FLAG_REASONS[0] });
  const [addError, setAddError] = useState("");

  const { data: items, isLoading } = useQuery<FlaggedItem[]>({
    queryKey: ["/api/admin/flagged", statusFilter],
    queryFn: () =>
      fetch(statusFilter === "all" ? "/api/admin/flagged" : `/api/admin/flagged?status=${statusFilter}`)
        .then(r => r.json()),
    refetchInterval: 15000,
  });

  const { data: allItems } = useQuery<FlaggedItem[]>({
    queryKey: ["/api/admin/flagged", "all"],
    queryFn: () => fetch("/api/admin/flagged").then(r => r.json()),
    refetchInterval: 15000,
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/admin/flagged/${id}`, { status }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/flagged"] }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/flagged/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/flagged"] }); },
  });

  const createMutation = useMutation({
    mutationFn: (data: { contentType: string; contentId: string; reason: string }) =>
      apiRequest("POST", "/api/admin/flagged", data),
    onSuccess: () => {
      setShowAddFlag(false);
      setAddForm({ contentType: "profile", contentId: "", reason: FLAG_REASONS[0] });
      setAddError("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/flagged"] });
    },
  });

  const pendingCount = (allItems ?? []).filter(i => i.status === "pending").length;

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {(["pending", "approved", "removed", "all"] as const).map(s => (
            <button
              key={s}
              data-testid={`btn-filter-${s}`}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-md font-mono text-xs tracking-wide uppercase transition-colors ${
                statusFilter === s
                  ? "bg-white shadow-sm text-gray-800 font-semibold"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {s}
              {s === "pending" && pendingCount > 0 && (
                <span className="ml-1.5 bg-amber-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <span className="ml-auto" />
        <button
          data-testid="btn-add-flag"
          onClick={() => setShowAddFlag(!showAddFlag)}
          className={C.btnGhost}
        ><Flag size={12} /> Flag Content</button>
      </div>

      {/* Manual Flag Form */}
      {showAddFlag && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-sm text-amber-800 flex items-center gap-2">
            <Flag size={14} className="text-amber-600" /> Flag Content Manually
          </h3>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="font-mono text-xs text-gray-500 uppercase tracking-widest">Type</label>
              <select
                data-testid="select-flag-type"
                value={addForm.contentType}
                onChange={e => setAddForm(f => ({ ...f, contentType: e.target.value }))}
                className="border border-gray-200 rounded-lg px-2 py-1.5 font-mono text-xs bg-white text-gray-700 focus:outline-none focus:border-[#f5a623]"
              >
                <option value="profile">Profile Greeting</option>
                <option value="message">Voice Message</option>
              </select>
            </div>
            <div className="space-y-1 flex-1 min-w-48">
              <label className="font-mono text-xs text-gray-500 uppercase tracking-widest">Content ID (UUID)</label>
              <input
                data-testid="input-flag-content-id"
                type="text"
                placeholder="paste UUID here…"
                value={addForm.contentId}
                onChange={e => setAddForm(f => ({ ...f, contentId: e.target.value.trim() }))}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 font-mono text-xs bg-white text-gray-700 focus:outline-none focus:border-[#f5a623]"
              />
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs text-gray-500 uppercase tracking-widest">Reason</label>
              <select
                data-testid="select-flag-reason"
                value={addForm.reason}
                onChange={e => setAddForm(f => ({ ...f, reason: e.target.value }))}
                className="border border-gray-200 rounded-lg px-2 py-1.5 font-mono text-xs bg-white text-gray-700 focus:outline-none focus:border-[#f5a623]"
              >
                {FLAG_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <button
              data-testid="btn-submit-flag"
              onClick={() => {
                setAddError("");
                if (!addForm.contentId) { setAddError("Content ID is required."); return; }
                createMutation.mutate(addForm);
              }}
              disabled={createMutation.isPending}
              className={C.btnPrimary}
            >
              {createMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Flag size={12} />}
              Submit Flag
            </button>
            <button data-testid="btn-cancel-flag" onClick={() => setShowAddFlag(false)} className={C.btnGhost}>Cancel</button>
          </div>
          {addError && <p className="font-mono text-xs text-red-500">{addError}</p>}
        </div>
      )}

      {/* Cards */}
      {isLoading ? (
        <div className="py-16 text-center text-gray-400 font-mono text-xs tracking-widest">
          <Loader2 size={16} className="inline animate-spin mr-2" />LOADING…
        </div>
      ) : !items || items.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-gray-200 rounded-xl">
          <Flag size={28} className="mx-auto mb-3 text-gray-300" />
          <div className="text-gray-400 font-medium text-sm">
            {statusFilter === "pending" ? "No pending flags — you're all caught up" : "No items in this category"}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map(item => (
            <FlaggedCard
              key={item.id}
              item={item}
              onResolve={(id, status) => resolveMutation.mutate({ id, status })}
              onDelete={id => deleteMutation.mutate(id)}
              resolving={resolveMutation.isPending}
              deleting={deleteMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── AnnouncementsTab ──────────────────────────────────────────────────────────
interface MotdSettings {
  motdEnabled: boolean; motdText: string | null;
  motdMainMenuEnabled: boolean; motdMainMenuText: string | null;
  motdMaleBoxEnabled: boolean; motdMaleBoxText: string | null;
  motdPostPurchaseEnabled: boolean; motdPostPurchaseText: string | null;
}

const MOTD_SLOTS = [
  {
    key: "entry" as const,
    label: "Entry Greeting",
    where: "Plays right after the welcome greeting and disclaimer — before the membership number prompt. Every caller hears this on every call.",
    audioFile: "motd.mp3",
    enabledField: "motdEnabled" as keyof MotdSettings,
    textField: "motdText" as keyof MotdSettings,
  },
  {
    key: "mainMenu" as const,
    label: "Main Menu",
    where: "Plays at the top of the main menu after the balance announcement — before menu options are read out.",
    audioFile: "motd_main_menu.mp3",
    enabledField: "motdMainMenuEnabled" as keyof MotdSettings,
    textField: "motdMainMenuText" as keyof MotdSettings,
  },
  {
    key: "phoneBooth" as const,
    label: "Male Box",
    where: "Plays when a caller enters the male box (live connector), immediately after the male box welcome message.",
    audioFile: "motd_phone_booth.mp3",
    enabledField: "motdMaleBoxEnabled" as keyof MotdSettings,
    textField: "motdMaleBoxText" as keyof MotdSettings,
  },
  {
    key: "postPurchase" as const,
    label: "After Purchase",
    where: "Plays immediately after a caller successfully completes a membership payment — before returning to the main menu.",
    audioFile: "motd_post_purchase.mp3",
    enabledField: "motdPostPurchaseEnabled" as keyof MotdSettings,
    textField: "motdPostPurchaseText" as keyof MotdSettings,
  },
];

function AnnouncementsTab() {
  const { toast } = useToast();
  const [localState, setLocalState] = useState<Partial<MotdSettings>>({});

  const { data: settings, isLoading } = useQuery<MotdSettings>({
    queryKey: ["/api/admin/membership-settings"],
  });

  const saveMutation = useMutation({
    mutationFn: (body: Partial<MotdSettings>) =>
      apiRequest("PUT", "/api/admin/membership-settings", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/membership-settings"] });
      setLocalState({});
      toast({ title: "Saved", description: "Announcement settings updated." });
    },
    onError: () => toast({ title: "Error", description: "Failed to save.", variant: "destructive" }),
  });

  const merged = { ...settings, ...localState } as MotdSettings;
  const isDirty = Object.keys(localState).length > 0;

  const setField = (field: keyof MotdSettings, value: boolean | string) =>
    setLocalState(prev => ({ ...prev, [field]: value }));

  if (isLoading) return (
    <div className="flex items-center gap-2 text-gray-400 font-mono text-xs py-16 justify-center">
      <Loader2 size={14} className="animate-spin" /> Loading…
    </div>
  );

  return (
    <div className="max-w-2xl space-y-5">
      <p className="font-mono text-xs text-gray-500">
        Each announcement slot is independent — enable or disable them individually. All disabled by default.
      </p>

      {MOTD_SLOTS.map(slot => {
        const enabled = (merged[slot.enabledField] as boolean) ?? false;
        const text = (merged[slot.textField] as string) ?? "";
        return (
          <div key={slot.key} className={`rounded-xl border bg-white overflow-hidden transition-all ${enabled ? "border-amber-300 shadow-sm" : "border-gray-200"}`}>
            {/* Header row */}
            <div className={`flex items-center justify-between px-5 py-3 ${enabled ? "bg-amber-50" : "bg-gray-50"}`}>
              <div className="flex items-center gap-3">
                <Megaphone size={15} className={enabled ? "text-amber-600" : "text-gray-400"} />
                <div>
                  <p className="font-mono font-bold text-xs tracking-widest uppercase text-gray-800">{slot.label}</p>
                  <p className={`text-xs mt-0.5 ${enabled ? "text-amber-700" : "text-gray-400"}`}>
                    {enabled ? "Enabled — callers will hear this" : "Disabled"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setField(slot.enabledField, !enabled)}
                className="flex items-center gap-2 transition-colors"
              >
                {enabled
                  ? <ToggleRight size={34} className="text-amber-500" />
                  : <ToggleLeft size={34} className="text-gray-300" />}
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-gray-500">{slot.where}</p>
              <textarea
                value={text}
                onChange={e => setField(slot.textField, e.target.value)}
                disabled={!enabled}
                rows={3}
                placeholder="Type the announcement text here…"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f5a623]/40 resize-none disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="text-xs text-gray-400">
                Tip: generate <span className="font-mono bg-gray-100 px-1 rounded">{slot.audioFile}</span> in the Audio Gen tab for a premium voice. If that file exists it plays instead of text-to-speech.
              </p>
            </div>
          </div>
        );
      })}

      {/* Save */}
      <div className="flex justify-end pt-1">
        <button
          onClick={() => saveMutation.mutate(localState)}
          disabled={saveMutation.isPending || !isDirty}
          className={C.btnPrimary}
        >
          {saveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          Save Changes
        </button>
      </div>
    </div>
  );
}

// ── PromoCodesTab ─────────────────────────────────────────────────────────────
interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  valueMinutes: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  redemptionCount: number;
}

interface PromoRedemption {
  id: string;
  promoCodeId: string;
  userId: string;
  secondsAwarded: number;
  redeemedAt: string | null;
  phoneNumber: string;
}

function PromoCodesTab() {
  const { toast } = useToast();
  const [newCode, setNewCode] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newMinutes, setNewMinutes] = useState("");
  const [newMaxUses, setNewMaxUses] = useState("");
  const [newExpiry, setNewExpiry] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: codes = [], isLoading } = useQuery<PromoCode[]>({
    queryKey: ["/api/admin/promo-codes"],
  });

  const { data: redemptions = [] } = useQuery<PromoRedemption[]>({
    queryKey: ["/api/admin/promo-codes", expandedId, "redemptions"],
    enabled: !!expandedId,
  });

  const createMutation = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/admin/promo-codes", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      setNewCode(""); setNewDesc(""); setNewMinutes(""); setNewMaxUses(""); setNewExpiry("");
      toast({ title: "Promo code created" });
    },
    onError: (e: any) => toast({ title: e?.message ?? "Failed to create promo code", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/admin/promo-codes/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] }),
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/promo-codes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      toast({ title: "Promo code deleted" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  function handleCreate() {
    if (!newCode.trim() || !newMinutes || Number(newMinutes) < 1) return;
    createMutation.mutate({
      code: newCode.trim(),
      description: newDesc.trim() || null,
      valueMinutes: Number(newMinutes),
      maxUses: newMaxUses ? Number(newMaxUses) : null,
      expiresAt: newExpiry || null,
      isActive: true,
    });
  }

  const activeCount = codes.filter(c => c.isActive).length;
  const totalRedemptions = codes.reduce((s, c) => s + c.redemptionCount, 0);

  function fmtExpiry(raw: string | null) {
    if (!raw) return "—";
    const d = new Date(raw);
    return d < new Date() ? <span className="text-red-500">{d.toLocaleDateString()} (expired)</span> : d.toLocaleDateString();
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className={C.cardAlt}>
          <div className={C.statLabel}>Total Codes</div>
          <div className={C.statValue}>{codes.length}</div>
        </div>
        <div className={C.cardAlt}>
          <div className={C.statLabel}>Active</div>
          <div className={C.statValue}>{activeCount}</div>
        </div>
        <div className={C.cardAlt}>
          <div className={C.statLabel}>Total Redemptions</div>
          <div className={C.statValue}>{totalRedemptions}</div>
        </div>
      </div>

      {/* Create form */}
      <div className={C.card}>
        <h3 className="text-gray-800 font-mono text-sm font-bold tracking-widest uppercase flex items-center gap-2">
          <PlusCircle size={14} className="text-[#f5a623]" /> Create Promo Code
        </h3>
        <p className="text-gray-400 font-mono text-xs -mt-1">
          Callers press 5 on the main menu then dial the code and press #. Codes are stored uppercase.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className={C.label}>Code</label>
            <input
              data-testid="input-promo-code"
              value={newCode}
              onChange={e => setNewCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              placeholder="e.g. SUMMER25"
              maxLength={20}
              className={C.input}
            />
          </div>
          <div>
            <label className={C.label}>Free Minutes</label>
            <input
              data-testid="input-promo-minutes"
              type="number"
              min={1}
              value={newMinutes}
              onChange={e => setNewMinutes(e.target.value)}
              placeholder="e.g. 30"
              className={C.input}
            />
          </div>
          <div>
            <label className={C.label}>Max Uses (blank = unlimited)</label>
            <input
              data-testid="input-promo-max-uses"
              type="number"
              min={1}
              value={newMaxUses}
              onChange={e => setNewMaxUses(e.target.value)}
              placeholder="e.g. 100"
              className={C.input}
            />
          </div>
          <div>
            <label className={C.label}>Description (optional)</label>
            <input
              data-testid="input-promo-desc"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="e.g. Summer promo 2026"
              className={C.input}
            />
          </div>
          <div>
            <label className={C.label}>Expiry Date (optional)</label>
            <input
              data-testid="input-promo-expiry"
              type="date"
              value={newExpiry}
              onChange={e => setNewExpiry(e.target.value)}
              className={C.input}
            />
          </div>
        </div>
        <button
          data-testid="btn-create-promo"
          onClick={handleCreate}
          disabled={!newCode.trim() || !newMinutes || Number(newMinutes) < 1 || createMutation.isPending}
          className={C.btnPrimary}
        >
          {createMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Create Code
        </button>
      </div>

      {/* Table */}
      <div className={C.card}>
        <h3 className="text-gray-800 font-mono text-sm font-bold tracking-widest uppercase">All Promo Codes</h3>
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-400" size={20} /></div>
        ) : codes.length === 0 ? (
          <p className="text-xs text-gray-400 font-mono text-center py-8">No promo codes yet. Create one above.</p>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={C.th}>Code</th>
                  <th className={C.th}>Description</th>
                  <th className={C.th}>Minutes</th>
                  <th className={C.th}>Used / Max</th>
                  <th className={C.th}>Expires</th>
                  <th className={C.th}>Status</th>
                  <th className={C.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {codes.map(promo => {
                  const isExpanded = expandedId === promo.id;
                  const isExpired = promo.expiresAt ? new Date(promo.expiresAt) < new Date() : false;
                  return (
                    <>
                      <tr key={promo.id} data-testid={`row-promo-${promo.id}`} className={C.row}>
                        <td className={C.td}>
                          <span className="font-mono font-bold text-sm tracking-widest text-gray-900">{promo.code}</span>
                        </td>
                        <td className={C.td}>
                          <span className="text-gray-500 text-xs">{promo.description || <span className="italic text-gray-300">—</span>}</span>
                        </td>
                        <td className={C.td}>
                          <span className="text-amber-700 font-bold">{promo.valueMinutes}</span>
                          <span className="text-gray-400 text-xs ml-1">min</span>
                        </td>
                        <td className={C.td}>
                          <span className={promo.maxUses !== null && promo.usedCount >= promo.maxUses ? "text-red-500 font-bold" : "text-gray-700"}>
                            {promo.usedCount}
                          </span>
                          <span className="text-gray-400"> / {promo.maxUses ?? "∞"}</span>
                        </td>
                        <td className={C.td + " text-xs"}>{fmtExpiry(promo.expiresAt)}</td>
                        <td className={C.td}>
                          <span className={`${C.badge} ${promo.isActive && !isExpired ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-gray-50 text-gray-400"}`}>
                            {promo.isActive && !isExpired ? <CheckCircle size={10} /> : <AlertCircle size={10} />}
                            {isExpired ? "Expired" : promo.isActive ? "Active" : "Disabled"}
                          </span>
                        </td>
                        <td className={C.td}>
                          <div className="flex items-center gap-1.5">
                            <button
                              data-testid={`btn-toggle-promo-${promo.id}`}
                              onClick={() => toggleMutation.mutate({ id: promo.id, isActive: !promo.isActive })}
                              disabled={toggleMutation.isPending}
                              className={C.btnGhost + " text-[10px]"}
                              title={promo.isActive ? "Disable" : "Enable"}
                            >
                              {promo.isActive ? <MinusCircle size={10} /> : <PlusCircle size={10} />}
                              {promo.isActive ? "Disable" : "Enable"}
                            </button>
                            <button
                              data-testid={`btn-redemptions-promo-${promo.id}`}
                              onClick={() => setExpandedId(isExpanded ? null : promo.id)}
                              className={`${C.btnSecondary} text-[10px]`}
                            >
                              <Users size={10} />
                              {promo.redemptionCount}
                            </button>
                            <button
                              data-testid={`btn-delete-promo-${promo.id}`}
                              onClick={() => deleteMutation.mutate(promo.id)}
                              disabled={deleteMutation.isPending}
                              className={C.btnDanger + " text-[10px]"}
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${promo.id}-redemptions`}>
                          <td colSpan={7} className="bg-gray-50 px-6 py-3 border-b border-gray-200">
                            <div className="font-mono text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                              Redemptions for {promo.code}
                            </div>
                            {redemptions.length === 0 ? (
                              <p className="text-gray-400 font-mono text-xs">No redemptions yet.</p>
                            ) : (
                              <table className="w-full max-w-2xl">
                                <thead>
                                  <tr>
                                    <th className="text-left text-[10px] font-mono text-gray-400 uppercase tracking-widest pb-1 pr-6">Phone</th>
                                    <th className="text-left text-[10px] font-mono text-gray-400 uppercase tracking-widest pb-1 pr-6">Minutes Awarded</th>
                                    <th className="text-left text-[10px] font-mono text-gray-400 uppercase tracking-widest pb-1">Redeemed At</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {redemptions.map(r => (
                                    <tr key={r.id}>
                                      <td className="font-mono text-xs text-gray-700 pr-6 py-1">{r.phoneNumber}</td>
                                      <td className="font-mono text-xs text-amber-700 font-bold pr-6 py-1">{Math.floor(r.secondsAwarded / 60)} min</td>
                                      <td className="font-mono text-xs text-gray-400 py-1">{r.redeemedAt ? new Date(r.redeemedAt).toLocaleString() : "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── ZipCodesTab ───────────────────────────────────────────────────────────────
interface ZipEntry {
  id: string;
  code: string;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  audioFile: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
}

function ZipCodesTab() {
  const { toast } = useToast();
  const [newCode, setNewCode] = useState("");
  const [newNeighborhood, setNewNeighborhood] = useState("");
  const [newLat, setNewLat] = useState("");
  const [newLon, setNewLon] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [editingLat, setEditingLat] = useState("");
  const [editingLon, setEditingLon] = useState("");

  const { data: entries = [], isLoading } = useQuery<ZipEntry[]>({
    queryKey: ["/api/admin/zip-codes"],
  });

  const addMutation = useMutation({
    mutationFn: (body: { code: string; neighborhood: string; latitude?: string; longitude?: string }) =>
      apiRequest("POST", "/api/admin/zip-codes", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/zip-codes"] });
      setNewCode("");
      setNewNeighborhood("");
      setNewLat("");
      setNewLon("");
      toast({ title: "Zip code saved" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, neighborhood, latitude, longitude }: { id: string; neighborhood: string; latitude?: string; longitude?: string }) =>
      apiRequest("PATCH", `/api/admin/zip-codes/${id}`, { neighborhood, latitude, longitude }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/zip-codes"] });
      setEditingId(null);
      toast({ title: "Zip code updated" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/zip-codes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/zip-codes"] });
      toast({ title: "Entry removed" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {/* Add form */}
      <div className={C.panel}>
        <div className={C.panelHeader}>Add / Update Zip Code</div>
        <div className={C.panelBody + " p-4"}>
          <p className="text-xs text-gray-500 font-mono mb-3">
            Enter a zip code, neighborhood name, and optional coordinates. Coordinates are used for proximity sorting.
            If the zip already exists it will be updated.
          </p>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-mono text-gray-500 uppercase tracking-widest">Zip Code</label>
              <input
                data-testid="input-zip-code"
                value={newCode}
                onChange={e => setNewCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                placeholder="e.g. 90210"
                maxLength={5}
                className="border border-gray-300 rounded px-3 py-1.5 text-sm font-mono w-28 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
              <label className="text-xs font-mono text-gray-500 uppercase tracking-widest">Neighborhood Name</label>
              <input
                data-testid="input-neighborhood"
                value={newNeighborhood}
                onChange={e => setNewNeighborhood(e.target.value)}
                placeholder="e.g. Beverly Hills"
                className="border border-gray-300 rounded px-3 py-1.5 text-sm font-mono w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-mono text-gray-500 uppercase tracking-widest">Latitude</label>
              <input
                data-testid="input-latitude"
                value={newLat}
                onChange={e => setNewLat(e.target.value)}
                placeholder="e.g. 34.0901"
                className="border border-gray-300 rounded px-3 py-1.5 text-sm font-mono w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-mono text-gray-500 uppercase tracking-widest">Longitude</label>
              <input
                data-testid="input-longitude"
                value={newLon}
                onChange={e => setNewLon(e.target.value)}
                placeholder="e.g. -118.4065"
                className="border border-gray-300 rounded px-3 py-1.5 text-sm font-mono w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              data-testid="btn-save-zip"
              onClick={() => addMutation.mutate({ code: newCode, neighborhood: newNeighborhood, latitude: newLat || undefined, longitude: newLon || undefined })}
              disabled={newCode.length !== 5 || !newNeighborhood.trim() || addMutation.isPending}
              className={C.btnPrimary + " self-end"}
            >
              {addMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className={C.panel}>
        <div className={C.panelHeader}>
          Zip Code Directory <span className="opacity-60 font-normal ml-2">({entries.length})</span>
        </div>
        <div className={C.panelBody}>
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-400" size={20} /></div>
          ) : entries.length === 0 ? (
            <p className="text-xs text-gray-400 font-mono text-center py-8">No zip codes on file yet.</p>
          ) : (
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500 uppercase tracking-widest text-[10px]">
                  <th className="px-4 py-2.5">Zip</th>
                  <th className="px-4 py-2.5">Neighborhood / City</th>
                  <th className="px-4 py-2.5">Audio File</th>
                  <th className="px-4 py-2.5">Lat / Lon</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <tr key={entry.id} data-testid={`row-zip-${entry.id}`} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-bold">{entry.code}</td>
                    <td className="px-4 py-2.5">
                      {editingId === entry.id ? (
                        <input
                          data-testid={`input-edit-neighborhood-${entry.id}`}
                          value={editingValue}
                          onChange={e => setEditingValue(e.target.value)}
                          className="border border-gray-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
                          autoFocus
                        />
                      ) : (
                        <span className={entry.neighborhood ? "text-gray-800" : "text-gray-400 italic"}>
                          {entry.neighborhood || entry.city || "—"}
                          {entry.city && entry.neighborhood && entry.city !== entry.neighborhood && (
                            <span className="text-gray-400 ml-1">({entry.city})</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {entry.audioFile ? (
                        <span
                          data-testid={`text-audiofile-${entry.id}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 font-mono text-[10px]"
                          title={entry.audioFile}
                        >
                          <Volume2 size={10} />
                          {entry.audioFile}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400">
                      {editingId === entry.id ? (
                        <div className="flex gap-1.5 items-center">
                          <input
                            data-testid={`input-edit-lat-${entry.id}`}
                            value={editingLat}
                            onChange={e => setEditingLat(e.target.value)}
                            placeholder="Lat"
                            className="border border-gray-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 w-24"
                          />
                          <input
                            data-testid={`input-edit-lon-${entry.id}`}
                            value={editingLon}
                            onChange={e => setEditingLon(e.target.value)}
                            placeholder="Lon"
                            className="border border-gray-300 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 w-24"
                          />
                        </div>
                      ) : (
                        entry.latitude != null && entry.longitude != null
                          ? `${entry.latitude.toFixed(4)}, ${entry.longitude.toFixed(4)}`
                          : "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex gap-2 justify-end">
                        {editingId === entry.id ? (
                          <>
                            <button
                              data-testid={`btn-confirm-edit-${entry.id}`}
                              onClick={() => updateMutation.mutate({ id: entry.id, neighborhood: editingValue, latitude: editingLat || undefined, longitude: editingLon || undefined })}
                              disabled={!editingValue.trim() || updateMutation.isPending}
                              className="text-green-600 hover:text-green-800 transition-colors"
                              title="Save changes"
                            >
                              <CheckCircle2 size={14} />
                            </button>
                            <button
                              data-testid={`btn-cancel-edit-${entry.id}`}
                              onClick={() => setEditingId(null)}
                              className="text-gray-400 hover:text-gray-600 transition-colors"
                              title="Cancel"
                            >
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <button
                            data-testid={`btn-edit-zip-${entry.id}`}
                            onClick={() => {
                              setEditingId(entry.id);
                              setEditingValue(entry.neighborhood ?? "");
                              setEditingLat(entry.latitude != null ? String(entry.latitude) : "");
                              setEditingLon(entry.longitude != null ? String(entry.longitude) : "");
                            }}
                            className="text-gray-400 hover:text-blue-600 transition-colors"
                            title="Edit entry"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        <button
                          data-testid={`btn-delete-zip-${entry.id}`}
                          onClick={() => deleteMutation.mutate(entry.id)}
                          disabled={deleteMutation.isPending}
                          className="text-gray-400 hover:text-red-600 transition-colors"
                          title="Remove entry"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── AuditLogTab ───────────────────────────────────────────────────────────────
interface AuditLogEntry {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  detail: string | null;
  performedBy: string;
  createdAt: string | null;
}

const ACTION_LABELS: Record<string, string> = {
  profile_uploaded:            "Profile Uploaded",
  profile_deleted:             "Profile Deleted",
  region_created:              "Region Created",
  region_updated:              "Region Updated",
  region_deleted:              "Region Deleted",
  caller_credited:             "Credits Adjusted",
  caller_blocked:              "Caller Blocked",
  caller_unblocked:            "Caller Unblocked",
  user_unblocked:              "Block Removed",
  content_flagged:             "Content Flagged",
  flagged_resolved:            "Flag Resolved",
  flagged_deleted:             "Flag Deleted",
  promo_code_created:          "Promo Code Created",
  promo_code_updated:          "Promo Code Updated",
  promo_code_deleted:          "Promo Code Deleted",
  zip_code_created:            "Zip Code Added",
  zip_code_updated:            "Zip Code Updated",
  zip_code_deleted:            "Zip Code Deleted",
  audio_generated:             "Audio Generated",
  audio_deleted:               "Audio Deleted",
  membership_settings_updated: "Membership Settings Updated",
};

const ACTION_COLORS: Record<string, string> = {
  profile_uploaded:            "bg-blue-100 text-blue-700",
  profile_deleted:             "bg-red-100 text-red-700",
  region_created:              "bg-green-100 text-green-700",
  region_updated:              "bg-amber-100 text-amber-700",
  region_deleted:              "bg-red-100 text-red-700",
  caller_credited:             "bg-emerald-100 text-emerald-700",
  caller_blocked:              "bg-red-100 text-red-700",
  caller_unblocked:            "bg-green-100 text-green-700",
  user_unblocked:              "bg-green-100 text-green-700",
  content_flagged:             "bg-orange-100 text-orange-700",
  flagged_resolved:            "bg-blue-100 text-blue-700",
  flagged_deleted:             "bg-red-100 text-red-700",
  promo_code_created:          "bg-purple-100 text-purple-700",
  promo_code_updated:          "bg-amber-100 text-amber-700",
  promo_code_deleted:          "bg-red-100 text-red-700",
  zip_code_created:            "bg-teal-100 text-teal-700",
  zip_code_updated:            "bg-amber-100 text-amber-700",
  zip_code_deleted:            "bg-red-100 text-red-700",
  audio_generated:             "bg-indigo-100 text-indigo-700",
  audio_deleted:               "bg-red-100 text-red-700",
  membership_settings_updated: "bg-gray-100 text-gray-700",
};

function AuditLogTab() {
  const { data: logs, isLoading, refetch, isFetching } = useQuery<AuditLogEntry[]>({
    queryKey: ["/api/admin/audit-logs"],
    refetchOnWindowFocus: false,
  });

  function fmtTime(raw: string | null) {
    if (!raw) return "—";
    const d = new Date(raw);
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  }

  function fmtDetail(entry: AuditLogEntry): string {
    if (entry.action === "caller_credited" && entry.detail) {
      try {
        const { deltaSeconds } = JSON.parse(entry.detail);
        const mins = Math.abs(Math.round(deltaSeconds / 60));
        return deltaSeconds >= 0 ? `+${mins} min` : `−${mins} min`;
      } catch { return ""; }
    }
    if (entry.action === "flagged_resolved" && entry.detail) {
      try {
        const { status } = JSON.parse(entry.detail);
        return status;
      } catch { return ""; }
    }
    return "";
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 font-mono text-xs tracking-widest">
        <Loader2 size={16} className="animate-spin mr-2" /> Loading audit log…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-gray-500 tracking-widest uppercase">Last 300 admin actions, newest first</p>
        <button
          data-testid="btn-refresh-audit-log"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded text-xs font-mono text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {(!logs || logs.length === 0) ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="font-mono text-xs text-gray-400 uppercase tracking-widest">No admin actions recorded yet</p>
          <p className="font-mono text-[10px] text-gray-300 mt-1">Actions you take in the admin panel will appear here</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-widest text-gray-400 font-normal">Time</th>
                <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-widest text-gray-400 font-normal">Action</th>
                <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-widest text-gray-400 font-normal">Target</th>
                <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-widest text-gray-400 font-normal">Detail</th>
                <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-widest text-gray-400 font-normal">By</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr
                  key={log.id}
                  data-testid={`audit-row-${log.id}`}
                  className={`border-b border-gray-50 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
                >
                  <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">{fmtTime(log.createdAt)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${ACTION_COLORS[log.action] ?? "bg-gray-100 text-gray-600"}`}>
                      {ACTION_LABELS[log.action] ?? log.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-700">
                    {log.targetLabel && <span className="font-semibold">{log.targetLabel}</span>}
                    {log.targetType && !log.targetLabel && <span className="text-gray-400 italic">{log.targetType}</span>}
                    {!log.targetLabel && !log.targetType && <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{fmtDetail(log) || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-400">{log.performedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── AnalyticsTab ──────────────────────────────────────────────────────────────
interface AnalyticsData {
  funnel: { totalCallers: number; withProfile: number; withMessage: number; withMembership: number };
  peakByHour: { hour: number; calls: number }[];
  peakByDay: { day: number; calls: number }[];
  retention: { oneTime: number; occasional: number; regular: number };
  revenue: {
    plan1Count: number; plan2Count: number; plan3Count: number;
    plan1Name: string; plan2Name: string; plan3Name: string;
    plan1PriceCents: number; plan2PriceCents: number; plan3PriceCents: number;
    estimatedMrrCents: number;
  };
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_LABELS = (h: number) => {
  if (h === 0) return "12a";
  if (h === 12) return "12p";
  return h < 12 ? `${h}a` : `${h - 12}p`;
};

function FunnelBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div data-testid={`funnel-${label.toLowerCase().replace(/\s+/g, "-")}`} className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="font-mono text-xs text-gray-600 uppercase tracking-widest">{label}</span>
        <span className="font-mono text-xs font-bold text-gray-900">{value.toLocaleString()} <span className="text-gray-400 font-normal">({pct}%)</span></span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AnalyticsTab() {
  const { data, isLoading, refetch, isFetching } = useQuery<AnalyticsData>({
    queryKey: ["/api/admin/analytics"],
    refetchOnWindowFocus: false,
  });

  const fmtMoney = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 font-mono text-xs tracking-widest">
        <Loader2 size={16} className="animate-spin mr-2" /> Loading analytics…
      </div>
    );
  }
  if (!data) return null;

  const { funnel, peakByHour, peakByDay, retention, revenue } = data;
  const retentionTotal = retention.oneTime + retention.occasional + retention.regular;
  const retentionData = [
    { name: "First-timers", value: retention.oneTime, color: "#94a3b8" },
    { name: "Occasional (2–5)", value: retention.occasional, color: "#f59e0b" },
    { name: "Regulars (6+)", value: retention.regular, color: "#10b981" },
  ];

  const peakHourData = peakByHour.map(h => ({ name: HOUR_LABELS(h.hour), calls: h.calls }));
  const peakDayData = peakByDay.map(d => ({ name: DAY_LABELS[d.day], calls: d.calls }));

  const maxHour = Math.max(...peakByHour.map(h => h.calls), 1);
  const maxDay = Math.max(...peakByDay.map(d => d.calls), 1);

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-gray-500 tracking-widest uppercase">System usage &amp; revenue overview</p>
        <button
          data-testid="btn-refresh-analytics"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded text-xs font-mono text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* ── Revenue Report ── */}
      <section>
        <h3 className="font-mono font-bold text-xs tracking-widest uppercase text-gray-400 mb-4 flex items-center gap-2">
          <TrendingUp size={13} /> Revenue Report
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Estimated MRR */}
          <div data-testid="stat-estimated-mrr" className="md:col-span-1 bg-white border border-gray-200 rounded-lg p-5 flex flex-col gap-1">
            <p className="font-mono text-[10px] text-gray-400 uppercase tracking-widest">Est. Monthly Revenue</p>
            <p className="font-mono font-bold text-2xl text-gray-900">{fmtMoney(revenue.estimatedMrrCents)}</p>
            <p className="font-mono text-[10px] text-gray-400">Based on active memberships</p>
          </div>
          {/* Plan breakdown */}
          {[
            { name: revenue.plan1Name, count: revenue.plan1Count, price: revenue.plan1PriceCents, key: "plan1" },
            { name: revenue.plan2Name, count: revenue.plan2Count, price: revenue.plan2PriceCents, key: "plan2" },
            { name: revenue.plan3Name, count: revenue.plan3Count, price: revenue.plan3PriceCents, key: "plan3" },
          ].map(plan => (
            <div
              key={plan.key}
              data-testid={`stat-revenue-${plan.key}`}
              className="bg-white border border-gray-200 rounded-lg p-5 flex flex-col gap-1"
            >
              <p className="font-mono text-[10px] text-gray-400 uppercase tracking-widest">{plan.name}</p>
              <p className="font-mono font-bold text-2xl text-gray-900">{plan.count}</p>
              <p className="font-mono text-[10px] text-gray-400">{fmtMoney(plan.price)}/mo · {fmtMoney(plan.count * plan.price)} est.</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Conversion Funnel ── */}
      <section>
        <h3 className="font-mono font-bold text-xs tracking-widest uppercase text-gray-400 mb-4 flex items-center gap-2">
          <BarChart2 size={13} /> Conversion Funnel
        </h3>
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <FunnelBar label="Total Callers"   value={funnel.totalCallers}   max={funnel.totalCallers} color="bg-blue-500" />
          <FunnelBar label="Recorded Profile" value={funnel.withProfile}    max={funnel.totalCallers} color="bg-indigo-500" />
          <FunnelBar label="Sent a Message"   value={funnel.withMessage}    max={funnel.totalCallers} color="bg-amber-500" />
          <FunnelBar label="Purchased Membership" value={funnel.withMembership} max={funnel.totalCallers} color="bg-emerald-500" />
        </div>
      </section>

      {/* ── Peak Usage ── */}
      <section>
        <h3 className="font-mono font-bold text-xs tracking-widest uppercase text-gray-400 mb-4 flex items-center gap-2">
          <BarChart2 size={13} /> Peak Usage
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* By Hour */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <p className="font-mono text-xs text-gray-500 uppercase tracking-widest mb-4">Calls by Hour of Day</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={peakHourData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 9, fontFamily: "monospace" }} interval={2} />
                <YAxis tick={{ fontSize: 9, fontFamily: "monospace" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 11, fontFamily: "monospace", borderRadius: 6 }}
                  formatter={(v: number) => [v, "calls"]}
                />
                <Bar dataKey="calls" radius={[2, 2, 0, 0]}>
                  {peakHourData.map((entry, i) => (
                    <Cell key={i} fill={entry.calls === maxHour ? "#f5a623" : "#e5e7eb"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* By Day */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <p className="font-mono text-xs text-gray-500 uppercase tracking-widest mb-4">Calls by Day of Week</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={peakDayData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 9, fontFamily: "monospace" }} />
                <YAxis tick={{ fontSize: 9, fontFamily: "monospace" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 11, fontFamily: "monospace", borderRadius: 6 }}
                  formatter={(v: number) => [v, "calls"]}
                />
                <Bar dataKey="calls" radius={[2, 2, 0, 0]}>
                  {peakDayData.map((entry, i) => (
                    <Cell key={i} fill={entry.calls === maxDay ? "#f5a623" : "#e5e7eb"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* ── Retention ── */}
      <section>
        <h3 className="font-mono font-bold text-xs tracking-widest uppercase text-gray-400 mb-4 flex items-center gap-2">
          <Users size={13} /> Caller Retention
        </h3>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {retentionData.map(seg => {
              const pct = retentionTotal > 0 ? Math.round((seg.value / retentionTotal) * 100) : 0;
              return (
                <div key={seg.name} data-testid={`stat-retention-${seg.name.toLowerCase().replace(/\s+/g, "-")}`} className="text-center space-y-2">
                  <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center" style={{ background: `${seg.color}20` }}>
                    <span className="font-mono font-bold text-sm" style={{ color: seg.color }}>{pct}%</span>
                  </div>
                  <p className="font-mono font-bold text-xl text-gray-900">{seg.value.toLocaleString()}</p>
                  <p className="font-mono text-[10px] text-gray-400 uppercase tracking-widest">{seg.name}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-6 h-3 bg-gray-100 rounded-full overflow-hidden flex">
            {retentionData.map(seg => (
              <div
                key={seg.name}
                style={{
                  width: retentionTotal > 0 ? `${(seg.value / retentionTotal) * 100}%` : "0%",
                  background: seg.color,
                }}
              />
            ))}
          </div>
          <div className="mt-2 flex gap-4 justify-center">
            {retentionData.map(seg => (
              <div key={seg.name} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: seg.color }} />
                <span className="font-mono text-[10px] text-gray-500">{seg.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}

// ── Membership Cards Tab ───────────────────────────────────────────────────────
interface MembershipCard {
  id: string;
  cardNumber: string;
  pin: string | null;
  valueSeconds: number;
  phoneNumber: string | null;
  notes: string | null;
  createdAt: string;
  firstUsedAt: string | null;
}

function MembershipCardsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [planKey, setPlanKey] = useState("plan1");
  const [count, setCount] = useState(1);
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [search, setSearch] = useState("");

  interface MsSettings { plan1Name: string; plan1Minutes: number; plan2Name: string; plan2Minutes: number; plan3Name: string; plan3Minutes: number; }
  const { data: ms } = useQuery<MsSettings>({ queryKey: ["/api/admin/membership-settings"] });

  const { data: cards = [], isLoading } = useQuery<MembershipCard[]>({
    queryKey: ["/api/admin/cards"],
  });

  const planOptions = ms ? [
    { key: "plan1", label: `${ms.plan1Name} — ${ms.plan1Minutes.toLocaleString()} min` },
    { key: "plan2", label: `${ms.plan2Name} — ${ms.plan2Minutes.toLocaleString()} min` },
    { key: "plan3", label: `${ms.plan3Name} — ${ms.plan3Minutes.toLocaleString()} min` },
  ] : [];

  const createMutation = useMutation({
    mutationFn: (body: { planKey: string; count: number; notes?: string }) =>
      apiRequest("POST", "/api/admin/cards", body),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/cards"] });
      setNotes("");
      setCount(1);
      const qty = Array.isArray(data) ? data.length : 1;
      toast({ title: `${qty} card${qty !== 1 ? "s" : ""} generated` });
    },
    onError: async (err: any) => {
      const msg = await err.response?.json().catch(() => null);
      toast({ title: "Error", description: msg?.message ?? "Failed to generate cards", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      apiRequest("PATCH", `/api/admin/cards/${id}`, { notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/cards"] });
      setEditingId(null);
      toast({ title: "Notes updated" });
    },
    onError: () => toast({ title: "Error", description: "Failed to update notes", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/cards/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/cards"] });
      toast({ title: "Card deleted" });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete card", variant: "destructive" }),
  });

  const filtered = cards.filter(c =>
    c.cardNumber.includes(search) ||
    (c.phoneNumber ?? "").includes(search) ||
    (c.notes ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const linked = cards.filter(c => c.phoneNumber).length;
  const unlinked = cards.length - linked;

  return (
    <div className="space-y-6">
      {/* ── Stats row ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Cards", value: cards.length },
          { label: "Linked", value: linked },
          { label: "Unlinked", value: unlinked },
        ].map(s => (
          <div key={s.label} className={C.card + " text-center"}>
            <p className="text-2xl font-bold text-gray-800">{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Generate cards ── */}
      <div className={C.card}>
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Generate Membership Cards</h3>
        <div className="flex flex-wrap gap-3 items-end">

          {/* Plan dropdown */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Membership Package</label>
            <select
              data-testid="select-plan"
              value={planKey}
              onChange={e => setPlanKey(e.target.value)}
              className={C.input + " pr-8"}
              disabled={!ms}
            >
              {ms ? planOptions.map(o => (
                <option key={o.key} value={o.key}>{o.label}</option>
              )) : (
                <option value="">Loading plans…</option>
              )}
            </select>
          </div>

          {/* Count selector (1–10) */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Number of Cards</label>
            <div className="flex items-center gap-1">
              <button
                data-testid="btn-count-dec"
                onClick={() => setCount(c => Math.max(1, c - 1))}
                className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100 text-sm"
              >−</button>
              <span data-testid="text-count" className="w-8 text-center text-sm font-semibold text-gray-700">{count}</span>
              <button
                data-testid="btn-count-inc"
                onClick={() => setCount(c => Math.min(10, c + 1))}
                className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100 text-sm"
              >+</button>
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1 flex-1 min-w-48">
            <label className="text-xs text-gray-500">Batch Notes (optional)</label>
            <input
              data-testid="input-card-notes"
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Pride Event — June 2025"
              className={C.input}
            />
          </div>

          <button
            data-testid="btn-generate-cards"
            onClick={() => createMutation.mutate({ planKey, count, notes: notes || undefined })}
            disabled={createMutation.isPending || !ms}
            className={C.btnPrimary}
          >
            {createMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Generate {count === 1 ? "Card" : `${count} Cards`}
          </button>
        </div>

        <p className="text-xs text-gray-400 mt-3">
          Each card receives a unique 5-digit membership number and a 4-digit passcode.
          Neither may begin with 0.
        </p>
      </div>

      {/* ── Card list ── */}
      <div className={C.card}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">All Cards ({cards.length})</h3>
          <input
            data-testid="input-cards-search"
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search cards…"
            className={C.input + " w-48"}
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No membership cards found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500 text-left">
                  <th className="pb-2 pr-4">Card #</th>
                  <th className="pb-2 pr-4">PIN</th>
                  <th className="pb-2 pr-4">Minutes</th>
                  <th className="pb-2 pr-4">Phone</th>
                  <th className="pb-2 pr-4">Notes</th>
                  <th className="pb-2 pr-4">Created</th>
                  <th className="pb-2 pr-4">First Used</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(card => (
                  <tr key={card.id} data-testid={`row-card-${card.id}`} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-4 font-bold text-gray-800 tracking-widest">{card.cardNumber}</td>
                    <td className="py-2 pr-4 text-blue-700 font-bold tracking-widest">
                      {card.pin ?? <span className="text-gray-300 font-sans font-normal">—</span>}
                    </td>
                    <td className="py-2 pr-4 text-gray-600 font-sans">
                      {card.valueSeconds > 0 ? Math.round(card.valueSeconds / 60).toLocaleString() : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-2 pr-4 text-gray-600">
                      {card.phoneNumber
                        ? <span className="text-green-700">{card.phoneNumber}</span>
                        : <span className="text-gray-300 font-sans">unlinked</span>}
                    </td>
                    <td className="py-2 pr-4 text-gray-600 font-sans max-w-xs">
                      {editingId === card.id ? (
                        <div className="flex gap-1 items-center">
                          <input
                            data-testid={`input-notes-${card.id}`}
                            type="text"
                            value={editNotes}
                            onChange={e => setEditNotes(e.target.value)}
                            className={C.input + " text-xs h-6 px-1"}
                            autoFocus
                          />
                          <button
                            data-testid={`btn-save-notes-${card.id}`}
                            onClick={() => updateMutation.mutate({ id: card.id, notes: editNotes })}
                            disabled={updateMutation.isPending}
                            className="text-green-600 hover:text-green-800"
                          ><CheckCircle size={13} /></button>
                          <button
                            data-testid={`btn-cancel-notes-${card.id}`}
                            onClick={() => setEditingId(null)}
                            className="text-gray-400 hover:text-gray-600"
                          ><X size={13} /></button>
                        </div>
                      ) : (
                        <span
                          onClick={() => { setEditingId(card.id); setEditNotes(card.notes ?? ""); }}
                          className="cursor-pointer hover:text-blue-600"
                          title="Click to edit"
                        >
                          {card.notes ?? <span className="text-gray-300">—</span>}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-gray-400">{new Date(card.createdAt).toLocaleDateString()}</td>
                    <td className="py-2 pr-4 text-gray-400">
                      {card.firstUsedAt
                        ? <span className="text-green-600">{new Date(card.firstUsedAt).toLocaleDateString()}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-2">
                      <button
                        data-testid={`btn-delete-card-${card.id}`}
                        onClick={() => { if (confirm(`Delete card ${card.cardNumber}?`)) deleteMutation.mutate(card.id); }}
                        disabled={deleteMutation.isPending}
                        className="text-red-400 hover:text-red-600"
                      ><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── ModerationLogTab ──────────────────────────────────────────────────────────
function ModerationLogTab() {
  const [search, setSearch] = useState("");
  const { data: logs, isLoading, refetch } = useQuery<ModerationLogEntry[]>({
    queryKey: ["/api/admin/moderation-logs"],
    refetchInterval: 30000,
  });

  const EVENT_LABELS: Record<string, string> = {
    auto_flag: "Auto-Flagged",
    auto_remove: "Auto-Removed",
    auto_restrict: "Auto-Restricted",
    auto_ban: "Auto-Banned",
  };

  const RULE_LABELS: Record<string, string> = {
    threshold_flag: "Rule 1 — Flag Threshold",
    threshold_remove: "Flag Threshold Remove",
    block_count: "Rule 2 — Block Count",
    repeat_flag: "Rule 4 — Repeat Flagging",
    new_account_flag: "Rule 5 — New Account",
  };

  const filtered = (logs ?? []).filter(l =>
    !search.trim() ||
    (l.targetPhone ?? "").includes(search.trim()) ||
    (l.eventType ?? "").includes(search.toLowerCase()) ||
    (l.triggeredByRule ?? "").includes(search.toLowerCase()),
  );

  const EVENT_COLORS: Record<string, string> = {
    auto_flag: "border-amber-200 bg-amber-50 text-amber-700",
    auto_remove: "border-red-200 bg-red-50 text-red-600",
    auto_restrict: "border-orange-200 bg-orange-50 text-orange-600",
    auto_ban: "border-red-300 bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <input
          data-testid="input-modlog-search"
          type="text"
          placeholder="Search by phone, event type, rule…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-200 rounded px-3 py-1.5 font-mono text-xs bg-white text-gray-700 focus:outline-none w-64 focus:border-[#f5a623]"
        />
        <button data-testid="btn-refresh-modlog" onClick={() => refetch()} className={C.btnSecondary + " !py-1.5"}>
          <RefreshCw size={12} /> Refresh
        </button>
        <span className="ml-auto text-gray-400 font-mono text-xs">{filtered.length} event{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className={C.th}>Timestamp</th>
              <th className={C.th}>Phone</th>
              <th className={C.th}>Event</th>
              <th className={C.th}>Rule</th>
              <th className={C.th}>Content</th>
              <th className={C.th}>Reason</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400 font-mono text-xs tracking-widest">LOADING…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400 font-mono text-xs tracking-widest">
                {search ? "NO MATCHES" : "NO MODERATION EVENTS YET"}
              </td></tr>
            ) : filtered.map(log => (
              <tr key={log.id} data-testid={`row-modlog-${log.id}`} className={C.row}>
                <td className={C.td + " text-gray-400 text-xs whitespace-nowrap"}>
                  {log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}
                </td>
                <td className={C.td + " font-mono text-xs"}>{log.targetPhone ?? <span className="text-gray-400">—</span>}</td>
                <td className={C.td}>
                  <span className={`${C.badge} ${EVENT_COLORS[log.eventType] ?? "border-gray-200 bg-gray-50 text-gray-500"}`}>
                    {EVENT_LABELS[log.eventType] ?? log.eventType}
                  </span>
                </td>
                <td className={C.td + " text-gray-500 text-xs"}>{RULE_LABELS[log.triggeredByRule ?? ""] ?? log.triggeredByRule ?? "—"}</td>
                <td className={C.td + " text-gray-400 text-xs font-mono"}>
                  {log.contentType ? `${log.contentType}` : "—"}
                </td>
                <td className={C.td + " text-gray-600 text-xs max-w-xs truncate"}>{log.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── TranscriptionsTab ─────────────────────────────────────────────────────────
function TranscriptionsTab() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [cleanupResult, setCleanupResult] = useState<{
    retriedFailed: number;
    resetStuckPending: number;
    fixedBrokenLinks: number;
    deletedOrphanFiles: number;
  } | null>(null);

  const { data: profiles, isLoading } = useQuery<ProfileWithUser[]>({
    queryKey: ["/api/admin/transcriptions"],
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/transcriptions/${id}/dismiss`);
      if (!res.ok) throw new Error("Failed to dismiss");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/transcriptions"] }),
  });

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/cleanup");
      return res.json() as Promise<{ retriedFailed: number; resetStuckPending: number; fixedBrokenLinks: number; deletedOrphanFiles: number }>;
    },
    onSuccess: (data) => {
      setCleanupResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/transcriptions"] });
    },
  });

  const statusBadge = (status: string | null) => {
    if (!status) return <span className="text-gray-400 font-mono text-xs">No transcript</span>;
    if (status === "pending") return <span className="inline-flex items-center gap-1 text-amber-600 font-mono text-xs"><Loader2 size={10} className="animate-spin" /> Pending</span>;
    if (status === "completed") return <span className="inline-flex items-center gap-1 text-emerald-600 font-mono text-xs"><CheckCircle size={10} /> Done</span>;
    return <span className="inline-flex items-center gap-1 text-red-500 font-mono text-xs"><AlertCircle size={10} /> Failed</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`${C.heading} text-base`}>Greeting Transcriptions</h2>
          <p className={`${C.subtext} mt-1`}>Auto-generated transcripts of caller-recorded greetings. New recordings are transcribed automatically.</p>
        </div>
        <button
          data-testid="btn-run-cleanup"
          onClick={() => cleanupMutation.mutate()}
          disabled={cleanupMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-gray-300 rounded hover:bg-gray-50 text-gray-600 disabled:opacity-50 transition-colors"
        >
          {cleanupMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {cleanupMutation.isPending ? "Cleaning…" : "Run Auto-Cleanup"}
        </button>
      </div>

      {cleanupResult && (
        <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-4 space-y-2">
          <p className="text-xs font-mono font-semibold text-emerald-800 uppercase tracking-wide">Cleanup Complete</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-1">
            <div className="text-center">
              <div className="text-2xl font-bold font-mono text-emerald-700">{cleanupResult.retriedFailed}</div>
              <div className="text-[10px] font-mono text-emerald-600 mt-0.5">Failed → Retrying</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold font-mono text-emerald-700">{cleanupResult.resetStuckPending}</div>
              <div className="text-[10px] font-mono text-emerald-600 mt-0.5">Stuck Pending Reset</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold font-mono text-emerald-700">{cleanupResult.fixedBrokenLinks}</div>
              <div className="text-[10px] font-mono text-emerald-600 mt-0.5">Broken Links Fixed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold font-mono text-emerald-700">{cleanupResult.deletedOrphanFiles}</div>
              <div className="text-[10px] font-mono text-emerald-600 mt-0.5">Orphan Files Deleted</div>
            </div>
          </div>
          {cleanupResult.retriedFailed === 0 && cleanupResult.resetStuckPending === 0 && cleanupResult.fixedBrokenLinks === 0 && cleanupResult.deletedOrphanFiles === 0 && (
            <p className="text-xs text-emerald-600 font-mono">Everything is clean — no issues found.</p>
          )}
        </div>
      )}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className={C.th}>Phone</th>
              <th className={C.th}>System</th>
              <th className={C.th}>Duration</th>
              <th className={C.th}>Audio</th>
              <th className={C.th}>Status</th>
              <th className={C.th}>Transcript</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 font-mono text-xs tracking-widest">LOADING...</td></tr>
            ) : !profiles || profiles.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 font-mono text-xs tracking-widest">NO CALLER RECORDINGS FOUND</td></tr>
            ) : (
              profiles.map(p => {
                const isOpen = expanded[p.id];
                const isPending = p.transcriptionStatus === "pending";
                return (
                  <tr key={p.id} data-testid={`row-transcript-${p.id}`} className={C.row}>
                    <td className={C.td}>
                      <span data-testid={`text-phone-transcript-${p.id}`} className="font-mono text-sm text-gray-800">{p.phoneNumber}</span>
                    </td>
                    <td className={C.td}>
                      <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${p.siteCategory === "MW" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                        {p.siteCategory ?? "MM"}
                      </span>
                    </td>
                    <td className={C.td}>
                      <span className="text-gray-500 font-mono text-xs">{p.recordingDuration != null ? `${p.recordingDuration}s` : "—"}</span>
                    </td>
                    <td className={C.td}><AudioPlayer src={p.recordingUrl} /></td>
                    <td className={C.td}>
                      <div className="flex items-center gap-2">
                        {statusBadge(p.transcriptionStatus)}
                        {isPending && (
                          <button
                            data-testid={`btn-dismiss-transcript-${p.id}`}
                            onClick={() => dismissMutation.mutate(p.id)}
                            disabled={dismissMutation.isPending}
                            title="Dismiss stuck pending transcription"
                            className="text-[10px] font-mono text-gray-400 hover:text-red-500 underline underline-offset-2 transition-colors disabled:opacity-40"
                          >
                            Dismiss
                          </button>
                        )}
                      </div>
                    </td>
                    <td className={C.td}>
                      {p.transcription ? (
                        <div className="max-w-sm">
                          <button
                            data-testid={`btn-expand-transcript-${p.id}`}
                            onClick={() => setExpanded(prev => ({ ...prev, [p.id]: !isOpen }))}
                            className="flex items-center gap-1 text-xs font-mono text-amber-700 hover:text-amber-900 transition-colors"
                          >
                            {isOpen ? <EyeOff size={11} /> : <Eye size={11} />}
                            {isOpen ? "Hide" : "View"}
                          </button>
                          {isOpen && (
                            <p data-testid={`text-transcript-${p.id}`} className="mt-2 text-xs text-gray-700 font-mono leading-relaxed whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded p-2">
                              {p.transcription}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 font-mono text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {profiles && profiles.length > 0 && (
        <div className="text-gray-400 font-mono text-xs">{profiles.length} caller recording{profiles.length !== 1 ? "s" : ""} · {profiles.filter(p => p.transcriptionStatus === "completed").length} transcribed</div>
      )}
    </div>
  );
}

const tabs: { id: Tab; label: string; icon: React.ReactNode; dividerBefore?: boolean }[] = [
  // ── Main
  { id: "dashboard",      label: "Dashboard",        icon: <LayoutDashboard size={15} /> },
  { id: "callers",        label: "Callers",           icon: <Users size={15} /> },
  { id: "flagged",        label: "Flagged Content",   icon: <Flag size={15} /> },
  { id: "voice-profiles", label: "Voice Profiles",    icon: <Phone size={15} /> },
  { id: "transcriptions", label: "Transcriptions",    icon: <MessageSquare size={15} /> },
  { id: "messages",       label: "Messages",          icon: <MessageSquare size={15} /> },
  { id: "memberships",    label: "$$ Memberships",    icon: <CreditCard size={15} /> },
  { id: "cards",          label: "Member Cards",      icon: <CreditCard size={15} /> },
  { id: "audio-gen",      label: "Audio Gen",         icon: <Volume2 size={15} /> },
  { id: "regions",        label: "Regions",           icon: <Globe size={15} /> },
  { id: "announcements",  label: "Announcements",     icon: <Megaphone size={15} /> },
  // ── System Settings
  { id: "analytics",      label: "Analytics",         icon: <BarChart2 size={15} />,  dividerBefore: true },
  { id: "audit-log",      label: "Audit Log",         icon: <TrendingUp size={15} /> },
  { id: "mod-log",        label: "Moderation Log",    icon: <ShieldAlert size={15} /> },
  { id: "sms-marketing",  label: "SMS Marketing",     icon: <Send size={15} /> },
  { id: "support",        label: "Support Tickets",   icon: <Headphones size={15} /> },
  { id: "phone-testing",  label: "Phone Testing",     icon: <PhoneCall size={15} /> },
  { id: "ivr-flow",       label: "IVR Flow Map",      icon: <GitBranch size={15} /> },
  { id: "phone-numbers",  label: "Phone Numbers",     icon: <Phone size={15} /> },
  { id: "blocked",        label: "Blocked Numbers",   icon: <X size={15} /> },
  { id: "promo-codes",    label: "Promo Codes",       icon: <Tag size={15} /> },
  { id: "zip-codes",      label: "Zip Codes",         icon: <MapPin size={15} /> },
  { id: "site-settings",  label: "Website Settings",  icon: <Settings size={15} /> },
];

// ── SmsMarketingTab ───────────────────────────────────────────────────────────
interface SmsTemplateData {
  id: number;
  label: string;
  message: string;
  sendDay: number | null;
  isActive: boolean;
  lastSentAt: string | null;
  lastSentCount: number;
  updatedAt: string | null;
}

function SmsTemplateCard({ template, otherSendDay, onSaved }: {
  template: SmsTemplateData;
  otherSendDay: number | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [label, setLabel] = useState(template.label);
  const [message, setMessage] = useState(template.message);
  const [sendDay, setSendDay] = useState<string>(template.sendDay !== null ? String(template.sendDay) : "");
  const [isActive, setIsActive] = useState(template.isActive);
  const [sending, setSending] = useState(false);

  const dayLocked = template.lastSentAt !== null;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { label, message, isActive };
      if (!dayLocked) {
        body.sendDay = sendDay === "" ? null : parseInt(sendDay, 10);
      }
      await apiRequest("PUT", `/api/admin/sms-templates/${template.id}`, body);
    },
    onSuccess: () => {
      toast({ title: "Saved", description: `Template #${template.id} updated.` });
      onSaved();
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  async function handleSendNow() {
    if (!confirm(`Send Template #${template.id} to all real phone numbers now?`)) return;
    setSending(true);
    try {
      const res = await apiRequest("POST", `/api/admin/sms-templates/${template.id}/send-now`);
      const data = await res.json();
      toast({
        title: "SMS Sent",
        description: `${data.sent} delivered, ${data.failed} failed.`,
      });
      onSaved();
    } catch (err: any) {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  const charCount = message.length;
  const segmentCount = charCount === 0 ? 0 : Math.ceil(charCount / 160);

  return (
    <div data-testid={`sms-template-card-${template.id}`} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-violet-500" />
          <span className="font-semibold text-sm">Template #{template.id}</span>
          {template.lastSentAt && (
            <span className="text-xs text-zinc-400 ml-2">
              Last sent {new Date(template.lastSentAt).toLocaleDateString()} — {template.lastSentCount} recipients
            </span>
          )}
        </div>
        {/* Active toggle */}
        <button
          data-testid={`toggle-active-${template.id}`}
          onClick={() => setIsActive(!isActive)}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
            isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
          }`}
        >
          {isActive ? <CheckCircle size={12} /> : <XCircle size={12} />}
          {isActive ? "Active" : "Inactive"}
        </button>
      </div>

      {/* Label */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Label (internal)</label>
        <input
          data-testid={`input-label-${template.id}`}
          value={label}
          onChange={e => setLabel(e.target.value)}
          className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-violet-400"
          placeholder="e.g. Monthly promo"
        />
      </div>

      {/* Message */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
          Message <span className="text-zinc-400 normal-case font-normal">({charCount} chars · {segmentCount} SMS segment{segmentCount !== 1 ? "s" : ""})</span>
        </label>
        <textarea
          data-testid={`input-message-${template.id}`}
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={4}
          className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
          placeholder="Enter the SMS message to send to all members…"
        />
      </div>

      {/* Send Day */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
          Send Day (1–30)
          {dayLocked && <span className="ml-2 text-amber-500 font-normal normal-case">— locked after first send</span>}
        </label>
        {otherSendDay !== null && !dayLocked && (
          <p className="text-xs text-zinc-400">Other template is on day {otherSendDay}. Choose a day at least 10 days away (circular).</p>
        )}
        <input
          data-testid={`input-send-day-${template.id}`}
          type="number"
          min={1}
          max={30}
          value={sendDay}
          onChange={e => setSendDay(e.target.value)}
          disabled={dayLocked}
          className="w-28 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-50 disabled:cursor-not-allowed"
          placeholder="e.g. 15"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          data-testid={`btn-save-template-${template.id}`}
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          {saveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          Save
        </button>
        <button
          data-testid={`btn-send-now-${template.id}`}
          onClick={handleSendNow}
          disabled={sending || !message.trim()}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          Send Now
        </button>
        <span className="text-xs text-zinc-400 ml-auto">Sends to all real (non-virtual) phone numbers</span>
      </div>
    </div>
  );
}

function SmsMarketingTab() {
  const { data: templates, isLoading, refetch } = useQuery<SmsTemplateData[]>({
    queryKey: ["/api/admin/sms-templates"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-zinc-400 py-10 justify-center">
        <Loader2 size={18} className="animate-spin" /> Loading SMS templates…
      </div>
    );
  }

  const t1 = templates?.find(t => t.id === 1);
  const t2 = templates?.find(t => t.id === 2);

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">SMS Marketing</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            Two templates, each sent once per month on its configured day. Days must be at least 10 apart (circular).
          </p>
        </div>
        <button
          data-testid="btn-refresh-sms"
          onClick={() => refetch()}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Info callout */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-sm text-amber-700 dark:text-amber-400 flex gap-2">
        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
        <div>
          <strong>Scheduling rules:</strong> Once a template's send day has been used (it has been sent at least once), the day is permanently locked and cannot be changed. Both templates must use different days that are at least <strong>10 days apart</strong> on a 30-day circular calendar.
        </div>
      </div>

      {/* Template cards */}
      {t1 && <SmsTemplateCard template={t1} otherSendDay={t2?.sendDay ?? null} onSaved={() => refetch()} />}
      {t2 && <SmsTemplateCard template={t2} otherSendDay={t1?.sendDay ?? null} onSaved={() => refetch()} />}
    </div>
  );
}

// ── Support Tickets Tab ────────────────────────────────────────────────────────
function SupportTicketsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">("open");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");

  const { data: tickets = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/support-tickets", statusFilter],
    queryFn: async () => {
      const url = statusFilter === "all"
        ? "/api/admin/support-tickets"
        : `/api/admin/support-tickets?status=${statusFilter}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load tickets");
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status?: string; notes?: string }) => {
      await apiRequest("PATCH", `/api/admin/support-tickets/${id}`, { status, notes });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/support-tickets"] });
      setEditingId(null);
      toast({ title: "Ticket updated" });
    },
    onError: () => toast({ title: "Failed to update ticket", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/support-tickets/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/support-tickets"] });
      toast({ title: "Ticket deleted" });
    },
    onError: () => toast({ title: "Failed to delete ticket", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Support Tickets</h2>
        <div className="flex gap-2">
          {(["open", "resolved", "all"] as const).map((s) => (
            <button
              key={s}
              data-testid={`filter-support-${s}`}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded text-sm capitalize border ${statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
          <Loader2 className="animate-spin" size={18} />
          <span>Loading tickets…</span>
        </div>
      ) : tickets.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8 text-center">No {statusFilter === "all" ? "" : statusFilter} tickets.</p>
      ) : (
        <div className="space-y-3">
          {tickets.map((t: any) => (
            <div key={t.id} data-testid={`ticket-card-${t.id}`} className="border border-border rounded-lg p-4 space-y-2 bg-card">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span data-testid={`ticket-phone-${t.id}`} className="font-mono text-sm font-medium">{t.fromPhone}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.status === "open" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"}`}>
                      {t.status}
                    </span>
                    <span className="text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</span>
                  </div>
                  {t.recordingUrl && (
                    <audio data-testid={`ticket-audio-${t.id}`} controls src={t.recordingUrl} className="w-full max-w-sm h-8 mt-1" />
                  )}
                  {t.notes && <p data-testid={`ticket-notes-${t.id}`} className="text-sm text-muted-foreground">{t.notes}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  {t.status === "open" ? (
                    <button
                      data-testid={`ticket-resolve-${t.id}`}
                      title="Mark resolved"
                      onClick={() => updateMutation.mutate({ id: t.id, status: "resolved" })}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-green-600"
                    >
                      <CheckCircle size={16} />
                    </button>
                  ) : (
                    <button
                      data-testid={`ticket-reopen-${t.id}`}
                      title="Reopen"
                      onClick={() => updateMutation.mutate({ id: t.id, status: "open" })}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-orange-500"
                    >
                      <RefreshCw size={16} />
                    </button>
                  )}
                  <button
                    data-testid={`ticket-edit-${t.id}`}
                    title="Add/edit notes"
                    onClick={() => { setEditingId(t.id); setEditNotes(t.notes ?? ""); }}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    data-testid={`ticket-delete-${t.id}`}
                    title="Delete ticket"
                    onClick={() => deleteMutation.mutate(t.id)}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {editingId === t.id && (
                <div className="flex gap-2 pt-1">
                  <textarea
                    data-testid={`ticket-notes-input-${t.id}`}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Notes for this ticket…"
                    rows={2}
                    className="flex-1 text-sm border border-border rounded px-2 py-1 bg-background resize-none"
                  />
                  <div className="flex flex-col gap-1">
                    <button
                      data-testid={`ticket-save-notes-${t.id}`}
                      onClick={() => updateMutation.mutate({ id: t.id, notes: editNotes })}
                      disabled={updateMutation.isPending}
                      className="px-3 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      data-testid={`ticket-cancel-notes-${t.id}`}
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1 text-xs rounded border border-border hover:bg-muted"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Section-level action buttons ──────────────────────────────────────────────
function SectionActions({ activeTab, onAddProfile, onAddRegion, onSaveMembership, isSavingMembership }: {
  activeTab: Tab;
  onAddProfile: () => void;
  onAddRegion: () => void;
  onSaveMembership: () => void;
  isSavingMembership: boolean;
}) {
  if (activeTab === "voice-profiles") {
    return (
      <button data-testid="btn-add-profile" onClick={onAddProfile} className={C.btnPrimary}>
        <Plus size={13} /> Add Profile
      </button>
    );
  }
  if (activeTab === "regions") {
    return (
      <button data-testid="btn-add-region" onClick={onAddRegion} className={C.btnPrimary}>
        <Plus size={13} /> Add Region
      </button>
    );
  }
  if (activeTab === "memberships") {
    return (
      <button data-testid="btn-save-membership-settings" onClick={onSaveMembership} disabled={isSavingMembership} className={C.btnPrimary}>
        {isSavingMembership ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
        Save Settings
      </button>
    );
  }
  return null;
}

// ── Admin root ────────────────────────────────────────────────────────────────
interface AdminProps {
  onLogout?: () => void;
}

export default function Admin({ onLogout }: AdminProps) {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [showUpload, setShowUpload] = useState(false);
  const [showAddRegion, setShowAddRegion] = useState(false);
  const [saveMembership, setSaveMembership] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ── Admin key gate ────────────────────────────────────────────────────────
  const [adminKey, setAdminKeyState] = useState<string | null>(() => getAdminKey());
  const [keyInput, setKeyInput] = useState("");
  const [keyError, setKeyError] = useState(false);

  // Clear key and show entry screen whenever a request returns 403
  useEffect(() => {
    function handleForbidden() {
      clearAdminKey();
      setAdminKeyState(null);
      queryClient.clear();
      setKeyError(true);
    }
    window.addEventListener("admin-forbidden", handleForbidden);
    return () => window.removeEventListener("admin-forbidden", handleForbidden);
  }, []);

  function handleSaveKey() {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setAdminKey(trimmed);
    setAdminKeyState(trimmed);
    setKeyInput("");
    setKeyError(false);
    queryClient.invalidateQueries();
  }

  if (!adminKey) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#111827]">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm mx-4">
          <div className="flex flex-col items-center gap-2 mb-6">
            <Shield size={36} className="text-[#111827]" />
            <h1 className="text-xl font-bold text-gray-900">Admin Access</h1>
            <p className="text-sm text-gray-500 text-center">Enter your admin secret key to continue.</p>
          </div>
          {keyError && (
            <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={15} />
              Invalid key — please try again.
            </div>
          )}
          <input
            type="password"
            placeholder="Admin secret key"
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSaveKey()}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-gray-900"
            data-testid="input-admin-key"
            autoFocus
          />
          <button
            onClick={handleSaveKey}
            disabled={!keyInput.trim()}
            className="w-full bg-[#111827] text-white rounded-lg py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition"
            data-testid="button-admin-key-submit"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // Auto-collapse sidebar when switching to IVR Flow Map for more canvas space
  useEffect(() => {
    if (activeTab === "ivr-flow") setSidebarOpen(false);
  }, [activeTab]);

  const logoutMutation = useMutation({
    mutationFn: () => fetch("/api/admin/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["/api/admin/me"] });
      if (onLogout) {
        onLogout();
      } else {
        setLocation("/admin/login");
      }
    },
  });

  const activeLabel = tabs.find(t => t.id === activeTab)?.label ?? "";

  return (
    <div className="flex h-screen bg-white overflow-hidden">

      {/* ── Sidebar ── */}
      <aside
        className="bg-[#111827] flex flex-col flex-shrink-0 overflow-hidden transition-all duration-200 ease-in-out"
        style={{ width: sidebarOpen ? "208px" : "0px" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/10 min-w-[208px]">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 grid grid-cols-2 gap-0.5 opacity-80">
              {[...Array(4)].map((_, i) => <div key={i} className="bg-[#f5a623] rounded-[1px]" />)}
            </div>
            <span className="text-white font-mono font-bold text-sm tracking-widest">BACK OFFICE</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSidebarOpen(false)}
              title="Collapse sidebar"
              className="text-white/30 hover:text-white/70 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <Link href="/">
              <X size={14} className="text-white/40 hover:text-white/80 transition-colors cursor-pointer" />
            </Link>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto min-w-[208px]">
          {tabs.map(tab => (
            <button
              key={tab.id}
              data-testid={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-all font-mono text-xs tracking-widest uppercase ${
                activeTab === tab.id
                  ? "bg-white/10 text-white border-l-2 border-[#f5a623] pl-[10px]"
                  : "text-white/50 hover:bg-white/5 hover:text-white/80 border-l-2 border-transparent pl-[10px]"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Bottom */}
        <div className="px-2 py-3 border-t border-white/10 space-y-0.5 min-w-[208px]">
          <button
            data-testid="btn-change-admin-key"
            onClick={() => { clearAdminKey(); setAdminKeyState(null); queryClient.clear(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-white/40 hover:text-white/70 hover:bg-white/5 font-mono text-xs tracking-widest uppercase transition-colors border-l-2 border-transparent pl-[10px]"
          >
            <ShieldOff size={15} />
            Change Key
          </button>
          <button
            data-testid="btn-admin-logout"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-white/40 hover:text-white/70 hover:bg-white/5 font-mono text-xs tracking-widest uppercase transition-colors border-l-2 border-transparent pl-[10px]"
          >
            <LogOut size={15} />
            {logoutMutation.isPending ? "Signing out…" : "Sign Out"}
          </button>
        </div>
      </aside>

      {/* ── Collapsed sidebar rail ── */}
      {!sidebarOpen && (
        <div className="bg-[#111827] flex flex-col flex-shrink-0 w-8 border-r border-white/10">
          <button
            onClick={() => setSidebarOpen(true)}
            title="Expand sidebar"
            className="flex items-center justify-center h-12 text-white/30 hover:text-white/80 hover:bg-white/5 transition-colors w-full"
          >
            <ChevronRight size={14} />
          </button>
          {/* Active tab indicator dot */}
          <div className="flex-1 flex flex-col items-center pt-1 gap-1.5">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSidebarOpen(true); }}
                title={tab.label}
                className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
                  activeTab === tab.id
                    ? "bg-[#f5a623]/20 text-[#f5a623]"
                    : "text-white/20 hover:text-white/50 hover:bg-white/5"
                }`}
              >
                {tab.icon}
              </button>
            ))}
          </div>
          <button
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            title="Sign Out"
            className="flex items-center justify-center h-10 text-white/20 hover:text-white/50 transition-colors w-full border-t border-white/10"
          >
            <LogOut size={13} />
          </button>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gray-50">

        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-white border-b border-gray-200 flex-shrink-0">
          <h2 className="font-mono font-bold text-sm tracking-widest uppercase text-gray-900">{activeLabel}</h2>
          <SectionActions
            activeTab={activeTab}
            onAddProfile={() => setShowUpload(true)}
            onAddRegion={() => setShowAddRegion(true)}
            onSaveMembership={() => setSaveMembership(v => !v)}
            isSavingMembership={false}
          />
        </div>

        {/* Content */}
        <div className={`flex-1 min-h-0 ${activeTab === "ivr-flow" ? "overflow-auto p-0" : "overflow-y-auto p-6"}`}>
          {showUpload && <UploadDialog onClose={() => setShowUpload(false)} />}
          {showAddRegion && <RegionDialog onClose={() => setShowAddRegion(false)} />}

          {activeTab === "dashboard"      && <DashboardTab />}
          {activeTab === "callers"        && <CallersTab />}
          {activeTab === "flagged"        && <FlaggedContentTab />}
          {activeTab === "voice-profiles"  && <VoiceProfilesTab key={String(showUpload)} />}
          {activeTab === "transcriptions"  && <TranscriptionsTab />}
          {activeTab === "regions"         && <RegionsTab />}
          {activeTab === "memberships"    && <MembershipsTab />}
          {activeTab === "cards"          && <MembershipCardsTab />}
          {activeTab === "audio-gen"      && <TTSTab />}
          {activeTab === "messages"       && <MessagesTab />}
          {activeTab === "phone-numbers"  && <PhoneNumbersTab />}
          {activeTab === "blocked"        && <BlockedNumbersTab />}
          {activeTab === "promo-codes"    && <PromoCodesTab />}
          {activeTab === "zip-codes"      && <ZipCodesTab />}
          {activeTab === "announcements"  && <AnnouncementsTab />}
          {activeTab === "analytics"      && <AnalyticsTab />}
          {activeTab === "audit-log"      && <AuditLogTab />}
          {activeTab === "mod-log"        && <ModerationLogTab />}
          {activeTab === "phone-testing"  && <IVRTesterTab />}
          {activeTab === "ivr-flow"       && <IvrFlowMap />}
          {activeTab === "site-settings"  && <WebsiteSettingsTab />}
          {activeTab === "sms-marketing"  && <SmsMarketingTab />}
          {activeTab === "support"        && <SupportTicketsTab />}
        </div>
      </div>
    </div>
  );
}
