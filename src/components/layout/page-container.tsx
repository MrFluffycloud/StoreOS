import { cn } from "@/lib/utils";

interface PageContainerProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export default function PageContainer({
  title,
  subtitle,
  actions,
  children,
  className,
}: PageContainerProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden h-full">
      {/* Page Header */}
      <div className="h-16 px-8 border-b border-border bg-card flex items-center justify-between shrink-0 select-none">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>

      {/* Scrollable Content */}
      <div className={cn("flex-1 overflow-y-auto p-8 bg-background/50", className)}>
        {children}
      </div>
    </div>
  );
}
