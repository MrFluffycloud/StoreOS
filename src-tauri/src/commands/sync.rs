use crate::database::connection::DbState;
use crate::repositories::settings::SettingsRepository;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::State;

const DEFAULT_SUPABASE_URL: &str = "https://ggyluxjrstdjavyagepq.supabase.co";
const DEFAULT_SUPABASE_KEY: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdneWx1eGpyc3RkamF2eWFnZXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3NDUyMzIsImV4cCI6MjA5OTMyMTIzMn0.0mePcosWOEDdj_g5W2eZ8BGldv4TCPhYEX5Wlj_ofHM";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyLicenseResult {
    pub success: bool,
    pub store_id: Option<String>,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct SupabaseProduct {
    id: String,
    store_id: String,
    name: String,
    sku: String,
    barcode: Option<String>,
    description: Option<String>,
    price_cents: i64,
    cost_cents: i64,
    category: Option<String>,
    brand: Option<String>,
    image_url: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Serialize, Deserialize)]
struct SupabaseMovement {
    id: String,
    store_id: String,
    product_id: String,
    quantity: f64,
    movement_type: String,
    reference_type: Option<String>,
    reference_id: Option<String>,
    employee_id: Option<String>,
    timestamp: String,
}

#[derive(Serialize, Deserialize)]
struct SupabaseSupplier {
    id: String,
    store_id: String,
    name: String,
    contact_name: Option<String>,
    email: Option<String>,
    phone: Option<String>,
    created_at: String,
}

#[derive(Serialize, Deserialize)]
struct SupabaseUser {
    id: String,
    store_id: String,
    username: String,
    pin: String,
    role: String,
    created_at: String,
}

async fn upsert_to_supabase<T: serde::Serialize>(
    url: &str,
    key: &str,
    table: &str,
    rows: &[T],
) -> Result<(), String> {
    let endpoint = format!("{}/rest/v1/{}", url.trim_end_matches('/'), table);
    let client = reqwest::Client::new();
    
    let res = client
        .post(&endpoint)
        .header("apikey", key)
        .header("Authorization", format!("Bearer {}", key))
        .header("Content-Type", "application/json")
        .header("Prefer", "resolution=merge-duplicates")
        .json(rows)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("PostgREST upsert failed for table '{}': {} - {}", table, status, body));
    }

    Ok(())
}

#[tauri::command]
pub async fn verify_license_key(
    state: State<'_, DbState>,
    license_key: String,
) -> Result<VerifyLicenseResult, String> {
    let clean_key = license_key.trim();
    
    // Validate format: SOS-dddd-dddd-dddd
    let parts: Vec<&str> = clean_key.split('-').collect();
    if parts.len() != 4 || parts[0] != "SOS" {
        return Ok(VerifyLicenseResult {
            success: false,
            store_id: None,
            error: Some("Invalid license format. Must match SOS-XXXX-XXXX-XXXX.".to_string()),
        });
    }
    
    for part in &parts[1..] {
        if part.len() != 4 || !part.chars().all(|c| c.is_ascii_digit()) {
            return Ok(VerifyLicenseResult {
                success: false,
                store_id: None,
                error: Some("Invalid license format. Must match SOS-XXXX-XXXX-XXXX.".to_string()),
            });
        }
    }

    // Simulate network verification latency
    tokio::time::sleep(tokio::time::Duration::from_millis(1200)).await;

    let store_id = format!("store_{}", clean_key.replace("-", "").to_lowercase());

    // Save to settings - inside block to drop non-Send connection
    {
        let conn = state.pool.get().map_err(|e| e.to_string())?;
        SettingsRepository::set(&conn, "license_key", clean_key)?;
        SettingsRepository::set(&conn, "store_id", &store_id)?;
        SettingsRepository::set(&conn, "supabase_url", DEFAULT_SUPABASE_URL)?;
        SettingsRepository::set(&conn, "supabase_key", DEFAULT_SUPABASE_KEY)?;
    }

    Ok(VerifyLicenseResult {
        success: true,
        store_id: Some(store_id),
        error: None,
    })
}

