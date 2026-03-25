import { useStats } from "@/hooks/use-stats";
import { StatPanel } from "@/components/StatPanel";
import { TerminalBlock } from "@/components/TerminalBlock";
import { motion } from "framer-motion";
import { 
  Users, 
  Mic, 
  Voicemail, 
  PhoneCall, 
  ServerCrash
} from "lucide-react";
import { useEffect, useState } from "react";

export default function Home() {
  const { data: stats, isLoading, isError } = useStats();
  const [webhookUrl, setWebhookUrl] = useState<string>("https://your-domain.com/voice");

  useEffect(() => {
    // Dynamically set the webhook URL based on the current environment
    if (typeof window !== "undefined") {
      setWebhookUrl(`${window.location.origin}/voice`);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="max-w-6xl mx-auto space-y-16">
        
        {/* Header Section */}
        <header className="flex flex-col items-center justify-center text-center pt-8 pb-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, ease: "backOut" }}
            className="inline-flex items-center justify-center p-3 mb-6 rounded-full border-2 border-primary/20 bg-primary/5 text-primary"
          >
            <PhoneCall className="w-8 h-8 animate-pulse-fast" />
          </motion.div>
          
          <motion.h1 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-4xl md:text-6xl font-display text-primary glow-text mb-4"
          >
            VOICE_PROTOCOL //
          </motion.h1>
          
          <motion.p 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-muted-foreground uppercase tracking-[0.3em] text-sm md:text-base max-w-2xl"
          >
            Automated Telephone Switchboard System
          </motion.p>
        </header>

        {/* Global Stats Section */}
        <section className="space-y-6">
          <div className="flex items-center gap-4 text-primary/80 uppercase tracking-widest text-sm font-display border-b border-border pb-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse-fast" />
            System Status_
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {isLoading ? (
              Array(4).fill(0).map((_, i) => (
                <div key={i} className="h-40 rounded-md bg-secondary/50 border border-border animate-pulse" />
              ))
            ) : isError ? (
              <div className="col-span-4 h-40 rounded-md border border-destructive/50 bg-destructive/10 flex flex-col items-center justify-center text-destructive">
                <ServerCrash className="w-8 h-8 mb-2 opacity-80" />
                <p className="font-display tracking-widest uppercase">System Offline</p>
              </div>
            ) : (
              <>
                <StatPanel
                  label="Live on the Line"
                  value={stats?.activeCalls || 0}
                  icon={<PhoneCall className="w-8 h-8" />}
                  delay={0.4}
                  highlight
                />
                <StatPanel
                  label="Registered Users"
                  value={stats?.users || 0}
                  icon={<Users className="w-8 h-8" />}
                  delay={0.5}
                />
                <StatPanel
                  label="Voice Profiles"
                  value={stats?.profiles || 0}
                  icon={<Mic className="w-8 h-8" />}
                  delay={0.6}
                />
                <StatPanel
                  label="Messages Relayed"
                  value={stats?.messages || 0}
                  icon={<Voicemail className="w-8 h-8" />}
                  delay={0.7}
                />
              </>
            )}
          </div>
        </section>

        {/* Configuration Section */}
        <section className="space-y-6">
          <div className="flex items-center gap-4 text-primary/80 uppercase tracking-widest text-sm font-display border-b border-border pb-2">
            Hardware Setup_
          </div>
            
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.8 }}
              className="prose prose-invert prose-p:text-muted-foreground prose-a:text-primary max-w-none"
            >
              <p>
                To interface with the Voice Protocol backend, you must configure a Twilio phone number to route incoming calls to this node.
              </p>
              
              <div className="my-6">
                <TerminalBlock 
                  title="Twilio Webhook Configuration" 
                  content={webhookUrl}
                  delay={1.0}
                />
              </div>
              
              <div className="space-y-4 text-sm mt-8 p-4 border border-border bg-secondary/20 rounded-md">
                <h4 className="font-display text-primary m-0 uppercase tracking-wider">Initialization Steps:</h4>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground ml-2">
                  <li>Acquire a voice-capable number from Twilio console.</li>
                  <li>Navigate to <strong>Phone Numbers &gt; Manage &gt; Active Numbers</strong>.</li>
                  <li>Select your dedicated number.</li>
                  <li>Locate the <strong>Voice &amp; Fax</strong> routing section.</li>
                  <li>Set "A CALL COMES IN" to <span className="text-primary border border-primary/30 bg-primary/10 px-1 rounded">Webhook</span>.</li>
                  <li>Paste the configuration URL above into the input field.</li>
                  <li>Ensure HTTP method is set to <span className="text-primary border border-primary/30 bg-primary/10 px-1 rounded">POST</span>.</li>
                  <li>Save configuration and dial the number to test connection.</li>
                </ol>
              </div>
            </motion.div>
        </section>

        {/* Footer */}
        <footer className="pt-12 pb-8 text-center text-xs text-muted-foreground/50 uppercase tracking-[0.2em] font-display border-t border-border/30">
          <p>End of Transmission // System Operational</p>
        </footer>

      </div>
    </div>
  );
}
