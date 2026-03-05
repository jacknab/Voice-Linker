import { ReactNode } from "react";
import { motion } from "framer-motion";

interface StatPanelProps {
  label: string;
  value: number | string;
  icon: ReactNode;
  delay?: number;
}

export function StatPanel({ label, value, icon, delay = 0 }: StatPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      className="
        relative overflow-hidden
        bg-card border border-border rounded-md p-6
        flex flex-col items-center justify-center text-center
        glow-box glow-box-hover transition-all duration-300
        group
      "
    >
      {/* Hardware screws decorative elements */}
      <div className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-border" />
      <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-border" />
      <div className="absolute bottom-2 left-2 w-1.5 h-1.5 rounded-full bg-border" />
      <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-border" />

      <div className="mb-4 text-muted-foreground group-hover:text-primary transition-colors duration-300">
        {icon}
      </div>
      
      <div className="text-4xl md:text-5xl font-display text-primary glow-text tracking-wider mb-2">
        {value.toString().padStart(4, '0')}
      </div>
      
      <div className="text-xs tracking-[0.2em] text-muted-foreground uppercase">
        {label}
      </div>
    </motion.div>
  );
}
