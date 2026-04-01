import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Upload, Trash2, Play, Pause, Plus, Phone, LayoutDashboard,
  MessageSquare, PhoneCall, X, MapPin, Clock, Copy, Eye, EyeOff,
  Pencil, Globe, Volume2, Wand2, CheckCircle, AlertCircle, Loader2,
  CreditCard, Save, LogOut, Settings, Users, ChevronLeft, ShieldOff,
  Shield, PlusCircle, MinusCircle, ArrowUpDown, Flag, CheckCircle2,
  XCircle, AlertTriangle, Tag, Megaphone, ToggleLeft, ToggleRight,
  BarChart2, TrendingUp, RefreshCw,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

interface ProfileWithUser {
  id: string;
  userId: string;
  recordingUrl: string;
  recordingDuration: number | null;
  createdAt: string;
  phoneNumber: string;
}

interface Region {
  id: string;
  name: string;
  slug: string;
  phoneNumber: string;
  timezone: string;
  maxCapacity: number;
  description: string | null;
  isActive: boolean;
  linkedRegionId: string | null;
  defaultZipCode: string | null;
  createdAt: string;
  activeCalls: number;
  voiceProfiles: number;
  messagesRelayed: number;
}

type Tab = "dashboard" | "voice-profiles" | "regions" | "messages" | "phone-testing" | "audio-gen" | "memberships" | "phone-numbers" | "blocked" | "callers" | "flagged" | "zip-codes" | "promo-codes" | "announcements" | "analytics" | "audit-log" | "site-settings";

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
}

interface CallerDetail {
  user: {
    id: string; phoneNumber: string; membershipTier: string | null;
    remainingSeconds: number | null; stripeCustomerId: string | null;
    createdAt: string | null;
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
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!phoneNumber.trim() || !file) throw new Error("Missing fields");
      const form = new FormData();
      form.append("phoneNumber", phoneNumber.trim());
      form.append("audio", file);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 bg-white rounded-xl border border-gray-200 p-6 shadow-2xl">
        <button data-testid="btn-close-dialog" onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition-colors">
          <X size={18} />
        </button>
        <h2 className="text-gray-900 font-mono text-base font-bold mb-1 tracking-widest uppercase">Upload Profile Greeting</h2>
        <p className="text-gray-500 text-xs font-mono mb-6">MP3 file will become the caller's live profile greeting</p>
        <div className="space-y-4">
          <div>
            <label className={C.label}>Caller Phone Number</label>
            <input data-testid="input-phone-number" type="tel" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="+1 555 000 0000" className={C.input} />
          </div>
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
            <button data-testid="btn-submit-upload" onClick={() => uploadMutation.mutate()} disabled={!phoneNumber.trim() || !file || uploadMutation.isPending} className={C.btnPrimary + " flex-1 justify-center py-2.5"}>
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
  const [phoneNumber, setPhoneNumber] = useState(region?.phoneNumber ?? "");
  const [timezone, setTimezone] = useState(region?.timezone ?? "America/New_York");
  const [maxCapacity, setMaxCapacity] = useState(String(region?.maxCapacity ?? 1000));
  const [description, setDescription] = useState(region?.description ?? "");
  const [isActive, setIsActive] = useState(region?.isActive ?? true);
  const [linkedRegionId, setLinkedRegionId] = useState<string>(region?.linkedRegionId ?? "");
  const [defaultZipCode, setDefaultZipCode] = useState<string>(region?.defaultZipCode ?? "");

  const { data: allRegions } = useQuery<Region[]>({ queryKey: ["/api/regions"] });
  const otherRegions = (allRegions ?? []).filter(r => r.id !== region?.id);

