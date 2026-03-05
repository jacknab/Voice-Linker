import { ReactNode } from "react";
import { motion } from "framer-motion";

interface FeatureCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  index: number;
}

export function FeatureCard({ title, description, icon, index }: FeatureCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: 0.6 + (index * 0.1) }}
      className="
        flex items-start gap-4 p-5 rounded-md
        border border-border/50 bg-secondary/30
        hover:bg-secondary/50 hover:border-primary/30
        transition-all duration-300
      "
    >
      <div className="mt-1 p-2 rounded bg-background border border-border text-primary shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="text-lg font-display text-primary/90 mb-1 uppercase tracking-wide">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>
    </motion.div>
  );
}
