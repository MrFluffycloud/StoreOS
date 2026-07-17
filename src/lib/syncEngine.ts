import { getSetting, setSetting, syncDatabase } from "./ipc";
import { toast } from "sonner";

let syncTimer: any = null;
let isSyncing = false;
let hasActiveSyncError = false;

/**
 * Triggers a sync iteration. Delegates the query and REST network calls entirely to
 * the compiled Rust Tauri command for security.
 */
export async function performDatabaseSync() {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const enabled = await getSetting("supabase_sync_enabled");
    if (enabled !== "true") {
      isSyncing = false;
      return;
    }

    // Verify online status before triggering Rust sync
    if (!navigator.onLine) {
      await setSetting("sync_status", "Offline - Sync Pending");
      isSyncing = false;
      return;
    }

    await syncDatabase();

    // If we successfully sync and had a previous active sync error, show a recovery toast
    if (hasActiveSyncError) {
      toast.success("Cloud Sync Resumed", {
        description: "Successfully reconnected and synchronized with the cloud database.",
        id: "sync-status-toast",
      });
      hasActiveSyncError = false;
    }
  } catch (err: any) {
    console.warn("Cloud Sync background worker failed (network drop or host offline):", err);
    // Only alert on initial transition to error state to avoid spamming the user
    if (!hasActiveSyncError) {
      toast.error("Cloud Sync Failed", {
        description: "Could not connect to the cloud database. Retrying in background...",
        id: "sync-status-toast",
      });
      hasActiveSyncError = true;
    }
  } finally {
    isSyncing = false;
  }
}


/**
 * Registers the background sync loop daemon process.
 * Runs every 7 seconds, adjusting for network presence.
 */
export function startBackgroundSyncEngine() {
  if (syncTimer) return;
  
  // Run immediately on startup
  performDatabaseSync();

  // Run loop every 7 seconds
  syncTimer = setInterval(() => {
    performDatabaseSync();
  }, 7000);

  // Bind online/offline window listeners for instant sync triggers when connectivity resumes
  if (typeof window !== "undefined") {
    window.addEventListener("online", performDatabaseSync);
  }
}

/**
 * Disposes the active sync timer.
 */
export function stopBackgroundSyncEngine() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  if (typeof window !== "undefined") {
    window.removeEventListener("online", performDatabaseSync);
  }
}
