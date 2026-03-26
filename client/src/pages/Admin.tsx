import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Upload, Trash2, Play, Pause, Plus, Phone, LayoutDashboard,
  MessageSquare, PhoneCall, X, MapPin, Clock, Copy, Eye, EyeOff,
  Pencil, Globe, Volume2, Wand2, CheckCircle, AlertCircle, Loader2,
} from "lucide-react";

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
  createdAt: string;
  activeCalls: number;
  voiceProfiles: number;
  messagesRelayed: number;
}

type Tab = "dashboard" | "voice-profiles" | "regions" | "messages" | "phone-testing" | "audio-gen";

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
        className="flex items-center justify-center w-8 h-8 rounded border border-[#f5a623]/40 bg-[#f5a623]/10 hover:bg-[#f5a623]/20 text-[#f5a623] transition-colors"
      >
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <span className="text-[#4caf82]/60 text-xs font-mono">
        {playing ? "PLAYING_" : "READY_"}
      </span>
    </div>
  );
}

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 bg-[#0d1117] border border-[#f5a623]/30 rounded-lg p-6 shadow-2xl">
        <button data-testid="btn-close-dialog" onClick={onClose} className="absolute top-4 right-4 text-[#4caf82]/60 hover:text-[#f5a623] transition-colors">
          <X size={18} />
        </button>
        <h2 className="text-[#f5a623] font-mono text-lg font-bold mb-1 tracking-widest uppercase">Upload Profile Greeting_</h2>
        <p className="text-[#4caf82]/60 text-xs font-mono mb-6">MP3 file will become the caller's live profile greeting</p>
        <div className="space-y-4">
          <div>
            <label className="block text-[#4caf82] font-mono text-xs tracking-widest mb-2 uppercase">Caller Phone Number_</label>
            <input
              data-testid="input-phone-number"
              type="tel"
              value={phoneNumber}
              onChange={e => setPhoneNumber(e.target.value)}
              placeholder="+1 555 000 0000"
              className="w-full bg-black/40 border border-[#4caf82]/30 rounded px-3 py-2.5 text-[#4caf82] font-mono text-sm placeholder-[#4caf82]/30 focus:outline-none focus:border-[#f5a623]/60 transition-colors"
            />
          </div>
          <div>
            <label className="block text-[#4caf82] font-mono text-xs tracking-widest mb-2 uppercase">MP3 Audio File_</label>
            <div
              data-testid="dropzone-audio"
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`w-full border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${dragOver ? "border-[#f5a623] bg-[#f5a623]/5" : file ? "border-[#4caf82]/60 bg-[#4caf82]/5" : "border-[#4caf82]/20 hover:border-[#f5a623]/40 hover:bg-[#f5a623]/5"}`}
            >
              <input ref={fileInputRef} type="file" accept=".mp3,audio/mpeg" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} data-testid="input-file-upload" />
              {file ? (
                <div className="space-y-1">
                  <div className="text-[#4caf82] font-mono text-sm">{file.name}</div>
                  <div className="text-[#4caf82]/50 font-mono text-xs">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload size={24} className="mx-auto text-[#4caf82]/40" />
                  <div className="text-[#4caf82]/60 font-mono text-xs">Drop MP3 here or click to browse</div>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button data-testid="btn-cancel-upload" onClick={onClose} className="flex-1 py-2.5 border border-[#4caf82]/30 rounded font-mono text-xs text-[#4caf82]/60 hover:text-[#4caf82] hover:border-[#4caf82]/60 transition-colors tracking-widest uppercase">Cancel_</button>
            <button data-testid="btn-submit-upload" onClick={() => uploadMutation.mutate()} disabled={!phoneNumber.trim() || !file || uploadMutation.isPending} className="flex-1 py-2.5 bg-[#f5a623] hover:bg-[#f5a623]/80 disabled:bg-[#f5a623]/30 disabled:cursor-not-allowed rounded font-mono text-xs text-black font-bold tracking-widest uppercase transition-colors">
              {uploadMutation.isPending ? "Uploading..." : "Upload & Save_"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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

  function handleNameChange(val: string) {
    setName(val);
    if (!isEdit) setSlug(val.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = { name: name.trim(), slug: slug.trim(), phoneNumber: phoneNumber.trim(), timezone: timezone.trim(), maxCapacity: parseInt(maxCapacity) || 1000, description: description.trim() || null, isActive };
      if (isEdit) {
        return apiRequest("PUT", `/api/regions/${region.id}`, body);
      } else {
        return apiRequest("POST", `/api/regions`, body);
      }
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

  const inputClass = "w-full bg-black/40 border border-[#4caf82]/30 rounded px-3 py-2.5 text-[#4caf82] font-mono text-sm placeholder-[#4caf82]/30 focus:outline-none focus:border-[#f5a623]/60 transition-colors";
  const labelClass = "block text-[#4caf82] font-mono text-xs tracking-widest mb-2 uppercase";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg mx-4 bg-[#0d1117] border border-[#f5a623]/30 rounded-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <button data-testid="btn-close-region-dialog" onClick={onClose} className="absolute top-4 right-4 text-[#4caf82]/60 hover:text-[#f5a623] transition-colors">
          <X size={18} />
        </button>
        <h2 className="text-[#f5a623] font-mono text-lg font-bold mb-1 tracking-widest uppercase">
          {isEdit ? "Edit Region_" : "Add Region_"}
        </h2>
        <p className="text-[#4caf82]/60 text-xs font-mono mb-6">
          {isEdit ? "Update regional market settings" : "Create a new regional phone market"}
        </p>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Market Name_</label>
              <input data-testid="input-region-name" type="text" value={name} onChange={e => handleNameChange(e.target.value)} placeholder="Denver" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>URL Slug_</label>
              <input data-testid="input-region-slug" type="text" value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="denver" className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Phone Number_</label>
            <input data-testid="input-region-phone" type="tel" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="+1 303 555 0123" className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Timezone_</label>
              <input data-testid="input-region-timezone" type="text" value={timezone} onChange={e => setTimezone(e.target.value)} placeholder="America/Denver" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Max Capacity_</label>
              <input data-testid="input-region-capacity" type="number" value={maxCapacity} onChange={e => setMaxCapacity(e.target.value)} placeholder="1000" className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Description_</label>
            <input data-testid="input-region-description" type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Colorado Rocky Mountains region" className={inputClass} />
          </div>
          <div className="flex items-center gap-3">
            <button
              data-testid="toggle-region-active"
              type="button"
              onClick={() => setIsActive(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isActive ? "bg-[#4caf82]" : "bg-[#4caf82]/20"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isActive ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <span className="text-[#4caf82] font-mono text-xs tracking-widest uppercase">
              {isActive ? "Active" : "Inactive"}
            </span>
          </div>

          {slug && (
            <div className="bg-black/30 border border-[#4caf82]/20 rounded p-3">
              <div className="text-[#4caf82]/50 font-mono text-xs tracking-widest uppercase mb-1">Webhook URL_</div>
              <div className="text-[#f5a623] font-mono text-xs break-all">/voice/{slug}</div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button data-testid="btn-cancel-region" onClick={onClose} className="flex-1 py-2.5 border border-[#4caf82]/30 rounded font-mono text-xs text-[#4caf82]/60 hover:text-[#4caf82] hover:border-[#4caf82]/60 transition-colors tracking-widest uppercase">Cancel_</button>
            <button
              data-testid="btn-save-region"
              onClick={() => saveMutation.mutate()}
              disabled={!name.trim() || !slug.trim() || !phoneNumber.trim() || saveMutation.isPending}
              className="flex-1 py-2.5 bg-[#f5a623] hover:bg-[#f5a623]/80 disabled:bg-[#f5a623]/30 disabled:cursor-not-allowed rounded font-mono text-xs text-black font-bold tracking-widest uppercase transition-colors"
            >
              {saveMutation.isPending ? "Saving..." : isEdit ? "Save Changes_" : "Create Region_"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/regions"] });
      toast({ title: "Region deleted" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async (region: Region) => apiRequest("PUT", `/api/regions/${region.id}`, { isActive: !region.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/regions"] }),
    onError: () => toast({ title: "Failed to update region", variant: "destructive" }),
  });

  function copyWebhook(slug: string) {
    navigator.clipboard.writeText(`${origin}/voice/${slug}`);
    toast({ title: "Webhook URL copied" });
  }

  function copyPhone(phone: string) {
    navigator.clipboard.writeText(phone);
    toast({ title: "Phone number copied" });
  }

  return (
    <div className="space-y-4">
      {dialog === "add" && <RegionDialog onClose={() => setDialog(null)} />}
      {dialog && dialog !== "add" && <RegionDialog region={dialog as Region} onClose={() => setDialog(null)} />}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[#f5a623] font-mono text-lg font-bold tracking-widest uppercase flex items-center gap-2">
            <Globe size={18} />
            Regional Management_
          </h2>
          <p className="text-[#4caf82]/50 font-mono text-xs mt-1">
            Manage phone numbers and regional markets for your voice dating system
          </p>
        </div>
        <button
          data-testid="btn-add-region"
          onClick={() => setDialog("add")}
          className="flex items-center gap-2 px-4 py-2 bg-[#f5a623] hover:bg-[#f5a623]/80 text-black font-mono text-xs font-bold tracking-widest uppercase rounded transition-colors"
        >
          <Plus size={14} />
          Add Region
        </button>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-[#4caf82]/40 font-mono text-xs tracking-widest">
          LOADING REGIONS...
        </div>
      ) : !regions || regions.length === 0 ? (
        <div className="py-20 text-center">
          <MapPin size={32} className="mx-auto text-[#4caf82]/20 mb-4" />
          <div className="text-[#4caf82]/40 font-mono text-xs tracking-widest">
            NO REGIONS CONFIGURED — ADD ONE TO BEGIN
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {regions.map(region => (
            <div
              key={region.id}
              data-testid={`card-region-${region.id}`}
              className="border border-[#f5a623]/20 rounded-lg p-5 bg-black/30 space-y-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded border border-[#f5a623]/30 bg-[#f5a623]/10 flex items-center justify-center">
                    <MapPin size={16} className="text-[#f5a623]" />
                  </div>
                  <div>
                    <div className="text-white font-mono font-bold text-sm tracking-widest uppercase">
                      {region.name}
                    </div>
                    <div className="text-[#4caf82]/50 font-mono text-xs tracking-widest uppercase">
                      {region.slug}
                    </div>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded border font-mono text-xs tracking-widest uppercase ${region.isActive ? "border-[#4caf82]/40 bg-[#4caf82]/10 text-[#4caf82]" : "border-[#4caf82]/20 bg-black/30 text-[#4caf82]/40"}`}>
                  {region.isActive ? "Active" : "Inactive"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Phone size={12} className="text-[#4caf82]/50" />
                <span data-testid={`text-phone-${region.id}`} className="text-[#4caf82] font-mono text-sm flex-1">
                  {region.phoneNumber}
                </span>
                <button
                  data-testid={`btn-copy-phone-${region.id}`}
                  onClick={() => copyPhone(region.phoneNumber)}
                  className="text-[#4caf82]/40 hover:text-[#f5a623] transition-colors"
                >
                  <Copy size={12} />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-[#f5a623] font-mono font-bold text-2xl">
                    {String(region.activeCalls).padStart(3, "0")}
                  </div>
                  <div className="text-[#4caf82]/50 font-mono text-xs tracking-widest uppercase">Live on Line</div>
                </div>
                <div>
                  <div className="text-[#f5a623] font-mono font-bold text-2xl">
                    {String(region.voiceProfiles).padStart(3, "0")}
                  </div>
                  <div className="text-[#4caf82]/50 font-mono text-xs tracking-widest uppercase">Voice Profiles</div>
                </div>
                <div>
                  <div className="text-[#f5a623] font-mono font-bold text-2xl">
                    {String(region.messagesRelayed).padStart(3, "0")}
                  </div>
                  <div className="text-[#4caf82]/50 font-mono text-xs tracking-widest uppercase">Msgs Relayed</div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[#4caf82]/60 font-mono text-xs">
                <Clock size={12} />
                {region.timezone}
              </div>

              {region.description && (
                <div className="text-[#4caf82]/50 font-mono text-xs">{region.description}</div>
              )}

              <div className="flex items-center justify-between pt-1 border-t border-[#4caf82]/10">
                <div className="flex gap-2">
                  <button
                    data-testid={`btn-edit-region-${region.id}`}
                    onClick={() => setDialog(region)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-[#f5a623]/30 bg-[#f5a623]/10 hover:bg-[#f5a623]/20 text-[#f5a623] font-mono text-xs rounded transition-colors"
                  >
                    <Pencil size={11} />
                    Edit
                  </button>
                  <button
                    data-testid={`btn-delete-region-${region.id}`}
                    onClick={() => { if (confirm(`Delete region "${region.name}"?`)) deleteMutation.mutate(region.id); }}
                    disabled={deleteMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-mono text-xs rounded transition-colors disabled:opacity-50"
                  >
                    <Trash2 size={11} />
                    Delete
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    data-testid={`btn-copy-webhook-${region.id}`}
                    onClick={() => copyWebhook(region.slug)}
                    title={`Copy webhook: /voice/${region.slug}`}
                    className="text-[#4caf82]/40 hover:text-[#f5a623] transition-colors"
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    data-testid={`btn-toggle-region-${region.id}`}
                    onClick={() => toggleMutation.mutate(region)}
                    disabled={toggleMutation.isPending}
                    title={region.isActive ? "Deactivate region" : "Activate region"}
                    className={`transition-colors ${region.isActive ? "text-[#4caf82]" : "text-[#4caf82]/30"} hover:text-[#f5a623] disabled:opacity-50`}
                  >
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

function VoiceProfilesTab() {
  const { toast } = useToast();
  const [showUpload, setShowUpload] = useState(false);

  const { data: profiles, isLoading } = useQuery<ProfileWithUser[]>({
    queryKey: ["/api/admin/profiles"],
  });

  const { data: liveData } = useQuery<{ liveUserIds: string[] }>({
    queryKey: ["/api/admin/simulator/live"],
    refetchInterval: 5000,
  });

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
    onError: () => {
      toast({ title: "Delete failed", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      {showUpload && <UploadDialog onClose={() => setShowUpload(false)} />}
      <div className="flex items-center justify-between">
        <h2 className="text-[#f5a623] font-mono text-lg font-bold tracking-widest uppercase">Voice Profiles_</h2>
        <button
          data-testid="btn-add-profile"
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#f5a623] hover:bg-[#f5a623]/80 text-black font-mono text-xs font-bold tracking-widest uppercase rounded transition-colors"
        >
          <Plus size={14} />
          Add Profile
        </button>
      </div>
      <div className="border border-[#f5a623]/20 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#f5a623]/20">
              <th className="text-left px-5 py-3 text-[#f5a623]/70 font-mono text-xs tracking-widest uppercase">Phone</th>
              <th className="text-left px-5 py-3 text-[#f5a623]/70 font-mono text-xs tracking-widest uppercase">Audio</th>
              <th className="text-left px-5 py-3 text-[#f5a623]/70 font-mono text-xs tracking-widest uppercase">Duration</th>
              <th className="text-left px-5 py-3 text-[#f5a623]/70 font-mono text-xs tracking-widest uppercase">Status</th>
              <th className="text-left px-5 py-3 text-[#f5a623]/70 font-mono text-xs tracking-widest uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-[#4caf82]/40 font-mono text-xs tracking-widest">LOADING PROFILES...</td></tr>
            ) : !profiles || profiles.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-[#4caf82]/40 font-mono text-xs tracking-widest">NO PROFILES FOUND — UPLOAD ONE TO BEGIN</td></tr>
            ) : (
              profiles.map(profile => (
                <tr key={profile.id} data-testid={`row-profile-${profile.id}`} className="border-t border-[#4caf82]/10 hover:bg-[#4caf82]/5 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <Phone size={12} className="text-[#4caf82]/50" />
                      <span data-testid={`text-phone-${profile.id}`} className="text-[#4caf82] font-mono text-sm">{profile.phoneNumber}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4"><AudioPlayer src={profile.recordingUrl} /></td>
                  <td className="px-5 py-4">
                    <span className="text-[#4caf82]/60 font-mono text-xs">{profile.recordingDuration != null ? `${profile.recordingDuration}s` : "—"}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-[#4caf82]/30 bg-[#4caf82]/10 text-[#4caf82] font-mono text-xs tracking-widest uppercase">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4caf82] animate-pulse" />
                      Live
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <button
                      data-testid={`btn-delete-profile-${profile.id}`}
                      onClick={() => { if (confirm(`Delete profile for ${profile.phoneNumber}?`)) deleteMutation.mutate(profile.id); }}
                      disabled={deleteMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-mono text-xs rounded transition-colors disabled:opacity-50"
                    >
                      <Trash2 size={12} />
                      Delete
                    </button>
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

const SYSTEM_PROMPTS: { filename: string; label: string; text: string }[] = [
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
  { filename: "trial_warning.mp3", label: "Trial Warning", text: "You have less than 15 minutes remaining in your free trial. Stay connected by joining now. You won't be interrupted by ads. Access member only features like off-line messaging, connect live for one on one chat. To join right now press 1. To continue press pound." },
  { filename: "member_warning.mp3", label: "Member Warning", text: "You have less than 15 minutes remaining in your membership. To renew now press 1. To continue press pound." },
  { filename: "greeting_setup.mp3", label: "Greeting Setup", text: "Your last greeting you recorded is still available. To use it again, press 1. To record a new greeting, press 2. To hear your greeting, press 3. To repeat these choices, press 9. To continue, press pound." },
  { filename: "review_greeting.mp3", label: "Review Greeting", text: "To hear your greeting, press 1. To re-record, press 2. To accept and continue, press 3. To repeat these choices, press 9." },
  { filename: "no_greeting_found.mp3", label: "No Greeting Found", text: "No greeting found." },
  { filename: "session_expired_greeting.mp3", label: "Session Expired — Greeting", text: "Your session has expired. Please re-record your greeting." },
  { filename: "profile_saved.mp3", label: "Profile Saved", text: "Your greeting has been saved." },
  { filename: "no_profiles.mp3", label: "No Profiles Available", text: "There are no profiles available right now. Please call back later." },
  { filename: "message_options.mp3", label: "Message Options", text: "Press 1 to reply to this message. Press 2 to hear the sender's profile. Press 3 to continue browsing profiles. Press 9 to return to the main menu." },
  { filename: "profile_options.mp3", label: "Profile Options", text: "Press 1 to send this caller a message. Press 2 to skip to the next profile. Press 9 to return to main menu." },
  { filename: "record_reply.mp3", label: "Record Reply", text: "Record your reply after the tone." },
  { filename: "record_message.mp3", label: "Record Message", text: "Record your message after the tone." },
  { filename: "message_sent.mp3", label: "Message Sent", text: "Your message has been sent. Returning to profiles." },
  { filename: "message_send_error.mp3", label: "Message Send Error", text: "Failed to send your message. Returning to profiles." },
  { filename: "info_menu.mp3", label: "Info Menu", text: "Information, prices, and membership. Press 1 for membership questions. Press 9 to return to the main menu." },
  { filename: "membership_questions.mp3", label: "Membership Questions", text: "Membership questions. Press 1 to learn how membership works. Press 2 to hear our pricing. Press 3 to purchase a membership with a credit card. Press 9 to return to the main menu." },
  { filename: "membership_how_it_works.mp3", label: "How Membership Works", text: "Here is how membership works. As a member, you get full access to the voice line community. Members can browse unlimited caller profiles, send and receive voice messages, and enjoy priority access to new features. We offer three membership options: a 24 hour pass, a 14 day membership, and a 30 day membership. Your remaining time is tracked in hours. When you have less than 60 minutes left, the system will tell you in minutes. Choose the option that works best for you." },
  { filename: "membership_pricing.mp3", label: "Membership Pricing", text: "Here are our membership prices. A 24 hour pass is 3 dollars. A 14 day membership is 10 dollars. A 30 day membership is 25 dollars. To purchase, press 3 from the membership menu." },
  { filename: "membership_packages.mp3", label: "Membership Packages", text: "Press 1 for a 30 day membership at 25 dollars. Press 2 for a 14 day membership at 10 dollars. Press 3 for a 24 hour pass at 3 dollars. Press 9 to repeat. Press pound to cancel." },
  { filename: "package_cancelled.mp3", label: "Package Cancelled", text: "Cancelled. Returning to the main menu." },
  { filename: "package_invalid.mp3", label: "Package Invalid", text: "Invalid selection." },
  { filename: "package_confirm_30day.mp3", label: "Package Confirm — 30 Day", text: "You selected 43,200 Minute access for 25 dollars." },
  { filename: "package_confirm_14day.mp3", label: "Package Confirm — 14 Day", text: "You selected 20,160 Minute access for 10 dollars." },
  { filename: "package_confirm_14day_bonus.mp3", label: "Package Confirm — 14 Day (Bonus)", text: "Great choice! You selected 14 days access for 10 dollars, including your free 7-day first purchase bonus." },
  { filename: "package_confirm_24hour.mp3", label: "Package Confirm — 24 Hour", text: "You selected 1,440 Minute access for 3 dollars." },
  { filename: "payment_intro.mp3", label: "Payment Intro", text: "Please have your credit card ready. You will be asked to enter your card number, expiry date, and security code." },
  { filename: "payment_session_expired.mp3", label: "Payment Session Expired", text: "Your session has expired. Please try again." },
  { filename: "payment_success_30day.mp3", label: "Payment Success — 30 Day", text: "Payment successful! You now have 43,200 Minute access. Your card has been charged 25 dollars. Thank you for joining. Returning to the main menu." },
  { filename: "payment_success_14day.mp3", label: "Payment Success — 14 Day", text: "Payment successful! You now have 20,160 Minute access. Your card has been charged 10 dollars. Thank you for joining. Returning to the main menu." },
  { filename: "payment_success_14day_bonus.mp3", label: "Payment Success — 14 Day (Bonus)", text: "Payment successful! You now have 20,160 Minute access. Your card has been charged 10 dollars. Plus your bonus 20,160 minutes have been added — enjoy 40,320 minutes total! Thank you for joining. Returning to the main menu." },
  { filename: "payment_success_24hour.mp3", label: "Payment Success — 24 Hour", text: "Payment successful! You now have 1,440 Minute access. Your card has been charged 3 dollars. Thank you for joining. Returning to the main menu." },
  { filename: "payment_declined.mp3", label: "Payment Declined", text: "Your card was declined. Please check your details and try again later." },
  { filename: "payment_failed.mp3", label: "Payment Failed", text: "Your payment could not be completed at this time. Please try again later." },
  { filename: "payment_activation_error.mp3", label: "Payment Activation Error", text: "Your payment was received but there was an error activating your membership. Please contact support." },
  { filename: "region_not_active.mp3", label: "Region Not Active", text: "This phone number is not currently active. Please try again later." },
  { filename: "region_unavailable.mp3", label: "Region Unavailable", text: "This market is temporarily unavailable. Please try again later." },
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
];

function TTSTab() {
  const { toast } = useToast();
  const [customText, setCustomText] = useState("");
  const [customFilename, setCustomFilename] = useState("");
  const [editingText, setEditingText] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const { data: settings } = useQuery<{ voiceId: string }>({
    queryKey: ["/api/admin/tts/settings"],
  });

  const { data: existingFiles, refetch: refetchFiles } = useQuery<{ filename: string; url: string; size: number }[]>({
    queryKey: ["/api/admin/tts/prompts"],
  });

  const existingSet = new Set((existingFiles ?? []).map(f => f.filename));

  const generateMutation = useMutation({
    mutationFn: async ({ text, filename }: { text: string; filename: string }) => {
      const res = await fetch("/api/admin/tts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, filename }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Generation failed" }));
        throw new Error(err.message);
      }
      return res.json() as Promise<{ filename: string; url: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tts/prompts"] });
      toast({ title: "Audio generated", description: data.filename });
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tts/prompts"] });
      toast({ title: "File deleted" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  function handleGenerate(filename: string, text: string) {
    setGenerating(filename);
    generateMutation.mutate({ text, filename });
  }

  function handleCustomGenerate() {
    if (!customText.trim() || !customFilename.trim()) return;
    const fn = customFilename.trim().replace(/\.mp3$/i, "") + ".mp3";
    setGenerating(fn);
    generateMutation.mutate({ text: customText.trim(), filename: fn });
    setCustomText("");
    setCustomFilename("");
  }

  const filtered = SYSTEM_PROMPTS.filter(p =>
    !filter || p.label.toLowerCase().includes(filter.toLowerCase()) || p.filename.toLowerCase().includes(filter.toLowerCase())
  );

  const generatedCount = SYSTEM_PROMPTS.filter(p => existingSet.has(p.filename)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[#f5a623] font-mono text-lg font-bold tracking-widest uppercase flex items-center gap-2">
            <Volume2 size={18} />
            Audio Generation_
          </h2>
          <p className="text-[#4caf82]/50 font-mono text-xs mt-1">
            Generate phone system audio files using ElevenLabs TTS
          </p>
        </div>
        <div className="text-right">
          <div className="text-[#f5a623] font-mono font-bold text-2xl">{generatedCount}/{SYSTEM_PROMPTS.length}</div>
          <div className="text-[#4caf82]/50 font-mono text-xs tracking-widest uppercase">Prompts Generated</div>
        </div>
      </div>

      <div className="bg-black/30 border border-[#4caf82]/20 rounded-lg p-4 space-y-1">
        <div className="text-[#4caf82] font-mono text-xs tracking-widest uppercase mb-2">Current Voice ID_</div>
        <div className="text-[#f5a623] font-mono text-sm break-all">{settings?.voiceId ?? "Loading..."}</div>
        <div className="text-[#4caf82]/40 font-mono text-xs mt-1">Change via ELEVENLABS_VOICE_ID environment variable</div>
      </div>

      <div className="border border-[#f5a623]/20 rounded-lg p-5 space-y-4">
        <h3 className="text-[#f5a623] font-mono text-sm font-bold tracking-widest uppercase flex items-center gap-2">
          <Wand2 size={14} />
          Custom Audio File_
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[#4caf82] font-mono text-xs tracking-widest mb-1.5 uppercase">Output Filename_</label>
            <input
              data-testid="input-custom-filename"
              type="text"
              value={customFilename}
              onChange={e => setCustomFilename(e.target.value)}
              placeholder="my_custom_prompt"
              className="w-full bg-black/40 border border-[#4caf82]/30 rounded px-3 py-2.5 text-[#4caf82] font-mono text-sm placeholder-[#4caf82]/30 focus:outline-none focus:border-[#f5a623]/60 transition-colors"
            />
            <div className="text-[#4caf82]/30 font-mono text-xs mt-1">.mp3 appended automatically</div>
          </div>
          <div>
            <label className="block text-[#4caf82] font-mono text-xs tracking-widest mb-1.5 uppercase">Text to Speak_</label>
            <input
              data-testid="input-custom-text"
              type="text"
              value={customText}
              onChange={e => setCustomText(e.target.value)}
              placeholder="Enter the text to convert to speech..."
              className="w-full bg-black/40 border border-[#4caf82]/30 rounded px-3 py-2.5 text-[#4caf82] font-mono text-sm placeholder-[#4caf82]/30 focus:outline-none focus:border-[#f5a623]/60 transition-colors"
            />
          </div>
        </div>
        <button
          data-testid="btn-generate-custom"
          onClick={handleCustomGenerate}
          disabled={!customText.trim() || !customFilename.trim() || generateMutation.isPending}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#f5a623] hover:bg-[#f5a623]/80 disabled:bg-[#f5a623]/30 disabled:cursor-not-allowed text-black font-mono text-xs font-bold tracking-widest uppercase rounded transition-colors"
        >
          {generateMutation.isPending && generating === customFilename ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
          Generate Audio_
        </button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[#f5a623] font-mono text-sm font-bold tracking-widest uppercase">System Prompts_</h3>
          <input
            data-testid="input-filter-prompts"
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter prompts..."
            className="bg-black/40 border border-[#4caf82]/30 rounded px-3 py-1.5 text-[#4caf82] font-mono text-xs placeholder-[#4caf82]/30 focus:outline-none focus:border-[#f5a623]/60 transition-colors w-48"
          />
        </div>
        <div className="border border-[#f5a623]/20 rounded-lg overflow-hidden">
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-[#0d1117] z-10">
                <tr className="border-b border-[#f5a623]/20">
                  <th className="text-left px-4 py-3 text-[#f5a623]/70 font-mono text-xs tracking-widest uppercase w-6">Status</th>
                  <th className="text-left px-4 py-3 text-[#f5a623]/70 font-mono text-xs tracking-widest uppercase">Prompt</th>
                  <th className="text-left px-4 py-3 text-[#f5a623]/70 font-mono text-xs tracking-widest uppercase hidden md:table-cell">Filename</th>
                  <th className="text-left px-4 py-3 text-[#f5a623]/70 font-mono text-xs tracking-widest uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(prompt => {
                  const exists = existingSet.has(prompt.filename);
                  const isGen = generating === prompt.filename && generateMutation.isPending;
                  const currentText = editingText[prompt.filename] ?? prompt.text;
                  return (
                    <tr key={prompt.filename} data-testid={`row-prompt-${prompt.filename}`} className="border-t border-[#4caf82]/10 hover:bg-[#4caf82]/5 transition-colors">
                      <td className="px-4 py-3">
                        {isGen ? (
                          <Loader2 size={14} className="text-[#f5a623] animate-spin" />
                        ) : exists ? (
                          <CheckCircle size={14} className="text-[#4caf82]" />
                        ) : (
                          <AlertCircle size={14} className="text-[#4caf82]/30" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-white font-mono text-xs font-semibold mb-1">{prompt.label}</div>
                        <input
                          data-testid={`input-text-${prompt.filename}`}
                          type="text"
                          value={currentText}
                          onChange={e => setEditingText(prev => ({ ...prev, [prompt.filename]: e.target.value }))}
                          className="w-full bg-black/30 border border-[#4caf82]/20 rounded px-2 py-1 text-[#4caf82]/80 font-mono text-xs placeholder-[#4caf82]/30 focus:outline-none focus:border-[#f5a623]/40 transition-colors"
                        />
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-[#4caf82]/40 font-mono text-xs">{prompt.filename}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            data-testid={`btn-generate-${prompt.filename}`}
                            onClick={() => handleGenerate(prompt.filename, currentText)}
                            disabled={generateMutation.isPending || !currentText.trim()}
                            title={exists ? "Regenerate" : "Generate"}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded font-mono text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${exists ? "border border-[#f5a623]/40 bg-[#f5a623]/10 hover:bg-[#f5a623]/20 text-[#f5a623]" : "border border-[#4caf82]/30 bg-[#4caf82]/10 hover:bg-[#4caf82]/20 text-[#4caf82]"}`}
                          >
                            {isGen ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
                            {exists ? "Regen" : "Gen"}
                          </button>
                          {exists && (
                            <>
                              <AudioPlayer src={`/uploads/${prompt.filename}`} />
                              <button
                                data-testid={`btn-delete-prompt-${prompt.filename}`}
                                onClick={() => { if (confirm(`Delete ${prompt.filename}?`)) deleteMutation.mutate(prompt.filename); }}
                                disabled={deleteMutation.isPending}
                                className="text-red-400/50 hover:text-red-400 transition-colors disabled:opacity-30"
                              >
                                <Trash2 size={12} />
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
    </div>
  );
}

function DashboardTab() {
  const { data: stats } = useQuery<{ users: number; profiles: number; messages: number; activeCalls: number }>({
    queryKey: ["/api/stats"],
    refetchInterval: 5000,
  });

  const items = [
    { label: "Live on the Line", value: stats?.activeCalls ?? 0, color: "text-[#4caf82]" },
    { label: "Registered Users", value: stats?.users ?? 0, color: "text-[#f5a623]" },
    { label: "Voice Profiles", value: stats?.profiles ?? 0, color: "text-[#4caf82]" },
    { label: "Messages Relayed", value: stats?.messages ?? 0, color: "text-[#f5a623]" },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-[#f5a623] font-mono text-lg font-bold tracking-widest uppercase">System Status_</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map(item => (
          <div key={item.label} className="border border-[#f5a623]/20 rounded-lg p-4 bg-black/30">
            <div className={`font-mono text-3xl font-bold ${item.color}`}>{String(item.value).padStart(4, "0")}</div>
            <div className="text-[#4caf82]/50 font-mono text-xs tracking-widest uppercase mt-1">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-[#4caf82]/30 font-mono text-xs tracking-widest uppercase">{label} — Coming Soon_</div>
    </div>
  );
}

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={14} /> },
  { id: "voice-profiles", label: "Voice Profiles", icon: <Phone size={14} /> },
  { id: "regions", label: "Regions", icon: <Globe size={14} /> },
  { id: "audio-gen", label: "Audio Gen", icon: <Volume2 size={14} /> },
  { id: "messages", label: "Messages", icon: <MessageSquare size={14} /> },
  { id: "phone-testing", label: "Phone Testing", icon: <PhoneCall size={14} /> },
];

export default function Admin() {
  const [activeTab, setActiveTab] = useState<Tab>("voice-profiles");

  return (
    <div className="min-h-screen bg-[#0a0e14] text-[#4caf82]">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="font-mono text-2xl font-bold tracking-widest uppercase text-white">Admin Dashboard_</h1>
          <Link href="/" className="text-[#4caf82]/50 hover:text-[#f5a623] font-mono text-xs tracking-widest uppercase transition-colors">← Back to Main</Link>
        </div>
        <div className="flex gap-2 flex-wrap">
          {tabs.map(tab => (
            <button
              key={tab.id}
              data-testid={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded border font-mono text-xs tracking-widest uppercase transition-colors ${activeTab === tab.id ? "border-[#f5a623] bg-[#f5a623]/10 text-[#f5a623]" : "border-[#4caf82]/20 text-[#4caf82]/60 hover:border-[#4caf82]/40 hover:text-[#4caf82]"}`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
        <div className="bg-[#0d1117] border border-[#f5a623]/15 rounded-xl p-6">
          {activeTab === "dashboard" && <DashboardTab />}
          {activeTab === "voice-profiles" && <VoiceProfilesTab />}
          {activeTab === "regions" && <RegionsTab />}
          {activeTab === "audio-gen" && <TTSTab />}
          {activeTab === "messages" && <PlaceholderTab label="Messages" />}
          {activeTab === "phone-testing" && <PlaceholderTab label="Phone Testing" />}
        </div>
      </div>
    </div>
  );
}
