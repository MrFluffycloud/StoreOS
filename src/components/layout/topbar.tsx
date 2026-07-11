"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Sun,
  Moon,
  Search,
  Bell,
  Database,
  LogOut,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";
import { getSettings, syncDatabase } from "@/lib/ipc";
import { performDatabaseSync } from "@/lib/syncEngine";

interface TopbarProps {
  onSearchClick: () => void;
  currentUser?: string;
  currentRole?: string;
  onLogout?: () => void;
}

export default function Topbar({ onSearchClick, currentUser, currentRole, onLogout }: TopbarProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const queryClient = useQueryClient();

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      setIsOnline(navigator.onLine);
      const goOnline = () => setIsOnline(true);
      const goOffline = () => setIsOnline(false);
      window.addEventListener("online", goOnline);
      window.addEventListener("offline", goOffline);
      return () => {
        window.removeEventListener("online", goOnline);
        window.removeEventListener("offline", goOffline);
      };
    }
  }, []);

  const { data: dbSettings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const syncEnabled = dbSettings.find((s) => s.key === "supabase_sync_enabled")?.value === "true";
  const syncStatus = dbSettings.find((s) => s.key === "sync_status")?.value || "Synced";
  const lastSyncTime = dbSettings.find((s) => s.key === "last_sync_time")?.value || "Never";

  const syncMutation = useMutation({
    mutationFn: async () => {
      await performDatabaseSync();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  const formatLastSync = (timestamp: string) => {
    if (timestamp === "Never") return "Never";
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return timestamp;
    }
  };

  const isSyncing = syncStatus === "Syncing" || syncMutation.isPending;

  return (
    <header className="h-16 border-b border-border bg-card px-6 flex items-center justify-between select-none">
      {/* Global Search Button */}
      <button
        onClick={onSearchClick}
        className="flex items-center gap-2.5 px-3 py-1.5 w-80 text-left text-xs text-muted-foreground bg-muted hover:bg-muted/80 rounded-lg border border-border transition-all duration-200"
      >
        <Search className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="flex-1">Search StoreOS...</span>
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100 shadow-sm">
          <span className="text-xs">Ctrl</span>K
        </kbd>
      </button>

      {/* Action group */}
      <div className="flex items-center gap-3">
        {/* Internet Connection Status Marker */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono font-medium transition-all ${
            isOnline
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
              : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 animate-pulse"
          }`}
          title={isOnline ? "Connected to Internet" : "No Internet Connection"}
        >
          {isOnline ? (
            <>
              <Wifi className="w-3 h-3 text-emerald-500" />
              <span>Online</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3 h-3 text-rose-500" />
              <span>Offline</span>
            </>
          )}
        </div>

        {/* Sync Trigger / Indicator — only shown when Cloud Sync is enabled */}
        {syncEnabled && (
          <button
            onClick={() => {
              if (!isSyncing && isOnline) {
                syncMutation.mutate();
              }
            }}
            disabled={isSyncing || !isOnline}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono font-medium transition-all ${
              isSyncing
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                : !isOnline
                ? "bg-zinc-500/10 text-zinc-500 border-zinc-500/10 opacity-50 cursor-not-allowed"
                : "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20 hover:bg-sky-500/20"
            }`}
            title={!isOnline ? "Sync disabled (Offline)" : `Last Sync: ${formatLastSync(lastSyncTime)}`}
          >
            {isSyncing ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <Database className="w-3 h-3" />
            )}
            <span>{isSyncing ? "Syncing..." : "Cloud Synced"}</span>
          </button>
        )}

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="w-9 h-9 text-muted-foreground rounded-lg">
          <Bell className="w-4 h-4" />
        </Button>

        {/* Dark Mode Toggle */}
        {mounted && (
          <Button
            variant="ghost"
            size="icon"
            className="w-9 h-9 text-muted-foreground rounded-lg animate-fade-in"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        )}

        {/* User Session Info & Log Out */}
        {currentUser && (
          <div className="flex items-center gap-3 pl-3 border-l border-border/80 ml-1">
            <div className="flex flex-col text-right">
              <span className="text-xs font-semibold text-foreground leading-none">{currentUser}</span>
              <span className="text-[9px] text-muted-foreground font-bold tracking-wide uppercase leading-tight mt-1">{currentRole}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="w-8.5 h-8.5 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
              onClick={onLogout}
              title="Log Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
