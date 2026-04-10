import { useState } from "react";
import { useLocation } from "wouter";
import { Shield, Lock, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CORRECT_SEQUENCE = ["7", "7", "6", "4", "OK", "9", "3", "4", "8", "OK"];

export default function SecureAdminLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [inputSequence, setInputSequence] = useState<string[]>([]);
  const [showSequence, setShowSequence] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  const handleNumberPress = (num: string) => {
    const newSequence = [...inputSequence, num];
    setInputSequence(newSequence);

    // Check if sequence matches
    if (newSequence.length === CORRECT_SEQUENCE.length) {
      if (JSON.stringify(newSequence) === JSON.stringify(CORRECT_SEQUENCE)) {
        // Set a simple session flag
        sessionStorage.setItem('adminAuthenticated', 'true');
        setLocation("/admin");
      } else {
        // Wrong sequence - shake and reset
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);
        setInputSequence([]);
        toast({ 
          title: "Access Denied", 
          description: "Incorrect sequence",
          variant: "destructive" 
        });
      }
    }
  };

  const handleClear = () => {
    setInputSequence([]);
  };

  const handleBackspace = () => {
    setInputSequence(prev => prev.slice(0, -1));
  };

  const getDisplayText = () => {
    if (inputSequence.length === 0) return "Enter sequence";
    return inputSequence.join(" ");
  };

  const getProgressPercentage = () => {
    return (inputSequence.length / CORRECT_SEQUENCE.length) * 100;
  };

  return (
    <div style={{ 
      minHeight: "100vh", 
      background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)", 
      display: "flex", 
      alignItems: "center", 
      justifyContent: "center", 
      padding: "1.5rem" 
    }}>
      <div style={{ width: "100%", maxWidth: "400px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "2rem", display: "none" }}>
          <div style={{ 
            width: 80, 
            height: 80, 
            background: "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)", 
            borderRadius: "20px", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center", 
            margin: "0 auto 1.5rem",
            boxShadow: "0 10px 30px rgba(220, 38, 38, 0.3)"
          }}>
            <Shield size={40} color="#fff" />
          </div>
          <h1 style={{ 
            color: "#fff", 
            fontSize: "1.5rem", 
            fontWeight: 700, 
            fontFamily: "monospace", 
            letterSpacing: "0.05em", 
            textTransform: "uppercase", 
            marginBottom: "0.5rem" 
          }}>
            Secure Access
          </h1>
          <p style={{ 
            color: "#666", 
            fontSize: "0.9rem", 
            fontFamily: "monospace" 
          }}>
            Enter authentication sequence
          </p>
        </div>

        {/* Display */}
        <div style={{ 
          background: "#111", 
          border: "2px solid #333", 
          borderRadius: "16px", 
          padding: "1.5rem", 
          marginBottom: "1.5rem",
          position: "relative",
          overflow: "hidden",
          display: "none"
        }}>
          {/* Progress bar */}
          <div style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "3px",
            background: "#333"
          }}>
            <div style={{
              height: "100%",
              width: `${getProgressPercentage()}%`,
              background: "linear-gradient(90deg, #dc2626, #991b1b)",
              transition: "width 0.3s ease"
            }} />
          </div>

          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "0.5rem"
          }}>
            <Lock size={16} color="#666" />
            <button
              onClick={() => setShowSequence(!showSequence)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer"
              }}
            >
              {showSequence ? <EyeOff size={16} color="#666" /> : <Eye size={16} color="#666" />}
            </button>
          </div>

          <div style={{
            color: showSequence ? "#fff" : "#888",
            fontSize: "1.2rem",
            fontFamily: "monospace",
            fontWeight: 600,
            letterSpacing: "0.1em",
            textAlign: "center",
            minHeight: "2rem",
            transition: "color 0.2s",
            ...(isShaking && {
              animation: "shake 0.5s"
            })
          }}>
            {showSequence ? getDisplayText() : inputSequence.map(() => "●").join(" ")}
          </div>

          <div style={{
            color: "#555",
            fontSize: "0.7rem",
            fontFamily: "monospace",
            textAlign: "center",
            marginTop: "0.5rem"
          }}>
            {inputSequence.length} / {CORRECT_SEQUENCE.length} entered
          </div>
        </div>

        {/* Keypad */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "0.75rem",
          marginBottom: "1rem"
        }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button
              key={num}
              onClick={() => handleNumberPress(num.toString())}
              style={{
                background: "#1a1a1a",
                border: "2px solid #333",
                borderRadius: "12px",
                padding: "1.25rem",
                color: "#fff",
                fontSize: "1.5rem",
                fontFamily: "monospace",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
                boxShadow: "0 4px 15px rgba(0, 0, 0, 0.3)"
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = "#dc2626";
                e.currentTarget.style.borderColor = "#991b1b";
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = "#1a1a1a";
                e.currentTarget.style.borderColor = "#333";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              {num}
            </button>
          ))}

          <button
            onClick={handleClear}
            style={{
              background: "#1a1a1a",
              border: "2px solid #333",
              borderRadius: "12px",
              padding: "1.25rem",
              color: "#666",
              fontSize: "0.8rem",
              fontFamily: "monospace",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s"
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "#333";
              e.currentTarget.style.borderColor = "#555";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "#1a1a1a";
              e.currentTarget.style.borderColor = "#333";
            }}
          >
            CLEAR
          </button>

          <button
            onClick={() => handleNumberPress("0")}
            style={{
              background: "#1a1a1a",
              border: "2px solid #333",
              borderRadius: "12px",
              padding: "1.25rem",
              color: "#fff",
              fontSize: "1.5rem",
              fontFamily: "monospace",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s",
              boxShadow: "0 4px 15px rgba(0, 0, 0, 0.3)"
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "#dc2626";
              e.currentTarget.style.borderColor = "#991b1b";
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "#1a1a1a";
              e.currentTarget.style.borderColor = "#333";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            0
          </button>

          <button
            onClick={handleBackspace}
            style={{
              background: "#1a1a1a",
              border: "2px solid #333",
              borderRadius: "12px",
              padding: "1.25rem",
              color: "#666",
              fontSize: "0.8rem",
              fontFamily: "monospace",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s"
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "#333";
              e.currentTarget.style.borderColor = "#555";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "#1a1a1a";
              e.currentTarget.style.borderColor = "#333";
            }}
          >
            ←
          </button>
        </div>

        {/* OK Button */}
        <button
          onClick={() => handleNumberPress("OK")}
          style={{
            width: "100%",
            background: "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)",
            border: "none",
            borderRadius: "12px",
            padding: "1rem",
            color: "#fff",
            fontSize: "1.1rem",
            fontFamily: "monospace",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "all 0.15s",
            boxShadow: "0 6px 20px rgba(220, 38, 38, 0.4)"
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 8px 25px rgba(220, 38, 38, 0.5)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 6px 20px rgba(220, 38, 38, 0.4)";
          }}
        >
          OK
        </button>

        {/* Instructions */}
        <div style={{ 
          marginTop: "2rem", 
          textAlign: "center", 
          color: "#555", 
          fontSize: "0.75rem", 
          fontFamily: "monospace",
          display: "none"
        }}>
          <p>Enter the correct sequence to continue</p>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
      ` }} />
    </div>
  );
}
