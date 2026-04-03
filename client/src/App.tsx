import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import AdminLogin from "@/pages/AdminLogin";
import SecureAdminLogin from "@/pages/SecureAdminLogin";
import SecureAdminGuard from "@/components/SecureAdminGuard";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Dashboard from "@/pages/Dashboard";
import Membership from "@/pages/Membership";
import MembershipSuccess from "@/pages/MembershipSuccess";
import FAQ from "@/pages/FAQ";
import { useEffect } from "react";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/membership/success" component={MembershipSuccess} />
      <Route path="/membership" component={Membership} />
      <Route path="/faq" component={FAQ} />
      <Route path="/setup" component={Home} />
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin/secure-login" component={SecureAdminLogin} />
      <Route path="/admin" component={SecureAdminGuard} />
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
