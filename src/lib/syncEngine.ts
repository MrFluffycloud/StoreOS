import { getSetting, setSetting, getProducts, listInventoryMovements, getSuppliers, getUsers } from "./ipc";

let syncTimer: any = null;
let isSyncing = false;

/**
 * Direct PostgREST upsert helper.
 * Since Supabase has a standard REST API, we can execute upserts by posting arrays of rows
 * with the "Prefer: resolution=merge-duplicates" header to insert/update based on primary keys.
 */
async function upsertToSupabase(url: string, key: string, table: string, rows: any[]) {
  const endpoint = `${url.replace(/\/$/, "")}/rest/v1/${table}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "apikey": key,
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates"
    },
    body: JSON.stringify(rows)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PostgREST upsert failed for table '${table}': ${response.status} - ${errorText}`);
  }
}

/**
 * Verifies license key format and returns generated storeId
 */
export async function verifyLicenseKey(licenseKey: string): Promise<{ success: boolean; storeId?: string; error?: string }> {
  const cleanKey = licenseKey.trim();
  const match = cleanKey.match(/^SOS-\d{4}-\d{4}-\d{4}$/);
  if (!match) {
    return { success: false, error: "Invalid license format. Must match SOS-XXXX-XXXX-XXXX." };
  }
  // Simulate network verification latency
  await new Promise(resolve => setTimeout(resolve, 1200));

  // Generate a premium-looking tenant store ID
  const storeId = `store_${cleanKey.replace(/-/g, "").toLowerCase()}`;
  return { success: true, storeId };
}

/**
 * Triggers a sync iteration. Queries local changes since the last sync timestamp,
 * batches and upserts them to Supabase, and updates status values.
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

    const supabaseUrl = "https://ggyluxjrstdjavyagepq.supabase.co";
    const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdneWx1eGpyc3RkamF2eWFnZXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3NDUyMzIsImV4cCI6MjA5OTMyMTIzMn0.0mePcosWOEDdj_g5W2eZ8BGldv4TCPhYEX5Wlj_ofHM";

    // Verify online status
    if (!navigator.onLine) {
      await setSetting("sync_status", "Offline - Sync Pending");
      isSyncing = false;
      return;
    }

    await setSetting("sync_status", "Syncing");

    const storeId = await getSetting("store_id") || "default_store";
    let lastSyncVal = await getSetting("last_sync_time");
    if (!lastSyncVal || lastSyncVal === "Never" || lastSyncVal.trim() === "") {
      lastSyncVal = "1970-01-01T00:00:00.000Z";
    }
    const lastSyncTime = lastSyncVal;
    const startSyncTime = new Date().toISOString();

    // 1. Fetch products updated/created since last sync
    const products = await getProducts();
    const unsyncedProducts = products.filter(p => !p.updatedAt || !p.createdAt || p.updatedAt > lastSyncTime || p.createdAt > lastSyncTime);

    // 2. Fetch inventory movements updated since last sync
    const movements = await listInventoryMovements();
    const unsyncedMovements = movements.filter(m => !m.timestamp || m.timestamp > lastSyncTime);

    // 3. Fetch suppliers updated since last sync
    const suppliers = await getSuppliers();
    const unsyncedSuppliers = suppliers.filter(s => !s.createdAt || s.createdAt > lastSyncTime);

    // 4. Fetch users updated since last sync
    const users = await getUsers();
    const unsyncedUsers = users.filter(u => !u.createdAt || u.createdAt > lastSyncTime);

    // Perform sequential upserts to Supabase tables
    if (unsyncedProducts.length > 0) {
      await upsertToSupabase(supabaseUrl, supabaseKey, "products", unsyncedProducts.map(p => ({
        id: p.id,
        store_id: storeId,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode || null,
        description: p.description || null,
        price_cents: p.priceCents,
        cost_cents: p.costCents,
        category: p.category || null,
        brand: p.brand || null,
        image_url: p.imageUrl || null,
        created_at: p.createdAt,
        updated_at: p.updatedAt
      })));
    }

    if (unsyncedMovements.length > 0) {
      await upsertToSupabase(supabaseUrl, supabaseKey, "inventory_movements", unsyncedMovements.map(m => ({
        id: m.id,
        store_id: storeId,
        product_id: m.productId,
        quantity: m.quantity,
        movement_type: m.movementType,
        reference_type: m.referenceType || null,
        reference_id: m.referenceId || null,
        employee_id: m.employeeId || null,
        timestamp: m.timestamp
      })));
    }

    if (unsyncedSuppliers.length > 0) {
      await upsertToSupabase(supabaseUrl, supabaseKey, "suppliers", unsyncedSuppliers.map(s => ({
        id: s.id,
        store_id: storeId,
        name: s.name,
        contact_name: s.contactName || null,
        email: s.email || null,
        phone: s.phone || null,
        created_at: s.createdAt
      })));
    }

    if (unsyncedUsers.length > 0) {
      await upsertToSupabase(supabaseUrl, supabaseKey, "users", unsyncedUsers.map(u => ({
        id: u.id,
        store_id: storeId,
        username: u.username,
        pin: u.pin,
        role: u.role,
        created_at: u.createdAt
      })));
    }

    // Save final status states
    await setSetting("last_sync_time", startSyncTime);
    await setSetting("sync_status", "Synced");
  } catch (err) {
    console.error("Cloud Sync background worker failed:", err);
    await setSetting("sync_status", "Sync Error");
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
