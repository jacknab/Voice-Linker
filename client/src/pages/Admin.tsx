import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Upload, Trash2, Play, Pause, Plus, Phone, LayoutDashboard,
  MessageSquare, PhoneCall, X, MapPin, Clock, Copy, Eye, EyeOff,
  Pencil, Globe,
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

type Tab = "dashboard" | "voice-profiles" | "regions" | "messages" | "phone-testing";

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
          {activeTab === "messages" && <PlaceholderTab label="Messages" />}
          {activeTab === "phone-testing" && <PlaceholderTab label="Phone Testing" />}
        </div>
      </div>
    </div>
  );
}
