import React from "react";

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Outer border using theme's primary accent */}
      <rect x="3" y="3" width="18" height="18" rx="4.5" className="stroke-primary" strokeWidth="2" />
      {/* Grid divisions in muted colors */}
      <path d="M21 9H3" className="stroke-muted-foreground/30" strokeWidth="1.5" />
      <path d="M21 15H3" className="stroke-muted-foreground/30" strokeWidth="1.5" />
      <path d="M9 3v18" className="stroke-muted-foreground/30" strokeWidth="1.5" />
      <path d="M15 3v18" className="stroke-muted-foreground/30" strokeWidth="1.5" />
      {/* Stylized accent nodes mapped to active color theme */}
      <circle cx="9" cy="9" r="1.5" className="fill-primary stroke-primary" />
      <circle cx="15" cy="15" r="1.5" className="fill-primary stroke-primary" />
    </svg>
  );
}
