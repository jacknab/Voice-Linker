import { Link, useLocation } from "wouter";
import { Phone, LogOut, Loader2, User } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_SITE_NAME = "Phone Booth";

interface WebUser {
  id: string;
  email: string;
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: siteData } = useQuery<{ siteName: string }>({
    queryKey: ["/api/site-settings"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const siteName = siteData?.siteName || DEFAULT_SITE_NAME;

  const { data: me, isLoading } = useQuery<WebUser>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout", {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/login");
    },
    onError: () => {
      toast({ title: "Logout failed", description: "Please try again.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#0d0d0d", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={32} color="#1d4ed8" className="animate-spin" />
      </div>
    );
  }

  if (!me) {
    setLocation("/login");
    return null;
  }

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#0d0d0d", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <nav style={{ background: "#000", borderBottom: "1px solid #1a1a1a" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: "64px" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}>
            <div style={{ width: 36, height: 36, background: "#1d4ed8", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Phone size={16} color="#fff" />
            </div>
            <span style={{ fontSize: "1rem", fontWeight: 800, color: "#fff" }}>{siteName}</span>
          </Link>

          <button
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            data-testid="button-logout"
            style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "none", border: "1px solid #333", borderRadius: "8px", color: "#ccc", cursor: "pointer", fontSize: "0.85rem", padding: "0.45rem 0.875rem", transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#555"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#333"; e.currentTarget.style.color = "#ccc"; }}
          >
            {logoutMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
            Sign out
          </button>
        </div>
      </nav>

      <div style={{ flex: 1, maxWidth: "1200px", margin: "0 auto", padding: "3rem 1.5rem", width: "100%" }}>
        <div style={{ background: "#111", border: "1px solid #222", borderRadius: "16px", padding: "2rem 2rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ width: 48, height: 48, background: "#1d4ed8", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <User size={22} color="#fff" />
          </div>
          <div>
            <p style={{ color: "#888", fontSize: "0.78rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.2rem" }}>Signed in as</p>
            <p style={{ color: "#fff", fontSize: "1rem", fontWeight: 700 }} data-testid="text-user-email">{me.email}</p>
          </div>
        </div>

        <div style={{ color: "#888", fontSize: "0.9rem", textAlign: "center", marginTop: "4rem" }}>
          Your account dashboard will appear here.
        </div>
      </div>
    </div>
  );
}
