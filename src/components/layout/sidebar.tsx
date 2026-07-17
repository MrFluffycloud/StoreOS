"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  History,
  Truck,
  CreditCard,
  UserCheck,
  BarChart3,
  Settings,
  Sparkles,
  ShoppingBag,
  RotateCcw,
} from "lucide-react";
import { useAuth, hasPermission } from "./app-layout";
import { useQuery } from "@tanstack/react-query";
import { getSettings, getAppVersion } from "@/lib/ipc";
import { Logo } from "@/components/ui/logo";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Sales (POS)", href: "/sales", icon: ShoppingCart },
  { label: "Purchases", href: "/purchases", icon: ShoppingBag },
  { label: "Returns", href: "/returns", icon: RotateCcw },
  { label: "Products", href: "/products", icon: Package },
  { label: "Inventory", href: "/inventory", icon: History },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Finance", href: "/finance", icon: CreditCard },
  { label: "HR & Payroll", href: "/hr", icon: UserCheck },
  { label: "AI Advisor", href: "/ai-advisor", icon: Sparkles },
  { label: "Suppliers", href: "/suppliers", icon: Truck },
  { label: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { session } = useAuth();

  const role = session?.role || "Admin";
  const username = session?.username || "Admin";

  const { data: dbSettings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const isPremium = dbSettings.find(s => s.key === "license_key")?.value ? true : false;

  const { data: appVersion = "0.1.4" } = useQuery({
    queryKey: ["appVersion"],
    queryFn: getAppVersion,
  });

  // Filter navigation links dynamically based on the user's role permissions
  const allowedItems = navItems.filter((item) => hasPermission(role, item.href));

  return (
    <aside className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col h-screen select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-sidebar-border gap-2.5">
        <Logo className="w-7 h-7 flex-shrink-0" />
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sidebar-foreground text-sm tracking-tight leading-none">StoreOS</span>
            {isPremium && (
              <span className="inline-flex items-center text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider bg-amber-500/15 text-amber-500 border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.15)] animate-pulse">
                PRO
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground mt-0.5 font-mono">v{appVersion}</span>
        </div>
      </div>

      {/* Nav List */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {allowedItems.map((item) => {
          const isActive = pathname === item.href || (pathname === "/" && item.href === "/dashboard");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="w-4.5 h-4.5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border bg-sidebar/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center font-bold text-sm text-primary-foreground">
            {username.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-sidebar-foreground leading-none">{username}</span>
            <span className="text-[10px] text-muted-foreground capitalize mt-1 leading-none">{role} Session</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
