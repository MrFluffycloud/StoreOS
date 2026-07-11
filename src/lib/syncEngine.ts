import { getSetting, setSetting, syncDatabase } from "./ipc";

let syncTimer: any = null;
let isSyncing = false;

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
  } catch (err) {
    console.error("Cloud Sync background worker failed:", err);
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
