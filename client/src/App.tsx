import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Dashboard from "@/pages/Dashboard";
import Membership from "@/pages/Membership";
import MembershipSuccess from "@/pages/MembershipSuccess";
import FAQ from "@/pages/FAQ";
import KeypadTips from "@/pages/KeypadTips";
import Support from "@/pages/Support";
import Cities from "@/pages/Cities";
import SafetyTips from "@/pages/SafetyTips";
import About from "@/pages/About";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import Terms from "@/pages/Terms";
import SecureAdminGuard from "@/components/SecureAdminGuard";
import AdminLogin from "@/pages/AdminLogin";
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
      <Route path="/keypad-tips" component={KeypadTips} />
      <Route path="/support" component={Support} />
      <Route path="/cities" component={Cities} />
      <Route path="/safety-tips" component={SafetyTips} />
      <Route path="/about" component={About} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/terms" component={Terms} />
      <Route path="/setup" component={Home} />
      <Route path="/backstage/login" component={AdminLogin} />
      <Route path="/backstage" component={SecureAdminGuard} />

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
