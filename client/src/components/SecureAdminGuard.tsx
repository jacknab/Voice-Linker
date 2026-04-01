import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import SecureAdminLogin from "@/pages/SecureAdminLogin";
import Admin from "@/pages/Admin";

export default function SecureAdminGuard() {
  const [, setLocation] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    // Check if user has the admin authentication flag
    const authStatus = sessionStorage.getItem('adminAuthenticated');
    setIsAuthenticated(authStatus === 'true');
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem('adminAuthenticated');
    setIsAuthenticated(false);
    setLocation("/admin/login");
  };

  if (isAuthenticated === null) {
    // Loading state
    return (
      <div style={{ 
        minHeight: "100vh", 
        background: "#0a0a0a", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center" 
      }}>
        <div style={{ color: "#666", fontFamily: "monospace" }}>Checking authentication...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <SecureAdminLogin />;
  }

  return <Admin onLogout={handleLogout} />;
}
