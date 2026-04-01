import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Admin from "@/pages/Admin";
import AdminLogin from "@/pages/AdminLogin";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Dashboard from "@/pages/Dashboard";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

function AdminGuard() {
  const [, setLocation] = useLocation();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["/api/admin/me"],
    queryFn: () =>
      fetch("/api/admin/me").then(r => {
        if (!r.ok) throw new Error("Unauthenticated");
        return r.json();
      }),
    retry: false,
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (!isLoading && (isError || !data)) {
      setLocation("/admin/login");
    }
  }, [isLoading, isError, data, setLocation]);

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={20} color="#555" className="animate-spin" />
      </div>
    );
  }

  if (!data || isError) return null;

  return <Admin />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/setup" component={Home} />
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin" component={AdminGuard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
