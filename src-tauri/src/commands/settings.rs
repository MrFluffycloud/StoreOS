use crate::database::connection::DbState;
use crate::models::settings::Setting;
use crate::repositories::settings::SettingsRepository;
use tauri::State;

#[tauri::command]
pub fn get_settings(state: State<'_, DbState>) -> Result<Vec<Setting>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    SettingsRepository::list(&conn)
}

#[tauri::command]
pub fn get_setting(state: State<'_, DbState>, key: String) -> Result<Option<String>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    SettingsRepository::get(&conn, &key)
}

#[tauri::command]
pub fn set_setting(state: State<'_, DbState>, key: String, value: String) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    SettingsRepository::set(&conn, &key, &value)
}

#[tauri::command]
pub fn reset_store(state: State<'_, DbState>) -> Result<(), String> {
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Clear inventory movements and catalog products
    tx.execute("DELETE FROM inventory_movements", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM products", [])
        .map_err(|e| e.to_string())?;

    // Factory reset settings values
    tx.execute(
        "UPDATE settings SET value = 'false' WHERE key = 'onboarded'",
        [],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE settings SET value = 'StoreOS Home & Kitchen' WHERE key = 'store_name'",
        [],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE settings SET value = 'USD' WHERE key = 'currency'",
        [],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE settings SET value = '0.0825' WHERE key = 'tax_rate'",
        [],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE settings SET value = 'slate' WHERE key = 'theme_color'",
        [],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE settings SET value = 'dark' WHERE key = 'theme_mode'",
        [],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE settings SET value = 'sku_barcode' WHERE key = 'product_id_format'",
        [],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE settings SET value = 'Synced' WHERE key = 'sync_status'",
        [],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE settings SET value = 'Never' WHERE key = 'last_sync_time'",
        [],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_system_printers() -> Result<Vec<String>, String> {
    use std::process::Command;

    #[cfg(target_os = "windows")]
    {
        let output = Command::new("powershell")
            .args(&[
                "-NoProfile",
                "-Command",
                "Get-Printer | Select-Object -ExpandProperty Name",
            ])
            .output()
            .map_err(|e| e.to_string())?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut printers = Vec::new();
        for line in stdout.lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                printers.push(trimmed.to_string());
            }
        }
        Ok(printers)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("lpstat")
            .arg("-a")
            .output()
            .map_err(|e| e.to_string())?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut printers = Vec::new();
        for line in stdout.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if let Some(name) = parts.first() {
                printers.push(name.to_string());
            }
        }
        Ok(printers)
    }
}