  function handleNameChange(val: string) {
    setName(val);
    if (!isEdit) setSlug(val.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = { name: name.trim(), slug: slug.trim(), phoneNumber: phoneNumber.trim(), timezone: timezone.trim(), maxCapacity: parseInt(maxCapacity) || 1000, description: description.trim() || null, isActive, linkedRegionId: linkedRegionId || null, defaultZipCode: defaultZipCode.trim() || null };
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
              <label className={C.label}>URL Slug</label>
              <input data-testid="input-region-slug" type="text" value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="denver" className={C.input} />
            </div>
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={C.label}>Timezone</label>
              <input data-testid="input-region-timezone" type="text" value={timezone} onChange={e => setTimezone(e.target.value)} placeholder="America/Denver" className={C.input} />
            </div>
            <div>
              <label className={C.label}>Max Capacity</label>
              <input data-testid="input-region-capacity" type="number" value={maxCapacity} onChange={e => setMaxCapacity(e.target.value)} placeholder="1000" className={C.input} />
            </div>
          </div>
          <div>
            <label className={C.label}>Description</label>
            <input data-testid="input-region-description" type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Colorado Rocky Mountains region" className={C.input} />
          </div>
          <div>
            <label className={C.label}>Linked Nearby Region</label>
            <select data-testid="select-linked-region" value={linkedRegionId} onChange={e => setLinkedRegionId(e.target.value)} className={C.select}>
              <option value="">— No linked region —</option>
              {otherRegions.map(r => (
                <option key={r.id} value={r.id}>{r.name} ({r.phoneNumber})</option>
              ))}
            </select>
            <p className="text-gray-400 font-mono text-xs mt-1.5">When callers exhaust this region's queue, they'll be offered to hear callers from the linked region.</p>
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
function RegionsTab() {
  const { toast } = useToast();
  const [dialog, setDialog] = useState<"add" | Region | null>(null);
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

  function copyWebhook(slug: string) { navigator.clipboard.writeText(`${origin}/voice/${slug}`); toast({ title: "Webhook URL copied" }); }
  function copyPhone(phone: string) { navigator.clipboard.writeText(phone); toast({ title: "Phone number copied" }); }

  return (
    <div className="space-y-5">
      {dialog === "add" && <RegionDialog onClose={() => setDialog(null)} />}
      {dialog && dialog !== "add" && <RegionDialog region={dialog as Region} onClose={() => setDialog(null)} />}

      {isLoading ? (
        <div className="py-20 text-center text-gray-400 font-mono text-xs tracking-widest">LOADING REGIONS...</div>
      ) : !regions || regions.length === 0 ? (
        <div className="py-20 text-center">
          <MapPin size={32} className="mx-auto text-gray-300 mb-4" />
          <div className="text-gray-400 font-mono text-xs tracking-widest">NO REGIONS CONFIGURED — ADD ONE TO BEGIN</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {regions.map(region => (
            <div key={region.id} data-testid={`card-region-${region.id}`} className={C.card}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg border border-amber-200 bg-amber-50 flex items-center justify-center">
                    <MapPin size={15} className="text-[#f5a623]" />
                  </div>
                  <div>
                    <div className="text-gray-900 font-mono font-bold text-sm tracking-widest uppercase">{region.name}</div>
                    <div className="text-gray-400 font-mono text-xs tracking-widest uppercase">{region.slug}</div>
                  </div>
                </div>
                <span className={`${C.badge} ${region.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-gray-50 text-gray-400"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${region.isActive ? "bg-emerald-500" : "bg-gray-300"}`} />
                  {region.isActive ? "Active" : "Inactive"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Phone size={12} className="text-gray-400" />
                <span data-testid={`text-phone-${region.id}`} className="text-gray-700 font-mono text-sm flex-1">{region.phoneNumber}</span>
                <button data-testid={`btn-copy-phone-${region.id}`} onClick={() => copyPhone(region.phoneNumber)} className="text-gray-400 hover:text-[#f5a623] transition-colors"><Copy size={12} /></button>
              </div>

              {region.linkedRegionId && (() => {
                const linked = regions?.find(r => r.id === region.linkedRegionId);
                return linked ? (
                  <div data-testid={`text-linked-region-${region.id}`} className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
                    <MapPin size={11} className="text-[#f5a623]/70" />
                    <span className="text-gray-500 font-mono text-xs tracking-widest uppercase">Linked:</span>
                    <span className="text-[#f5a623] font-mono text-xs font-bold">{linked.name}</span>
                  </div>
                ) : null;
              })()}

              <div className="grid grid-cols-3 gap-3 py-1">
                {[
                  { val: region.activeCalls, label: "Live on Line" },
                  { val: region.voiceProfiles, label: "Voice Profiles" },
                  { val: region.messagesRelayed, label: "Msgs Relayed" },
                ].map(({ val, label }) => (
                  <div key={label}>
                    <div className={C.statValue + " text-2xl"}>{String(val).padStart(3, "0")}</div>
                    <div className={C.statLabel + " text-[10px]"}>{label}</div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-1.5 text-gray-400 font-mono text-xs"><Clock size={11} />{region.timezone}</div>
              {region.description && <div className="text-gray-400 font-mono text-xs">{region.description}</div>}

              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <div className="flex gap-2">
                  <button data-testid={`btn-edit-region-${region.id}`} onClick={() => setDialog(region)} className={C.btnGhost}>
                    <Pencil size={11} /> Edit
                  </button>
                  <button data-testid={`btn-delete-region-${region.id}`} onClick={() => { if (confirm(`Delete region "${region.name}"?`)) deleteMutation.mutate(region.id); }} disabled={deleteMutation.isPending} className={C.btnDanger}>
                    <Trash2 size={11} /> Delete
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button data-testid={`btn-copy-webhook-${region.id}`} onClick={() => copyWebhook(region.slug)} title={`Copy webhook: /voice/${region.slug}`} className="text-gray-400 hover:text-[#f5a623] transition-colors"><Copy size={13} /></button>
                  <button data-testid={`btn-toggle-region-${region.id}`} onClick={() => toggleMutation.mutate(region)} disabled={toggleMutation.isPending} title={region.isActive ? "Deactivate region" : "Activate region"} className={`transition-colors ${region.isActive ? "text-emerald-500" : "text-gray-300"} hover:text-[#f5a623] disabled:opacity-50`}>
                    {region.isActive ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── VoiceProfilesTab ──────────────────────────────────────────────────────────
function VoiceProfilesTab() {
  const { toast } = useToast();
  const [showUpload, setShowUpload] = useState(false);

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

  return (
    <div className="space-y-4">
      {showUpload && <UploadDialog onClose={() => setShowUpload(false)} />}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className={C.th}>Phone</th>
              <th className={C.th}>Audio</th>
              <th className={C.th}>Duration</th>
              <th className={C.th}>Status</th>
              <th className={C.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 font-mono text-xs tracking-widest">LOADING PROFILES...</td></tr>
            ) : !profiles || profiles.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 font-mono text-xs tracking-widest">NO PROFILES FOUND — UPLOAD ONE TO BEGIN</td></tr>
            ) : (
              profiles.map(profile => (
                <tr key={profile.id} data-testid={`row-profile-${profile.id}`} className={C.row}>
                  <td className={C.td}>
                    <div className="flex items-center gap-2">
                      <Phone size={12} className="text-gray-400" />
                      <span data-testid={`text-phone-${profile.id}`} className="text-gray-800 font-mono text-sm">{profile.phoneNumber}</span>
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
              ))
            )}
          </tbody>
        </table>
      </div>
      {profiles && profiles.length > 0 && (
        <div className="text-gray-400 font-mono text-xs">{profiles.length} record{profiles.length !== 1 ? "s" : ""}</div>
      )}
    </div>
  );
}

// ── SYSTEM_PROMPTS list ───────────────────────────────────────────────────────
const SYSTEM_PROMPTS: { filename: string; label: string; text: string }[] = [
  { filename: "system_greeting.mp3", label: "System Greeting / Legal Notice", text: "Welcome to Interactive Mail. Interactive Mail assumes no responsibility for personal meetings. This service is for adults only. If you are under 18, please hang up now." },
  { filename: "free_trial_offer.mp3", label: "Free Trial Offer", text: "We would like to offer you a free trial so you can check out the system and start meeting new people. To start your free trial press the pound key." },
  { filename: "free_trial_terms.mp3", label: "Free Trial Terms", text: "Your free trial will expire in seven days and it must be used from this phone number." },
  { filename: "goodbye.mp3", label: "Goodbye", text: "Thank you for calling. Goodbye." },
  { filename: "no_caller_id.mp3", label: "No Caller ID", text: "We could not identify your call. Goodbye." },
  { filename: "welcome_record_name.mp3", label: "Welcome — Record Name", text: "Welcome! Before using the system you must create a short voice profile. First, say your first name only after the tone. You have 5 seconds." },
  { filename: "error_generic.mp3", label: "Generic Error", text: "An error occurred. Please try again later." },
  { filename: "name_retry.mp3", label: "Name Retry", text: "We didn't catch your name. Please try again." },
  { filename: "name_saved_record_greeting.mp3", label: "Name Saved — Record Greeting", text: "Great. Now record your greeting for other callers. After the tone, you have 60 seconds." },
  { filename: "greeting_error.mp3", label: "Greeting Too Short", text: "That greeting was too short. Please try again after the tone." },
  { filename: "profile_save_error.mp3", label: "Profile Save Error", text: "We could not save your profile. Please try again." },
  { filename: "access_expired.mp3", label: "Access Expired", text: "Your access has expired." },
  { filename: "main_menu.mp3", label: "Main Menu", text: "Welcome to the voice line. Press 1 to listen to profiles. Press 2 to re-record your profile. Press 4 for information, prices, and membership." },
  { filename: "rerecord_name.mp3", label: "Re-record Name", text: "Let's re-record your profile. First, say your first name only after the tone. You have 5 seconds." },
  { filename: "invalid_choice.mp3", label: "Invalid Choice", text: "Invalid choice." },
  { filename: "trial_warning.mp3", label: "Trial Warning", text: "You have less than 5 minutes remaining in your free trial. Stay connected by joining now." },
  { filename: "member_warning.mp3", label: "Member Warning", text: "You have less than 5 minutes remaining in your membership. To renew now press 1. To continue press pound." },
  { filename: "greeting_setup.mp3", label: "Greeting Setup", text: "Your last greeting you recorded is still available. To use it again, press 1. To record a new greeting, press 2. To hear your greeting, press 3." },
  { filename: "review_greeting.mp3", label: "Review Greeting", text: "To hear your greeting, press 1. To re-record, press 2. To accept and continue, press 3. To repeat these choices, press 9." },
  { filename: "no_greeting_found.mp3", label: "No Greeting Found", text: "No greeting found." },
  { filename: "session_expired_greeting.mp3", label: "Session Expired — Greeting", text: "Your session has expired. Please re-record your greeting." },
  { filename: "profile_saved.mp3", label: "Profile Saved", text: "Your greeting has been saved." },
  { filename: "no_profiles.mp3", label: "No Profiles Available", text: "There are no profiles available right now. Please call back later." },
  { filename: "message_options.mp3", label: "Message Options", text: "Press 1 to reply to this message. Press 2 to hear the sender's profile. Press 3 to continue browsing profiles." },
  { filename: "profile_options.mp3", label: "Profile Options", text: "Press 1 to send this caller a message. Press 2 to skip to the next profile. Press 9 to return to main menu." },
  { filename: "record_reply.mp3", label: "Record Reply", text: "Record your reply after the tone." },
  { filename: "record_message.mp3", label: "Record Message", text: "Record your message after the tone." },
  { filename: "message_sent.mp3", label: "Message Sent", text: "Your message has been sent. Returning to profiles." },
  { filename: "message_send_error.mp3", label: "Message Send Error", text: "Failed to send your message. Returning to profiles." },
  { filename: "info_menu.mp3", label: "Info Menu", text: "Information, prices, and membership. Press 1 for membership questions. Press 9 to return to the main menu." },
  { filename: "membership_questions.mp3", label: "Membership Questions", text: "Press 1 to learn how membership works. Press 2 to hear our pricing. Press 3 to purchase a membership." },
  { filename: "membership_how_it_works.mp3", label: "How Membership Works", text: "As a member, you get full access to the voice line community." },
  { filename: "membership_pricing.mp3", label: "Membership Pricing", text: "Here are our membership prices." },
  { filename: "membership_packages.mp3", label: "Membership Packages", text: "Press 1 for plan 1. Press 2 for plan 2. Press 3 for plan 3. Press 9 to repeat. Press pound to cancel." },
  { filename: "package_cancelled.mp3", label: "Package Cancelled", text: "Cancelled. Returning to the main menu." },
  { filename: "package_invalid.mp3", label: "Package Invalid", text: "Invalid selection." },
  { filename: "package_confirm_30day.mp3", label: "Package Confirm — Plan 1", text: "You selected XX minutes access for XX dollars." },
  { filename: "package_confirm_14day.mp3", label: "Package Confirm — Plan 2", text: "You selected XX minutes access for XX dollars." },
  { filename: "package_confirm_14day_bonus.mp3", label: "Package Confirm — Plan 2 (Bonus)", text: "Great choice! You selected XX minutes access for XX dollars, including your first purchase bonus — double the minutes!" },
  { filename: "package_confirm_24hour.mp3", label: "Package Confirm — Plan 3", text: "You selected XX minutes access for XX dollars." },
  { filename: "payment_intro.mp3", label: "Payment Intro", text: "Please have your credit card ready." },
  { filename: "payment_session_expired.mp3", label: "Payment Session Expired", text: "Your session has expired. Please try again." },
  { filename: "payment_success_30day.mp3", label: "Payment Success — Plan 1", text: "Payment successful! You now have XX minutes access." },
  { filename: "payment_success_14day.mp3", label: "Payment Success — Plan 2", text: "Payment successful! You now have XX minutes access." },
  { filename: "payment_success_14day_bonus.mp3", label: "Payment Success — Plan 2 (Bonus)", text: "Payment successful! Plus your bonus minutes have been added!" },
  { filename: "payment_success_24hour.mp3", label: "Payment Success — Plan 3", text: "Payment successful! You now have XX minutes access." },
  { filename: "payment_declined.mp3", label: "Payment Declined", text: "Your card was declined. Please check your details and try again later." },
  { filename: "payment_failed.mp3", label: "Payment Failed", text: "Your payment could not be completed at this time. Please try again later." },
  { filename: "payment_activation_error.mp3", label: "Payment Activation Error", text: "Your payment was received but there was an error activating your membership." },
  { filename: "region_not_active.mp3", label: "Region Not Active", text: "This phone number is not currently active. Please try again later." },
  { filename: "region_unavailable.mp3", label: "Region Unavailable", text: "This market is temporarily unavailable. Please try again later." },
  { filename: "motd.mp3", label: "Announcement / MOTD", text: "Welcome back to Interactive Mail. We have an exciting promotion running this weekend — call in and check out the latest profiles." },
  { filename: "phrase_you_have.mp3", label: "Phrase — You Have", text: "You have" },
  { filename: "phrase_you_have_1_hour_and.mp3", label: "Phrase — You Have 1 Hour And", text: "You have 1 hour and" },
  { filename: "phrase_hours_of_pbtr.mp3", label: "Phrase — Hours Remaining", text: "hours of phone booth time remaining." },
  { filename: "phrase_hour_of_pbtr.mp3", label: "Phrase — Hour Remaining", text: "hour of phone booth time remaining." },
  { filename: "phrase_minutes_of_pbtr.mp3", label: "Phrase — Minutes Remaining", text: "minutes remaining." },
  { filename: "phrase_minute_of_pbtr.mp3", label: "Phrase — Minute Remaining", text: "minute remaining." },
  { filename: "phrase_there_are.mp3", label: "Phrase — There Are", text: "There are" },
  { filename: "phrase_there_is.mp3", label: "Phrase — There Is", text: "There is" },
  { filename: "phrase_callers_on_the_line.mp3", label: "Phrase — Callers On The Line", text: "guys on the line." },
  { filename: "phrase_caller_on_the_line.mp3", label: "Phrase — Caller On The Line", text: "guy on the line." },
  { filename: "num_0.mp3", label: "Number — 0", text: "zero" },
  { filename: "num_1.mp3", label: "Number — 1", text: "one" },
  { filename: "num_2.mp3", label: "Number — 2", text: "two" },
  { filename: "num_3.mp3", label: "Number — 3", text: "three" },
  { filename: "num_4.mp3", label: "Number — 4", text: "four" },
  { filename: "num_5.mp3", label: "Number — 5", text: "five" },
  { filename: "num_6.mp3", label: "Number — 6", text: "six" },
  { filename: "num_7.mp3", label: "Number — 7", text: "seven" },
  { filename: "num_8.mp3", label: "Number — 8", text: "eight" },
  { filename: "num_9.mp3", label: "Number — 9", text: "nine" },
  { filename: "num_10.mp3", label: "Number — 10", text: "ten" },
  { filename: "num_11.mp3", label: "Number — 11", text: "eleven" },
  { filename: "num_12.mp3", label: "Number — 12", text: "twelve" },
  { filename: "num_13.mp3", label: "Number — 13", text: "thirteen" },
  { filename: "num_14.mp3", label: "Number — 14", text: "fourteen" },
  { filename: "num_15.mp3", label: "Number — 15", text: "fifteen" },
  { filename: "num_16.mp3", label: "Number — 16", text: "sixteen" },
  { filename: "num_17.mp3", label: "Number — 17", text: "seventeen" },
  { filename: "num_18.mp3", label: "Number — 18", text: "eighteen" },
  { filename: "num_19.mp3", label: "Number — 19", text: "nineteen" },
  { filename: "num_20.mp3", label: "Number — 20", text: "twenty" },
  { filename: "num_30.mp3", label: "Number — 30", text: "thirty" },
  { filename: "num_40.mp3", label: "Number — 40", text: "forty" },
  { filename: "num_50.mp3", label: "Number — 50", text: "fifty" },
  { filename: "num_60.mp3", label: "Number — 60", text: "sixty" },
  { filename: "num_70.mp3", label: "Number — 70", text: "seventy" },
  { filename: "num_80.mp3", label: "Number — 80", text: "eighty" },
  { filename: "num_90.mp3", label: "Number — 90", text: "ninety" },
  { filename: "num_100.mp3", label: "Number — 100", text: "one hundred" },
  { filename: "num_200.mp3", label: "Number — 200", text: "two hundred" },
  { filename: "num_300.mp3", label: "Number — 300", text: "three hundred" },
  { filename: "num_400.mp3", label: "Number — 400", text: "four hundred" },
  { filename: "num_500.mp3", label: "Number — 500", text: "five hundred" },
  { filename: "num_600.mp3", label: "Number — 600", text: "six hundred" },
  { filename: "num_700.mp3", label: "Number — 700", text: "seven hundred" },
  { filename: "num_800.mp3", label: "Number — 800", text: "eight hundred" },
  { filename: "num_900.mp3", label: "Number — 900", text: "nine hundred" },
];

// ── TTSTab ────────────────────────────────────────────────────────────────────
function TTSTab() {
  const { toast } = useToast();
  const [customText, setCustomText] = useState("");
  const [customFilename, setCustomFilename] = useState("");
  const [editingText, setEditingText] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [categoryFolder, setCategoryFolder] = useState<"shared" | "mm" | "mw">("shared");

  const { data: settings } = useQuery<{ voiceId: string }>({ queryKey: ["/api/admin/tts/settings"] });
  const { data: existingFiles } = useQuery<{ filename: string; url: string; size: number; folder: string }[]>({ queryKey: ["/api/admin/tts/prompts"] });
  const { data: zipEntries = [] } = useQuery<ZipEntry[]>({ queryKey: ["/api/admin/zip-codes"] });
  const neighborhoodEntries = zipEntries.filter(e => e.audioFile && e.neighborhood);

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
        body: JSON.stringify({ text, filename, folder: folder && folder !== "shared" ? folder : undefined }),
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

  const filtered = SYSTEM_PROMPTS.filter(p => !filter || p.label.toLowerCase().includes(filter.toLowerCase()) || p.filename.toLowerCase().includes(filter.toLowerCase()));
  const generatedCount = SYSTEM_PROMPTS.filter(p =>
    fileExistsIn("shared", p.filename) || fileExistsIn("mm", p.filename) || fileExistsIn("mw", p.filename)
  ).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className={C.cardAlt}>
          <div className={C.label}>Current Voice ID</div>
          <div className="text-[#f5a623] font-mono text-sm break-all">{settings?.voiceId ?? "Loading..."}</div>
          <div className="text-gray-400 font-mono text-xs">Change via ELEVENLABS_VOICE_ID in .env</div>
        </div>
        <div className={C.cardAlt}>
          <div className={C.label}>Prompts Generated</div>
          <div className={C.statValue}>{generatedCount}<span className="text-gray-400 text-lg">/{SYSTEM_PROMPTS.length}</span></div>
        </div>
      </div>

      <div className={C.card}>
        <h3 className="text-gray-800 font-mono text-sm font-bold tracking-widest uppercase flex items-center gap-2">
          <Settings size={14} className="text-[#f5a623]" /> Audio Category Folder
        </h3>
        <p className="text-gray-400 font-mono text-xs -mt-1">
          Select which folder to generate audio into. MM and MW each have their own set of prompts that override the shared (default) files. The phone system automatically plays the correct version based on the Site Category setting.
        </p>
        <div className="flex gap-2 mt-1">
          {([
            { id: "shared", label: "Shared", hint: "Used by both MM & MW if no category override exists" },
            { id: "mm",     label: "MM",     hint: "Men seeking Men — overrides shared prompts" },
            { id: "mw",     label: "MW",     hint: "Men seeking Women — overrides shared prompts" },
          ] as const).map(opt => (
            <button
              key={opt.id}
              data-testid={`btn-category-${opt.id}`}
              onClick={() => setCategoryFolder(opt.id)}
              title={opt.hint}
              className={`px-3 py-1.5 rounded text-xs font-mono font-bold border transition-colors ${
                categoryFolder === opt.id
                  ? "bg-[#f5a623] border-[#f5a623] text-white"
                  : "bg-white border-gray-300 text-gray-500 hover:border-[#f5a623] hover:text-[#f5a623]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className={C.card}>
        <h3 className="text-gray-800 font-mono text-sm font-bold tracking-widest uppercase flex items-center gap-2">
          <Wand2 size={14} className="text-[#f5a623]" /> Custom Audio File
          <span className="ml-auto text-[10px] font-normal normal-case text-gray-400 border border-gray-200 rounded px-2 py-0.5">
            → {categoryFolder === "shared" ? "Shared" : categoryFolder.toUpperCase()} folder
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
            <input
              data-testid="input-custom-text"
              type="text"
              value={customText}
              onChange={e => setCustomText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCustomGenerate(); }}
              placeholder="Enter text to convert to speech..."
              className={C.input}
            />
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
                          {exists ? "Generated" : "Missing"}
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

      <div className={C.card}>
        <div className="flex items-center justify-between">
          <h3 className="text-gray-800 font-mono text-sm font-bold tracking-widest uppercase">
            System Prompts
            <span className="ml-2 text-[10px] font-normal normal-case text-gray-400 border border-gray-200 rounded px-2 py-0.5">
              Folder: {categoryFolder === "shared" ? "Shared" : categoryFolder.toUpperCase()}
            </span>
          </h3>
          <input
            data-testid="input-filter-prompts"
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter prompts..."
            className="w-56 bg-white border border-gray-300 rounded px-3 py-1.5 text-gray-700 font-mono text-xs placeholder-gray-400 focus:outline-none focus:border-[#f5a623] transition-colors"
          />
        </div>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className={C.th}>Prompt</th>
                <th className={C.th}>Text</th>
                <th className={C.th + " w-32"}>Status</th>
                <th className={C.th + " w-40"}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(prompt => {
                const exists = fileExistsIn(categoryFolder, prompt.filename);
                const isGen = generating === `${categoryFolder}:${prompt.filename}`;
                const existingFile = getFileIn(categoryFolder, prompt.filename);
                const currentText = editingText[prompt.filename] ?? prompt.text;
                return (
                  <tr key={prompt.filename} data-testid={`row-prompt-${prompt.filename}`} className={C.row}>
                    <td className={C.td + " w-52"}>
                      <div className="text-gray-800 font-mono text-xs font-bold">{prompt.label}</div>
                      <div className="text-gray-400 font-mono text-[10px] mt-0.5">{prompt.filename}</div>
                    </td>
                    <td className={C.td}>
                      <textarea
                        data-testid={`textarea-prompt-${prompt.filename}`}
                        value={currentText}
                        onChange={e => setEditingText(prev => ({ ...prev, [prompt.filename]: e.target.value }))}
                        rows={2}
                        className="w-full bg-gray-50 border border-gray-200 rounded px-2.5 py-1.5 text-gray-700 font-mono text-xs placeholder-gray-400 focus:outline-none focus:border-[#f5a623] transition-colors resize-none"
                      />
                    </td>
                    <td className={C.td}>
                      <span className={`${C.badge} ${exists ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-gray-50 text-gray-400"}`}>
                        {exists ? <CheckCircle size={10} /> : <AlertCircle size={10} />}
                        {exists ? "Generated" : "Missing"}
                      </span>
                    </td>
                    <td className={C.td}>
                      <div className="flex items-center gap-1.5">
                        <button
                          data-testid={`btn-generate-${prompt.filename}`}
                          onClick={() => handleGenerate(prompt.filename, currentText, categoryFolder)}
                          disabled={!!generating}
                          className={C.btnGhost + " text-[10px]"}
                        >
                          {isGen ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
                          {exists ? "Regen" : "Generate"}
                        </button>
                        {exists && (
                          <>
                            {existingFile && <AudioPlayer src={existingFile.url} />}
                            <button data-testid={`btn-delete-prompt-${prompt.filename}`} onClick={() => deleteMutation.mutate({ filename: prompt.filename, folder: categoryFolder })} className={C.btnDanger + " text-[10px]"}>
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
    </div>
  );
}

// ── MembershipsTab ────────────────────────────────────────────────────────────
function MembershipsTab() {
  const { toast } = useToast();
  interface MembershipSettings { freeTrialMinutes: number; plan1Name: string; plan1Minutes: number; plan1PriceCents: number; plan2Name: string; plan2Minutes: number; plan2PriceCents: number; plan3Name: string; plan3Minutes: number; plan3PriceCents: number; bonusPlanKey: string | null; billingMode: string; }

  const { data: ms, isLoading } = useQuery<MembershipSettings>({ queryKey: ["/api/admin/membership-settings"] });

  const [freeTrialMinutes, setFreeTrialMinutes] = useState("");
  const [plan1Name, setPlan1Name] = useState(""); const [plan1Minutes, setPlan1Minutes] = useState(""); const [plan1Price, setPlan1Price] = useState("");
  const [plan2Name, setPlan2Name] = useState(""); const [plan2Minutes, setPlan2Minutes] = useState(""); const [plan2Price, setPlan2Price] = useState("");
  const [plan3Name, setPlan3Name] = useState(""); const [plan3Minutes, setPlan3Minutes] = useState(""); const [plan3Price, setPlan3Price] = useState("");
  const [bonusPlanKey, setBonusPlanKey] = useState<string | null>(null);
  const [billingMode, setBillingMode] = useState<"per_minute" | "per_day">("per_minute");
  const [initialized, setInitialized] = useState(false);

  if (ms && !initialized) {
    setFreeTrialMinutes(String(ms.freeTrialMinutes));
    setPlan1Name(ms.plan1Name); setPlan1Minutes(String(ms.plan1Minutes)); setPlan1Price((ms.plan1PriceCents / 100).toFixed(2));
    setPlan2Name(ms.plan2Name); setPlan2Minutes(String(ms.plan2Minutes)); setPlan2Price((ms.plan2PriceCents / 100).toFixed(2));
    setPlan3Name(ms.plan3Name); setPlan3Minutes(String(ms.plan3Minutes)); setPlan3Price((ms.plan3PriceCents / 100).toFixed(2));
    setBonusPlanKey(ms.bonusPlanKey ?? null);
    setBillingMode((ms.billingMode ?? "per_minute") as "per_minute" | "per_day");
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
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/membership-settings"] }); toast({ title: "Membership settings saved" }); },
    onError: (err: Error) => toast({ title: "Failed to save settings", description: err.message, variant: "destructive" }),
  });

  const plans = [
    { label: "Plan 1", keyBadge: "Press 1", planKey: "plan1", name: plan1Name, setName: setPlan1Name, minutes: plan1Minutes, setMinutes: setPlan1Minutes, price: plan1Price, setPrice: setPlan1Price, testPrefix: "plan1" },
    { label: "Plan 2", keyBadge: "Press 2", planKey: "plan2", name: plan2Name, setName: setPlan2Name, minutes: plan2Minutes, setMinutes: setPlan2Minutes, price: plan2Price, setPrice: setPlan2Price, testPrefix: "plan2" },
    { label: "Plan 3", keyBadge: "Press 3", planKey: "plan3", name: plan3Name, setName: setPlan3Name, minutes: plan3Minutes, setMinutes: setPlan3Minutes, price: plan3Price, setPrice: setPlan3Price, testPrefix: "plan3" },
  ];

  if (isLoading) return <div className="py-20 text-center text-gray-400 font-mono text-xs tracking-widest">LOADING SETTINGS...</div>;

  return (
    <div className="space-y-6">
      <div className={C.card}>
        <h3 className="text-gray-800 font-mono text-sm font-bold tracking-widest uppercase">Free Trial</h3>
        <p className="text-gray-400 font-mono text-xs">Minutes granted automatically to first-time callers with no membership.</p>
        <div className="max-w-xs space-y-2">
          <div>
            <label className={C.label}>Free Trial Minutes</label>
            <input data-testid="input-free-trial-minutes" type="number" min="1" value={freeTrialMinutes} onChange={e => setFreeTrialMinutes(e.target.value)} className={C.input} placeholder="90" />
          </div>
          <div>
            <label className={C.label + " text-gray-300"}>Seconds (system value — auto-calculated)</label>
            <input
              data-testid="display-free-trial-seconds"
              type="text"
              readOnly
              value={`${(parseInt(freeTrialMinutes) || 0) * 60} sec`}
              className={C.input + " bg-gray-50 text-gray-400 cursor-default select-none"}
            />
          </div>
        </div>
      </div>

      <div className={C.card}>
        <h3 className="text-gray-800 font-mono text-sm font-bold tracking-widest uppercase">Billing Mode</h3>
        <p className="text-gray-400 font-mono text-xs">Choose how membership time is consumed. Per-minute deducts time during active calls. Per-day deducts one full day from every active member each night at 11:59 PM server time.</p>
        <div className="flex gap-3 mt-3">
          <button
            data-testid="btn-billing-mode-per-minute"
            type="button"
            onClick={() => setBillingMode("per_minute")}
            className={`flex-1 flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-mono tracking-widest uppercase transition-colors ${billingMode === "per_minute" ? "border-[#f5a623] bg-amber-50 text-amber-700" : "border-gray-200 bg-gray-50 text-gray-400 hover:border-gray-300 hover:text-gray-500"}`}
          >
            <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${billingMode === "per_minute" ? "border-[#f5a623] bg-[#f5a623]" : "border-gray-300"}`}>
              {billingMode === "per_minute" && <span className="w-2 h-2 rounded-full bg-white" />}
            </span>
            <div className="text-left">
              <div className="font-bold">Per Minute</div>
              <div className="text-xs font-normal normal-case tracking-normal text-gray-400 mt-0.5">Deducts time during calls</div>
            </div>
          </button>
          <button
            data-testid="btn-billing-mode-per-day"
            type="button"
            onClick={() => setBillingMode("per_day")}
            className={`flex-1 flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-mono tracking-widest uppercase transition-colors ${billingMode === "per_day" ? "border-blue-400 bg-blue-50 text-blue-700" : "border-gray-200 bg-gray-50 text-gray-400 hover:border-gray-300 hover:text-gray-500"}`}
          >
            <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${billingMode === "per_day" ? "border-blue-400 bg-blue-400" : "border-gray-300"}`}>
              {billingMode === "per_day" && <span className="w-2 h-2 rounded-full bg-white" />}
            </span>
            <div className="text-left">
              <div className="font-bold">Per Day</div>
              <div className="text-xs font-normal normal-case tracking-normal text-gray-400 mt-0.5">Deducts 1 day nightly at 11:59 PM</div>
            </div>
          </button>
        </div>
        {billingMode === "per_day" && (
          <div className="mt-3 px-3 py-2 rounded bg-blue-50 border border-blue-100 text-blue-700 font-mono text-xs">
            Per-day mode active — one day will be deducted from every member's remaining time at 11:59 PM each night. Call-time usage is not tracked.
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-gray-700 font-mono text-sm font-bold tracking-widest uppercase">Membership Plans</h3>
        <p className="text-gray-400 font-mono text-xs">Three plans offered to callers. Callers press 1, 2, or 3 to select.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map(plan => (
            <div key={plan.label} className={C.card}>
              <div className="flex items-center justify-between">
                <h4 className="text-gray-900 font-mono text-sm font-bold tracking-widest uppercase">{plan.label}</h4>
                <span className={`${C.badge} border-amber-200 bg-amber-50 text-amber-700`}>{plan.keyBadge}</span>
              </div>
              <div className="space-y-3">
                <div>
                  <label className={C.label}>Plan Name</label>
                  <input data-testid={`input-${plan.testPrefix}-name`} type="text" value={plan.name} onChange={e => plan.setName(e.target.value)} placeholder="e.g. Premium" className={C.input} />
                </div>
                <div className="space-y-2">
                  <div>
                    <label className={C.label}>Minutes</label>
                    <input data-testid={`input-${plan.testPrefix}-minutes`} type="number" min="1" value={plan.minutes} onChange={e => plan.setMinutes(e.target.value)} placeholder="43200" className={C.input} />
                  </div>
                  <div>
                    <label className={C.label + " text-gray-300"}>Seconds (system value — auto-calculated)</label>
                    <input
                      data-testid={`display-${plan.testPrefix}-seconds`}
                      type="text"
                      readOnly
                      value={`${(parseInt(plan.minutes) || 0) * 60} sec`}
                      className={C.input + " bg-gray-50 text-gray-400 cursor-default select-none"}
                    />
                  </div>
                </div>
                <div>
                  <label className={C.label}>Price (USD)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-sm">$</span>
                    <input data-testid={`input-${plan.testPrefix}-price`} type="number" min="0" step="0.01" value={plan.price} onChange={e => plan.setPrice(e.target.value)} placeholder="25.00" className={C.input + " pl-7"} />
                  </div>
                </div>
              </div>
              <div className="pt-3 border-t border-gray-100 space-y-3">
                <div className="text-gray-500 font-mono text-xs">
                  {(() => { const m = parseInt(plan.minutes) || 0; if (m < 60) return `${m} min`; const hrs = Math.floor(m / 60); const mins = m % 60; return mins === 0 ? `${hrs} hr${hrs !== 1 ? "s" : ""}` : `${hrs} hr ${mins} min`; })()} · ${parseFloat(plan.price || "0").toFixed(2)}
                </div>
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
                  <div className="text-amber-600 font-mono text-xs">
                    First-time buyers get double minutes — {(() => { const m = parseInt(plan.minutes) || 0; const total = m * 2; if (total < 60) return `${total} min`; const hrs = Math.floor(total / 60); const mins = total % 60; return mins === 0 ? `${hrs} hrs` : `${hrs} hr ${mins} min`; })()}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── DashboardTab ──────────────────────────────────────────────────────────────
function DashboardTab() {
  const { data: stats } = useQuery<{ users: number; profiles: number; messages: number; activeCalls: number }>({
    queryKey: ["/api/stats"],
    refetchInterval: 5000,
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

  const LabelRow = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-6 items-start py-5 border-b border-gray-100 last:border-0">
      <div className="sm:pt-1">
        <p className="text-sm font-semibold text-gray-700">{label}</p>
        {hint && <p className="text-xs text-gray-400 mt-0.5 leading-snug">{hint}</p>}
      </div>
      <div className="sm:col-span-2">{children}</div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h2 className="text-base font-semibold text-gray-900 mb-1">Website Settings</h2>
      <p className="text-sm text-gray-500 mb-6">These values control how your public-facing site appears and how callers can reach support.</p>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-2">
          <LabelRow label="Site Name" hint="Shown in the browser tab, header, and footer.">
            <input
              type="text"
              value={siteName}
              onChange={e => setSiteName(e.target.value)}
              placeholder="Phone Booth"
              data-testid="input-site-name"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </LabelRow>

          <LabelRow label="Fallback Phone Number" hint="Displayed when a caller's local number cannot be determined.">
            <input
              type="text"
              value={fallbackPhone}
              onChange={e => setFallbackPhone(e.target.value)}
              placeholder="800-730-2508"
              data-testid="input-fallback-phone"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </LabelRow>

          <LabelRow label="Customer Service Email" hint="If set, shown in the footer as a support contact. Leave blank to hide.">
            <input
              type="email"
              value={csEmail}
              onChange={e => setCsEmail(e.target.value)}
              placeholder="support@example.com"
              data-testid="input-cs-email"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </LabelRow>

          <LabelRow label="Customer Service Phone" hint="If set, shown on the public site as a support number. Leave blank to hide.">
            <input
              type="text"
              value={csPhone}
              onChange={e => setCsPhone(e.target.value)}
              placeholder="800-555-0100"
              data-testid="input-cs-phone"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </LabelRow>

          <LabelRow
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
          </LabelRow>
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
function CallerDetailView({ callerId, allCallers, onBack }: { callerId: string; allCallers: CallerSummary[]; onBack: () => void }) {
  const { toast } = useToast();
  const [creditInput, setCreditInput] = useState("");
  const [creditMode, setCreditMode] = useState<"add" | "remove">("add");

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
        <div>
          <div className="text-gray-900 font-mono font-bold text-sm tracking-widest uppercase">{user.phoneNumber}</div>
          <div className="text-gray-400 font-mono text-xs">Caller Record</div>
        </div>
      </div>

      {/* ── Caller Information ── */}
      <div className={C.panel}>
        <div className={C.panelHeader}>Caller Information</div>
        <div className={C.panelBody}>
          <div className={C.fieldRow}><span className={C.fieldLabel}>Phone Number</span><span className={C.fieldValue} data-testid="detail-phone">{user.phoneNumber}</span></div>
          <div className={C.fieldRow}><span className={C.fieldLabel}>Joined</span><span className={C.fieldValue}>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}</span></div>
          <div className={C.fieldRow}><span className={C.fieldLabel}>Membership Tier</span><span className={C.fieldValue}>{user.membershipTier ?? <span className="text-gray-400">None</span>}</span></div>
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
          <div className={C.fieldRow}><span className={C.fieldLabel}>Stripe Customer</span><span className={C.fieldValue}>{user.stripeCustomerId ?? <span className="text-gray-400">—</span>}</span></div>
          <div className={C.fieldRow}>
            <span className={C.fieldLabel}>Voice Profile</span>
            <span className={C.fieldValue}>
              {profile ? (
                <span className="inline-flex items-center gap-2">
                  <span className={`${C.badge} border-emerald-200 bg-emerald-50 text-emerald-700`}><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Active</span>
                  <span className="text-gray-400 text-xs">{fmtSecs(profile.recordingDuration)}</span>
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

      {/* ── Call History ── */}
      <div className={C.panel}>
        <div className={C.panelHeader}>Call History <span className="opacity-60 font-normal ml-2">({callHistory.length})</span></div>
        <div className={C.panelBody}>
          {callHistory.length === 0 ? (
            <div className="px-4 py-6 text-gray-400 font-mono text-xs text-center">No calls on record.</div>
          ) : (
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
                {callHistory.map((call, i) => (
                  <tr key={call.id} data-testid={`row-call-${i}`} className="border-b border-gray-50 last:border-0 hover:bg-amber-50/30 transition-colors">
                    <td className="px-4 py-2 text-gray-600 font-mono text-xs">{call.startedAt ? new Date(call.startedAt).toLocaleString() : "—"}</td>
                    <td className="px-4 py-2 text-gray-700 font-mono text-xs">{call.toPhoneNumber ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-700 font-mono text-xs">{fmtSecs(call.durationSeconds)}</td>
                    <td className="px-4 py-2">
                      <span className={`${C.badge} ${call.completedAt ? "border-gray-200 bg-gray-50 text-gray-500" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                        {call.completedAt ? "Completed" : "In Progress"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

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
              <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400 font-mono text-xs tracking-widest">LOADING CALLERS…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400 font-mono text-xs tracking-widest">
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

  const statusBadge = (s: string) => {
    if (s === "pending")  return "bg-amber-50 border-amber-200 text-amber-700";
    if (s === "approved") return "bg-emerald-50 border-emerald-200 text-emerald-700";
    if (s === "removed")  return "bg-red-50 border-red-200 text-red-600";
    return "bg-gray-50 border-gray-200 text-gray-500";
  };

  const typeBadge = (t: string) => t === "profile"
    ? "bg-blue-50 border-blue-200 text-blue-700"
    : "bg-purple-50 border-purple-200 text-purple-700";

  const displayLabel = (item: FlaggedItem) => {
    if (item.contentType === "profile") return item.profilePhone ?? item.contentId.slice(0, 8);
    return item.messageFromPhone ? `${item.messageFromPhone} → ${item.messageToPhone ?? "?"}` : item.contentId.slice(0, 8);
  };

  const pendingCount = (allItems ?? []).filter(i => i.status === "pending").length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-gray-400 font-mono text-xs">
          {(["pending", "approved", "removed", "all"] as const).map(s => (
            <button
              key={s}
              data-testid={`btn-filter-${s}`}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-0.5 rounded font-mono text-xs tracking-widest uppercase transition-colors ${statusFilter === s ? "bg-[#f5a623] text-black" : "text-gray-400 hover:text-gray-700"}`}
            >{s}{s === "pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}</button>
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
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-3">
          <h3 className="font-mono text-xs font-bold tracking-widest uppercase text-amber-800">Flag Content Manually</h3>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="font-mono text-xs text-gray-500 uppercase tracking-widest">Type</label>
              <select
                data-testid="select-flag-type"
                value={addForm.contentType}
                onChange={e => setAddForm(f => ({ ...f, contentType: e.target.value }))}
                className="border border-gray-200 rounded px-2 py-1.5 font-mono text-xs bg-white text-gray-700 focus:outline-none focus:border-[#f5a623]"
              >
                <option value="profile">Profile</option>
                <option value="message">Message</option>
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
                className="w-full border border-gray-200 rounded px-2 py-1.5 font-mono text-xs bg-white text-gray-700 focus:outline-none focus:border-[#f5a623]"
              />
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs text-gray-500 uppercase tracking-widest">Reason</label>
              <select
                data-testid="select-flag-reason"
                value={addForm.reason}
                onChange={e => setAddForm(f => ({ ...f, reason: e.target.value }))}
                className="border border-gray-200 rounded px-2 py-1.5 font-mono text-xs bg-white text-gray-700 focus:outline-none focus:border-[#f5a623]"
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

      {/* Queue table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className={C.th}>Type</th>
              <th className={C.th}>Content</th>
              <th className={C.th}>Reason</th>
              <th className={C.th}>Reported By</th>
              <th className={C.th}>Flagged</th>
              <th className={C.th}>Status</th>
              <th className={C.th}>Reviewed</th>
              <th className={C.th}></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 font-mono text-xs tracking-widest"><Loader2 size={14} className="inline animate-spin mr-2" />LOADING…</td></tr>
            ) : !items || items.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 font-mono text-xs tracking-widest">
                {statusFilter === "pending" ? "NO PENDING FLAGS" : "NO ITEMS IN THIS CATEGORY"}
              </td></tr>
            ) : items.map(item => (
              <tr key={item.id} data-testid={`row-flag-${item.id}`} className={C.row}>
                <td className={C.td}>
                  <span className={`${C.badge} ${typeBadge(item.contentType)}`}>{item.contentType.toUpperCase()}</span>
                </td>
                <td className={C.td}>
                  <div className="space-y-0.5">
                    <div className="font-mono text-xs text-gray-800">{displayLabel(item)}</div>
                    {item.contentType === "profile" && item.profileDuration != null && (
                      <div className="font-mono text-xs text-gray-400">{fmtSecs(item.profileDuration)} recording</div>
                    )}
                    <div className="font-mono text-[10px] text-gray-300">{item.contentId.slice(0, 12)}…</div>
                  </div>
                </td>
                <td className={C.td}>
                  <div className="flex items-center gap-1.5 text-xs text-gray-600">
                    <AlertTriangle size={11} className="text-amber-400 shrink-0" />
                    {item.reason}
                  </div>
                </td>
                <td className={C.td + " font-mono text-xs text-gray-500"}>
                  {item.reportedByPhone ?? <span className="text-gray-300 italic">auto</span>}
                </td>
                <td className={C.td + " text-gray-400 text-xs"}>
                  {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "—"}
                </td>
                <td className={C.td}>
                  <span className={`${C.badge} ${statusBadge(item.status)}`}>{item.status.toUpperCase()}</span>
                </td>
                <td className={C.td + " text-gray-400 text-xs"}>
                  {item.reviewedAt ? new Date(item.reviewedAt).toLocaleDateString() : "—"}
                </td>
                <td className={C.td}>
                  <div className="flex items-center gap-1">
                    {item.status === "pending" && (
                      <>
                        <button
                          data-testid={`btn-approve-flag-${item.id}`}
                          title="Approve — keep content visible"
                          onClick={() => resolveMutation.mutate({ id: item.id, status: "approved" })}
                          disabled={resolveMutation.isPending}
                          className="flex items-center gap-0.5 px-2 py-1 rounded text-xs font-mono bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors"
                        ><CheckCircle2 size={11} /> OK</button>
                        <button
                          data-testid={`btn-remove-flag-${item.id}`}
                          title="Remove — mark content for removal"
                          onClick={() => resolveMutation.mutate({ id: item.id, status: "removed" })}
                          disabled={resolveMutation.isPending}
                          className="flex items-center gap-0.5 px-2 py-1 rounded text-xs font-mono bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-colors"
                        ><XCircle size={11} /> Remove</button>
                      </>
                    )}
                    {item.status !== "pending" && (
                      <button
                        data-testid={`btn-reopen-flag-${item.id}`}
                        title="Re-open flag as pending"
                        onClick={() => resolveMutation.mutate({ id: item.id, status: "pending" })}
                        disabled={resolveMutation.isPending}
                        className="flex items-center gap-0.5 px-2 py-1 rounded text-xs font-mono bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors"
                      ><Flag size={11} /> Reopen</button>
                    )}
                    <button
                      data-testid={`btn-delete-flag-${item.id}`}
                      title="Dismiss flag record"
                      onClick={() => deleteMutation.mutate(item.id)}
                      disabled={deleteMutation.isPending}
                      className="flex items-center gap-0.5 px-2 py-1 rounded text-xs font-mono bg-gray-50 border border-gray-200 text-gray-400 hover:bg-gray-100 hover:text-red-500 transition-colors"
                    ><Trash2 size={11} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── AnnouncementsTab ──────────────────────────────────────────────────────────
function AnnouncementsTab() {
  const { toast } = useToast();
  const [localEnabled, setLocalEnabled] = useState<boolean | null>(null);
  const [localText, setLocalText] = useState<string | null>(null);

  const { data: settings, isLoading } = useQuery<{
    motdEnabled: boolean;
    motdText: string | null;
  }>({ queryKey: ["/api/admin/membership-settings"] });

  const enabled = localEnabled ?? settings?.motdEnabled ?? false;
  const text = localText ?? settings?.motdText ?? "";

  const saveMutation = useMutation({
    mutationFn: (body: { motdEnabled: boolean; motdText: string }) =>
      apiRequest("PUT", "/api/admin/membership-settings", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/membership-settings"] });
      setLocalEnabled(null);
      setLocalText(null);
      toast({ title: "Saved", description: "Announcement settings updated." });
    },
    onError: () => toast({ title: "Error", description: "Failed to save.", variant: "destructive" }),
  });

  const handleSave = () => {
    saveMutation.mutate({ motdEnabled: enabled, motdText: text });
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Status card */}
      <div className={`rounded-xl border p-5 flex items-center justify-between ${enabled ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}>
        <div className="flex items-center gap-3">
          <Megaphone size={20} className={enabled ? "text-green-600" : "text-gray-400"} />
          <div>
            <p className="font-mono font-bold text-sm tracking-wide text-gray-900">ANNOUNCEMENT</p>
            <p className={`text-xs mt-0.5 ${enabled ? "text-green-700" : "text-gray-500"}`}>
              {enabled ? "Currently playing to every caller at login" : "Currently disabled — callers will not hear anything"}
            </p>
          </div>
        </div>
        <button
          data-testid="btn-toggle-motd"
          onClick={() => setLocalEnabled(!enabled)}
          className="flex items-center gap-2 transition-colors"
        >
          {enabled
            ? <ToggleRight size={36} className="text-green-500" />
            : <ToggleLeft size={36} className="text-gray-300" />}
        </button>
      </div>

      {/* Message editor */}
      <div className={`rounded-xl border bg-white p-5 space-y-3 ${!enabled ? "opacity-60" : ""}`}>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-mono font-bold text-xs tracking-widest uppercase text-gray-700">Announcement Message</h3>
        </div>
        <p className="text-xs text-gray-500">
          This text is read to every caller immediately after the system greeting. Keep it concise — 1 to 3 sentences work best.
        </p>
        <textarea
          data-testid="input-motd-text"
          value={text}
          onChange={e => setLocalText(e.target.value)}
          disabled={!enabled}
          rows={4}
          placeholder="e.g. This weekend only — all new callers receive an extended free trial. Check out the profiles and start connecting today."
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f5a623]/40 resize-none disabled:cursor-not-allowed"
        />
        <p className="text-xs text-gray-400">
          Tip: For a premium voice, generate <span className="font-mono bg-gray-100 px-1 rounded">motd.mp3</span> in the Audio Gen tab. If that file exists it will be played instead of text-to-speech.
        </p>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          data-testid="btn-save-motd"
          onClick={handleSave}
          disabled={saveMutation.isPending || isLoading}
          className={C.btnPrimary}
        >
          {saveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          Save Announcement
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

// ── Tab definitions ───────────────────────────────────────────────────────────
const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard",      label: "Dashboard",      icon: <LayoutDashboard size={15} /> },
  { id: "callers",        label: "Callers",         icon: <Users size={15} /> },
  { id: "flagged",        label: "Flagged Content", icon: <Flag size={15} /> },
  { id: "voice-profiles", label: "Voice Profiles",  icon: <Phone size={15} /> },
  { id: "regions",        label: "Regions",         icon: <Globe size={15} /> },
  { id: "memberships",    label: "Memberships",     icon: <CreditCard size={15} /> },
  { id: "audio-gen",      label: "Audio Gen",       icon: <Volume2 size={15} /> },
  { id: "messages",       label: "Messages",        icon: <MessageSquare size={15} /> },
  { id: "phone-numbers",  label: "Phone Numbers",   icon: <Phone size={15} /> },
  { id: "blocked",        label: "Blocked Numbers", icon: <X size={15} /> },
  { id: "promo-codes",    label: "Promo Codes",     icon: <Tag size={15} /> },
  { id: "zip-codes",      label: "Zip Codes",       icon: <MapPin size={15} /> },
  { id: "announcements",  label: "Announcements",   icon: <Megaphone size={15} /> },
  { id: "analytics",      label: "Analytics",       icon: <BarChart2 size={15} /> },
  { id: "audit-log",      label: "Audit Log",       icon: <TrendingUp size={15} /> },
  { id: "phone-testing",  label: "Phone Testing",   icon: <PhoneCall size={15} /> },
  { id: "site-settings",  label: "Website Settings", icon: <Settings size={15} /> },
];

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
export default function Admin() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [showUpload, setShowUpload] = useState(false);
  const [showAddRegion, setShowAddRegion] = useState(false);
  const [saveMembership, setSaveMembership] = useState(false);

  const activeLabel = tabs.find(t => t.id === activeTab)?.label ?? "";

  return (
    <div className="flex h-screen bg-white overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className="w-52 bg-[#111827] flex flex-col flex-shrink-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 grid grid-cols-2 gap-0.5 opacity-80">
              {[...Array(4)].map((_, i) => <div key={i} className="bg-[#f5a623] rounded-[1px]" />)}
            </div>
            <span className="text-white font-mono font-bold text-sm tracking-widest">BACK OFFICE</span>
          </div>
          <Link href="/">
            <X size={14} className="text-white/40 hover:text-white/80 transition-colors cursor-pointer" />
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
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
        <div className="px-2 py-3 border-t border-white/10 space-y-0.5">
          <Link href="/" className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-white/40 hover:text-white/70 hover:bg-white/5 font-mono text-xs tracking-widest uppercase transition-colors border-l-2 border-transparent pl-[10px]">
            <LogOut size={15} />
            Exit
          </Link>
        </div>
      </aside>

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
        <div className="flex-1 overflow-y-auto p-6">
          {showUpload && <UploadDialog onClose={() => setShowUpload(false)} />}
          {showAddRegion && <RegionDialog onClose={() => setShowAddRegion(false)} />}

          {activeTab === "dashboard"      && <DashboardTab />}
          {activeTab === "callers"        && <CallersTab />}
          {activeTab === "flagged"        && <FlaggedContentTab />}
          {activeTab === "voice-profiles" && <VoiceProfilesTab key={String(showUpload)} />}
          {activeTab === "regions"        && <RegionsTab />}
          {activeTab === "memberships"    && <MembershipsTab />}
          {activeTab === "audio-gen"      && <TTSTab />}
          {activeTab === "messages"       && <MessagesTab />}
          {activeTab === "phone-numbers"  && <PhoneNumbersTab />}
          {activeTab === "blocked"        && <BlockedNumbersTab />}
          {activeTab === "promo-codes"    && <PromoCodesTab />}
          {activeTab === "zip-codes"      && <ZipCodesTab />}
          {activeTab === "announcements"  && <AnnouncementsTab />}
          {activeTab === "analytics"      && <AnalyticsTab />}
          {activeTab === "audit-log"      && <AuditLogTab />}
          {activeTab === "phone-testing"  && <PlaceholderTab label="Phone Testing" />}
          {activeTab === "site-settings"  && <WebsiteSettingsTab />}
        </div>
      </div>
    </div>
  );
}
