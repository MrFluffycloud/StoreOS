"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface StoreOSGaugeChartProps {
  value: number; // 0 to 100
  title?: string;
  subtitle?: string;
  className?: string;
  height?: number;
  thresholds?: {
    low: number;
    medium: number;
  };
}

export const StoreOSGaugeChart = React.memo(function StoreOSGaugeChart({
  value,
  title = "Health Metric",
  subtitle,
  className,
  height = 190,
  thresholds = { low: 30, medium: 70 },
}: StoreOSGaugeChartProps) {
  const clampedValue = Math.min(100, Math.max(0, value));
  
  // Calculate gauge arc SVG path parameters
  const radius = 72;
  const strokeWidth = 16;
  const center = 90;
  const circumference = Math.PI * radius; // Half circumference
  const strokeDashoffset = circumference - (clampedValue / 100) * circumference;

  // Determine color based on threshold
  let strokeColor = "hsl(var(--primary))";
  let badgeColor = "bg-primary/15 text-primary border-primary/30 font-bold";
  let statusText = "Optimal";

  if (clampedValue < thresholds.low) {
    strokeColor = "rgb(244, 63, 94)"; // rose-500
    badgeColor = "bg-rose-500/15 text-rose-500 border-rose-500/30 font-bold";
    statusText = "Critical";
  } else if (clampedValue < thresholds.medium) {
    strokeColor = "rgb(245, 158, 11)"; // amber-500
    badgeColor = "bg-amber-500/15 text-amber-500 border-amber-500/30 font-bold";
    statusText = "Moderate";
  } else {
    strokeColor = "rgb(16, 185, 129)"; // emerald-500
    badgeColor = "bg-emerald-500/15 text-emerald-500 border-emerald-500/30 font-bold";
    statusText = "Healthy";
  }

  return (
    <div className={cn("flex flex-col items-center justify-center p-5 rounded-2xl border border-border/60 bg-card shadow-xs", className)}>
      <div className="relative flex items-center justify-center" style={{ width: "200px", height: `${height}px` }}>
        <svg viewBox="0 0 180 110" className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={0.75} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={1} />
            </linearGradient>
          </defs>
          {/* Background Arc */}
          <path
            d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Value Arc */}
          <path
            d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        {/* Center Display */}
        <div className="absolute bottom-3 flex flex-col items-center text-center">
          <span className="text-3xl font-black tracking-tight text-foreground font-mono">
            {Math.round(clampedValue)}%
          </span>
          <span className={cn("text-[11px] font-bold uppercase px-2.5 py-0.5 rounded-full border mt-1 tracking-wider", badgeColor)}>
            {statusText}
          </span>
        </div>
      </div>

      <div className="mt-3 text-center">
        <h4 className="text-xs font-bold text-foreground tracking-tight">{title}</h4>
        {subtitle && <p className="text-xs text-muted-foreground font-medium mt-0.5 max-w-[200px] leading-tight">{subtitle}</p>}
      </div>
    </div>
  );
});
