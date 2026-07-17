"use client";

import React, { useState, useEffect, createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";
import { CommandPalette } from "@/components/ui/command-palette";
import { getSettings, isTauri, getSystemHealth, checkForUpdateInfo, installAndRestartUpdate } from "@/lib/ipc";
import { startBackgroundSyncEngine, stopBackgroundSyncEngine } from "@/lib/syncEngine";
import LoginScreen from "@/components/features/auth/login-screen";
import OnboardingWizard from "@/components/features/onboarding/onboarding-wizard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ShieldAlert, ArrowUpCircle, Download, RefreshCw } from "lucide-react";

export interface UserSession {
  username: string;
  role: string;
}

// React context to share active session and logout callbacks
export const AuthContext = createContext<{
  session: UserSession | null;
  logout: () => void;
} | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Centralized role-based access controller mapping paths to roles
export const hasPermission = (role: string, path: string): boolean => {
  if (role === "Admin") return true;
  
  if (role === "Cashier") {
    // Cashiers only have access to POS sales, product list, inventory list, returns and dashboard
    return ["/dashboard", "/sales", "/products", "/inventory", "/returns"].includes(path);
  }
  
  if (role === "Auditor") {
    // Auditors only have access to overview analytics, stock tracking, suppliers, purchases, returns, reports, and finance ledger
    return ["/dashboard", "/products", "/inventory", "/suppliers", "/purchases", "/returns", "/reports", "/finance"].includes(path);
  }
  
  return false;
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [session, setSession] = useState<UserSession | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  const { data: dbSettings = [], refetch } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const isOnboarded = dbSettings.find((s) => s.key === "onboarded")?.value === "true";

  // Updater Modal States
  const [updateAlertOpen, setUpdateAlertOpen] = useState(false);
  const [isMandatoryUpdate, setIsMandatoryUpdate] = useState(false);
  const [pendingVersion, setPendingVersion] = useState("");
  const [updateReleaseNotes, setUpdateReleaseNotes] = useState("");
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);

  const checkVersionUpdate = async () => {
    try {
      const healthInfo = await getSystemHealth();
      const currentVersion = healthInfo.app_version;
      const update = await checkForUpdateInfo();
      if (update && update.available) {
        const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number);
        const [currMajor] = parse(currentVersion);
        const [lateMajor] = parse(update.version);

        setPendingVersion(update.version);
        setUpdateReleaseNotes(update.body || "");
        
        if (lateMajor > currMajor) {
          setIsMandatoryUpdate(true);
          setUpdateAlertOpen(true);
        } else {
          const key = `postponed_update_${update.version}`;
          const postponed = sessionStorage.getItem(key);
          if (!postponed) {
            setIsMandatoryUpdate(false);
            setUpdateAlertOpen(true);
          }
        }
      }
    } catch (err) {
      console.warn("Silent background update check skipped:", err);
    }
  };

  useEffect(() => {
    if (session) {
      checkVersionUpdate();
    }
  }, [session]);


  // Force Tauri window size constraints based on login session state
  useEffect(() => {
    const adjustWindow = async () => {
      const isTauriActive = isTauri();
      if (!isTauriActive) return;

      try {
        if (!session) {
          await invoke("resize_to_login");
        } else if (isOnboarded) {
          await invoke("resize_to_app");
        }
      } catch (e) {
        console.error("Failed to resize Tauri window", e);
      }
    };
    adjustWindow();
  }, [session, isOnboarded]);

  // Start cloud sync background daemon only when sync is enabled
  const syncEnabled = dbSettings.find((s) => s.key === "supabase_sync_enabled")?.value === "true";
  useEffect(() => {
    if (session && syncEnabled) {
      startBackgroundSyncEngine();
    } else {
      stopBackgroundSyncEngine();
    }
    return () => {
      stopBackgroundSyncEngine();
    };
  }, [session, syncEnabled]);

  // Global keyboard shortcuts (Ctrl+N, Ctrl+P)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!session) return;

      // Ctrl + N -> New Sale (POS)
      if (e.key === "n" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (hasPermission(session.role, "/sales")) {
          router.push("/sales");
        }
      }

      // Ctrl + P -> New Product (triggers dialog on products page)
      if (e.key === "p" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (hasPermission(session.role, "/products")) {
          router.push("/products?action=new");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [session, router]);

  const handleLogout = async () => {
    setSession(null);
    const isTauriActive = isTauri();
    if (isTauriActive) {
      try {
        await invoke("resize_to_login");
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Case 1: Not onboarded yet -> show onboarding wizard first
  if (!isOnboarded) {
    return <OnboardingWizard onComplete={() => refetch()} />;
  }

  // Case 2: Onboarded but not authenticated -> show login screen
  if (!session) {
    return <LoginScreen onLoginSuccess={(sess) => setSession(sess)} />;
  }

  // Case 3: Check permission for active route
  const isRouteAllowed = hasPermission(session.role, pathname);

  return (
    <AuthContext.Provider value={{ session, logout: handleLogout }}>
      <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
        {/* Sidebar Navigation */}
        <Sidebar />

        {/* Main Layout Area */}
        <div className="flex-1 flex flex-col overflow-hidden h-full">
          {/* Top Header Bar */}
          <Topbar 
            onSearchClick={() => setSearchOpen(true)} 
            currentUser={session.username} 
            currentRole={session.role}
            onLogout={handleLogout}
          />

          {/* Dynamic Page Content */}
          <main className="flex-1 overflow-hidden h-full">
            {isRouteAllowed ? (
              children
            ) : (
              <AccessDenied role={session.role} />
            )}
          </main>
        </div>

        {/* Command Palette Modal */}
        <CommandPalette open={searchOpen} setOpen={setSearchOpen} />

        {/* Update Dialog Modal */}
        <Dialog open={updateAlertOpen} onOpenChange={(open) => {
          if (!isMandatoryUpdate) {
            setUpdateAlertOpen(open);
          }
        }}>
          <DialogContent 
            className="sm:max-w-[400px] bg-card border-border select-none text-xs"
            {... (isMandatoryUpdate ? { 
              onPointerDownOutside: (e: any) => e.preventDefault(),
              onInteractOutside: (e: any) => e.preventDefault(),
              onEscapeKeyDown: (e: any) => e.preventDefault()
            } : {})}
          >
            <DialogHeader className="border-b border-border/80 pb-2.5">
              <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <ArrowUpCircle className="w-4 h-4 text-violet-500" />
                {isMandatoryUpdate ? "Mandatory Update Required" : "Update Available"}
              </DialogTitle>
              <DialogDescription className="text-[11px] text-muted-foreground pt-1 leading-normal">
                {isMandatoryUpdate 
                  ? `A critical major update (v${pendingVersion}) has been released. You must update to continue using StoreOS.`
                  : `A new version (v${pendingVersion}) of StoreOS is available. Would you like to update now?`
                }
              </DialogDescription>
            </DialogHeader>

            {updateReleaseNotes && (
              <div className="space-y-1.5 pt-3">
                <div className="font-semibold text-foreground">Release Notes:</div>
                <div className="bg-muted/40 p-2.5 rounded-lg border border-border/60 max-h-[120px] overflow-y-auto font-mono text-[10px] leading-relaxed text-muted-foreground whitespace-pre-wrap">
                  {updateReleaseNotes}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t border-border/40 mt-4">
              {!isMandatoryUpdate && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    sessionStorage.setItem(`postponed_update_${pendingVersion}`, "true");
                    setUpdateAlertOpen(false);
                  }}
                  disabled={isDownloadingUpdate}
                  className="h-8 text-xs"
                >
                  Remind Me Later
                </Button>
              )}
              <Button
                type="button"
                onClick={async () => {
                  setIsDownloadingUpdate(true);
                  try {
                    await installAndRestartUpdate();
                  } catch (err) {
                    alert("Failed to install update: " + err);
                  } finally {
                    setIsDownloadingUpdate(false);
                  }
                }}
                disabled={isDownloadingUpdate}
                className="h-8 text-xs bg-violet-600 hover:bg-violet-500 text-white font-semibold flex items-center gap-1.5"
              >
                {isDownloadingUpdate ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Download className="w-3 h-3" />
                    Update Now
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AuthContext.Provider>
  );
}

function AccessDenied({ role }: { role: string }) {
  const router = useRouter();

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-background h-full select-none font-sans">
      <Card className="max-w-md w-full border border-destructive/20 bg-destructive/5 shadow-md p-6 text-center">
        <div className="mx-auto w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center mb-4 border border-destructive/20 animate-pulse">
          <ShieldAlert className="w-6 h-6 text-destructive" />
        </div>
        <h2 className="text-sm font-bold text-foreground tracking-tight">Access Restricted</h2>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
          Your role (<span className="font-semibold text-foreground capitalize">{role}</span>) does not have authorization to view this administrative module.
        </p>
        <div className="mt-6">
          <Button
            onClick={() => router.push("/dashboard")}
            className="h-8.5 text-xs font-semibold bg-destructive hover:bg-destructive/90 text-white px-4"
          >
            Return to Dashboard
          </Button>
        </div>
      </Card>
    </div>
  );
}
