use crate::database::connection::DbState;
use crate::repositories::settings::SettingsRepository;
use tauri::State;

#[tauri::command]
pub async fn sync_database(state: State<'_, DbState>) -> Result<String, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;

    SettingsRepository::set(&conn, "sync_status", "Syncing")?;

    // Simulate database replication delay asynchronously
    tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;

    let now = chrono::Utc::now().to_rfc3339();
    SettingsRepository::set(&conn, "sync_status", "Synced")?;
    SettingsRepository::set(&conn, "last_sync_time", &now)?;

    Ok(now)
}