#[tauri::command]
pub async fn replicate_table(state: State<'_, DbState>, table: String) -> Result<(), String> {
    let (store_id, url, key) = {
        let conn = state.pool.get().map_err(|e| e.to_string())?;
        let s_id = SettingsRepository::get(&conn, "store_id")?
            .unwrap_or_else(|| "default_store".to_string());
        let s_url = SettingsRepository::get(&conn, "supabase_url")?
            .unwrap_or_else(|| DEFAULT_SUPABASE_URL.to_string());
        let s_key = SettingsRepository::get(&conn, "supabase_key")?
            .unwrap_or_else(|| DEFAULT_SUPABASE_KEY.to_string());
        (s_id, s_url, s_key)
    };

    if url.trim().is_empty() || key.trim().is_empty() {
        return Err("Cloud Sync credentials are empty".to_string());
    }

    match table.as_str() {
        "products" => {
            let list = {
                let conn = state.pool.get().map_err(|e| e.to_string())?;
                let mut stmt = conn
                    .prepare("SELECT id, name, sku, barcode, description, price_cents, cost_cents, category, brand, image_url, created_at, updated_at FROM products")
                    .map_err(|e| e.to_string())?;
                let rows = stmt
                    .query_map([], |row| {
                        Ok(SupabaseProduct {
                            id: row.get(0)?,
                            store_id: store_id.clone(),
                            name: row.get(1)?,
                            sku: row.get(2)?,
                            barcode: row.get(3)?,
                            description: row.get(4)?,
                            price_cents: row.get(5)?,
                            cost_cents: row.get(6)?,
                            category: row.get(7)?,
                            brand: row.get(8)?,
                            image_url: row.get(9)?,
                            created_at: row.get(10)?,
                            updated_at: row.get(11)?,
                        })
                    })
                    .map_err(|e| e.to_string())?;
                
                let mut items = Vec::new();
                for r in rows {
                    items.push(r.map_err(|e| e.to_string())?);
                }
                items
            };

            if !list.is_empty() {
                upsert_to_supabase(&url, &key, "products", &list).await?;
            }
        }
        "inventory_movements" => {
            let list = {
                let conn = state.pool.get().map_err(|e| e.to_string())?;
                let mut stmt = conn
                    .prepare("SELECT id, product_id, quantity, movement_type, reference_type, reference_id, employee_id, timestamp FROM inventory_movements")
                    .map_err(|e| e.to_string())?;
                let rows = stmt
                    .query_map([], |row| {
                        Ok(SupabaseMovement {
                            id: row.get(0)?,
                            store_id: store_id.clone(),
                            product_id: row.get(1)?,
                            quantity: row.get(2)?,
                            movement_type: row.get(3)?,
                            reference_type: row.get(4)?,
                            reference_id: row.get(5)?,
                            employee_id: row.get(6)?,
                            timestamp: row.get(7)?,
                        })
                    })
                    .map_err(|e| e.to_string())?;
                
                let mut items = Vec::new();
                for r in rows {
                    items.push(r.map_err(|e| e.to_string())?);
                }
                items
            };

            if !list.is_empty() {
                upsert_to_supabase(&url, &key, "inventory_movements", &list).await?;
            }
        }
        "suppliers" => {
            let list = {
                let conn = state.pool.get().map_err(|e| e.to_string())?;
                let mut stmt = conn
                    .prepare("SELECT id, name, contact_name, email, phone, created_at FROM suppliers")
                    .map_err(|e| e.to_string())?;
                let rows = stmt
                    .query_map([], |row| {
                        Ok(SupabaseSupplier {
                            id: row.get(0)?,
                            store_id: store_id.clone(),
                            name: row.get(1)?,
                            contact_name: row.get(2)?,
                            email: row.get(3)?,
                            phone: row.get(4)?,
                            created_at: row.get(5)?,
                        })
                    })
                    .map_err(|e| e.to_string())?;
                
                let mut items = Vec::new();
                for r in rows {
                    items.push(r.map_err(|e| e.to_string())?);
                }
                items
            };

            if !list.is_empty() {
                upsert_to_supabase(&url, &key, "suppliers", &list).await?;
            }
        }
        "users" => {
            let list = {
                let conn = state.pool.get().map_err(|e| e.to_string())?;
                let mut stmt = conn
                    .prepare("SELECT id, username, pin, role, created_at FROM users")
                    .map_err(|e| e.to_string())?;
                let rows = stmt
                    .query_map([], |row| {
                        Ok(SupabaseUser {
                            id: row.get(0)?,
                            store_id: store_id.clone(),
                            username: row.get(1)?,
                            pin: row.get(2)?,
                            role: row.get(3)?,
                            created_at: row.get(4)?,
                        })
                    })
                    .map_err(|e| e.to_string())?;
                
                let mut items = Vec::new();
                for r in rows {
                    items.push(r.map_err(|e| e.to_string())?);
                }
                items
            };

            if !list.is_empty() {
                upsert_to_supabase(&url, &key, "users", &list).await?;
            }
        }
        _ => return Err(format!("Unknown table: {}", table)),
    }

    Ok(())
}

