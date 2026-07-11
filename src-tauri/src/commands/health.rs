use crate::database::connection::DbState;
use serde::Serialize;
use tauri::State;

#[derive(Serialize)]
pub struct SystemHealth {
    pub app_version: String,
    pub platform: String,
    pub arch: String,
    pub db_size_bytes: u64,
    pub total_products: u64,
    pub total_movements: u64,
    pub total_suppliers: u64,
    pub total_users: u64,
    pub db_status: String,
}

#[tauri::command]
pub fn get_system_health(state: State<'_, DbState>) -> Result<SystemHealth, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;

    // Database integrity check
    let db_status: String = conn
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .unwrap_or_else(|_| "error".to_string());

    // Record counts
    let total_products: u64 = conn
        .query_row("SELECT COUNT(*) FROM products", [], |row| row.get(0))
        .unwrap_or(0);

    let total_movements: u64 = conn
        .query_row("SELECT COUNT(*) FROM inventory_movements", [], |row| {
            row.get(0)
        })
        .unwrap_or(0);

    let total_suppliers: u64 = conn
        .query_row("SELECT COUNT(*) FROM suppliers", [], |row| row.get(0))
        .unwrap_or(0);

    let total_users: u64 = conn
        .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
        .unwrap_or(0);

    // Database file size via PRAGMA
    let page_count: u64 = conn
        .query_row("PRAGMA page_count", [], |row| row.get(0))
        .unwrap_or(0);
    let page_size: u64 = conn
        .query_row("PRAGMA page_size", [], |row| row.get(0))
        .unwrap_or(4096);
    let db_size_bytes = page_count * page_size;

    // Platform info
    let platform = if cfg!(target_os = "windows") {
        "Windows"
    } else if cfg!(target_os = "macos") {
        "macOS"
    } else if cfg!(target_os = "linux") {
        "Linux"
    } else {
        "Unknown"
    };

    let arch = if cfg!(target_arch = "x86_64") {
        "x86_64"
    } else if cfg!(target_arch = "aarch64") {
        "ARM64"
    } else if cfg!(target_arch = "x86") {
        "x86"
    } else {
        "Unknown"
    };

    Ok(SystemHealth {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        platform: platform.to_string(),
        arch: arch.to_string(),
        db_size_bytes,
        total_products,
        total_movements,
        total_suppliers,
        total_users,
        db_status: if db_status == "ok" {
            "Healthy".to_string()
        } else {
            format!("Issue: {}", db_status)
        },
    })
}
