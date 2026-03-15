import { ReactNode } from "react";
import { motion } from "framer-motion";

interface StatPanelProps {
  label: string;
  value: number | string;
  icon: ReactNode;
  delay?: number;
  highlight?: boolean;
}

export function StatPanel({ label, value, icon, delay = 0, highlight = false }: StatPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      className={`
        relative overflow-hidden
        border rounded-md p-6
        flex flex-col items-center justify-center text-center
        glow-box glow-box-hover transition-all duration-300
        group
        ${highlight
          ? "bg-green-950/30 border-green-500/40"
          : "bg-card border-border"
        }
      `}
    >
      {/* Hardware screws */}
      <div className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-border" />
      <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-border" />
      <div className="absolute bottom-2 left-2 w-1.5 h-1.5 rounded-full bg-border" />
      <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-border" />

      {/* Live pulse badge */}
      {highlight && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[9px] tracking-[0.25em] text-green-400 uppercase font-display">Live</span>
        </div>
      )}

      <div className={`mb-4 transition-colors duration-300 ${
        highlight
          ? "text-green-400 group-hover:text-green-300"
          : "text-muted-foreground group-hover:text-primary"
      }`}>
        {icon}
      </div>

      <div className={`text-4xl md:text-5xl font-display tracking-wider mb-2 ${
        highlight ? "text-green-400" : "text-primary glow-text"
      }`}>
        {value.toString().padStart(4, '0')}
      </div>

      <div className="text-xs tracking-[0.2em] text-muted-foreground uppercase">
        {label}
      </div>
    </motion.div>
  );
}