#[tauri::command]
pub async fn sync_database(state: State<'_, DbState>) -> Result<String, String> {
    let (enabled, store_id, url, key, last_sync_time) = {
        let conn = state.pool.get().map_err(|e| e.to_string())?;
        let s_enabled = SettingsRepository::get(&conn, "supabase_sync_enabled")?
            .unwrap_or_else(|| "false".to_string());
        let s_id = SettingsRepository::get(&conn, "store_id")?
            .unwrap_or_else(|| "default_store".to_string());
        let s_url = SettingsRepository::get(&conn, "supabase_url")?
            .unwrap_or_else(|| DEFAULT_SUPABASE_URL.to_string());
        let s_key = SettingsRepository::get(&conn, "supabase_key")?
            .unwrap_or_else(|| DEFAULT_SUPABASE_KEY.to_string());
        
        let mut s_time = SettingsRepository::get(&conn, "last_sync_time")?
            .unwrap_or_else(|| "1970-01-01T00:00:00.000Z".to_string());
        if s_time.trim().is_empty() || s_time == "Never" {
            s_time = "1970-01-01T00:00:00.000Z".to_string();
        }
        (s_enabled, s_id, s_url, s_key, s_time)
    };

    if enabled != "true" {
        return Ok("Disabled".to_string());
    }

    // Set sync status to Syncing
    {
        let conn = state.pool.get().map_err(|e| e.to_string())?;
        SettingsRepository::set(&conn, "sync_status", "Syncing")?;
    }

    if url.trim().is_empty() || key.trim().is_empty() {
        let conn = state.pool.get().map_err(|e| e.to_string())?;
        SettingsRepository::set(&conn, "sync_status", "Sync Error")?;
        return Err("Cloud Sync credentials are empty".to_string());
    }

    let start_sync_time = chrono::Utc::now().to_rfc3339();

    // Query Products (drop stmt/conn after block)
    let products = {
        let conn = state.pool.get().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, name, sku, barcode, description, price_cents, cost_cents, category, brand, image_url, created_at, updated_at FROM products WHERE updated_at > ? OR created_at > ?")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![last_sync_time, last_sync_time], |row| {
                Ok(SupabaseProduct {
                    id: row.get(0)?,
                    store_id: store_id.clone(),
                    name: row.get(1)?,
                    sku: row.get(2)?,
                    barcode: row.get(3)?,
                    description: row.get(4)?,
                    price_cents: row.get(5)?,
                    cost_cents: row.get(6)?,
                    category: row.get(7)?,
                    brand: row.get(8)?,
                    image_url: row.get(9)?,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                })
            })
            .map_err(|e| e.to_string())?;
        
        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        list
    };

    // Query Movements (drop stmt/conn after block)
    let movements = {
        let conn = state.pool.get().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, product_id, quantity, movement_type, reference_type, reference_id, employee_id, timestamp FROM inventory_movements WHERE timestamp > ?")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![last_sync_time], |row| {
                Ok(SupabaseMovement {
                    id: row.get(0)?,
                    store_id: store_id.clone(),
                    product_id: row.get(1)?,
                    quantity: row.get(2)?,
                    movement_type: row.get(3)?,
                    reference_type: row.get(4)?,
                    reference_id: row.get(5)?,
                    employee_id: row.get(6)?,
                    timestamp: row.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?;
        
        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        list
    };

    // Query Suppliers (drop stmt/conn after block)
    let suppliers = {
        let conn = state.pool.get().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, name, contact_name, email, phone, created_at FROM suppliers WHERE created_at > ?")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![last_sync_time], |row| {
                Ok(SupabaseSupplier {
                    id: row.get(0)?,
                    store_id: store_id.clone(),
                    name: row.get(1)?,
                    contact_name: row.get(2)?,
                    email: row.get(3)?,
                    phone: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        
        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        list
    };

    // Query Users (drop stmt/conn after block)
    let users = {
        let conn = state.pool.get().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, username, pin, role, created_at FROM users WHERE created_at > ?")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![last_sync_time], |row| {
                Ok(SupabaseUser {
                    id: row.get(0)?,
                    store_id: store_id.clone(),
                    username: row.get(1)?,
                    pin: row.get(2)?,
                    role: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        
        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        list
    };

    // Upload batches to Supabase (safe to await here)
    if !products.is_empty() {
        if let Err(e) = upsert_to_supabase(&url, &key, "products", &products).await {
            let conn = state.pool.get().map_err(|db_err| db_err.to_string())?;
            SettingsRepository::set(&conn, "sync_status", "Sync Error")?;
            return Err(e);
        }
    }
    if !movements.is_empty() {
        if let Err(e) = upsert_to_supabase(&url, &key, "inventory_movements", &movements).await {
            let conn = state.pool.get().map_err(|db_err| db_err.to_string())?;
            SettingsRepository::set(&conn, "sync_status", "Sync Error")?;
            return Err(e);
        }
    }
    if !suppliers.is_empty() {
        if let Err(e) = upsert_to_supabase(&url, &key, "suppliers", &suppliers).await {
            let conn = state.pool.get().map_err(|db_err| db_err.to_string())?;
            SettingsRepository::set(&conn, "sync_status", "Sync Error")?;
            return Err(e);
        }
    }
    if !users.is_empty() {
        if let Err(e) = upsert_to_supabase(&url, &key, "users", &users).await {
            let conn = state.pool.get().map_err(|db_err| db_err.to_string())?;
            SettingsRepository::set(&conn, "sync_status", "Sync Error")?;
            return Err(e);
        }
    }

    // Update settings after successful await
    {
        let conn = state.pool.get().map_err(|e| e.to_string())?;
        SettingsRepository::set(&conn, "last_sync_time", &start_sync_time)?;
        SettingsRepository::set(&conn, "sync_status", "Synced")?;
    }

    Ok(start_sync_time)
}
