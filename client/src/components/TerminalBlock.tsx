import { useState } from "react";
import { Copy, Check, Terminal } from "lucide-react";
import { motion } from "framer-motion";

interface TerminalBlockProps {
  title: string;
  content: string;
  delay?: number;
}

export function TerminalBlock({ title, content, delay = 0 }: TerminalBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay }}
      className="rounded-md border border-border bg-[#050505] overflow-hidden"
    >
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-secondary border-b border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-widest font-display">
          <Terminal className="w-4 h-4" />
          <span>{title}</span>
        </div>
        <button
          onClick={handleCopy}
          className="p-1.5 rounded hover:bg-white/5 text-muted-foreground hover:text-primary transition-colors"
          title="Copy to clipboard"
        >
          {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      
      {/* Terminal Content */}
      <div className="p-4 overflow-x-auto">
        <code className="text-sm md:text-base text-primary/90 whitespace-pre">
          {content}
        </code>
      </div>
    </motion.div>
  );
}
