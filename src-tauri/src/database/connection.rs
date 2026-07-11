use crate::database::migrations::run_migrations;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use std::fs;
use tauri::AppHandle;
use tauri::Manager; // for app_local_data_dir

pub type DbPool = Pool<SqliteConnectionManager>;

pub struct DbState {
    pub pool: DbPool,
}

pub fn init_db(app: &AppHandle) -> Result<DbPool, String> {
    let app_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to resolve local app data dir: {}", e))?;

    // Create the directory if it doesn't exist
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir)
            .map_err(|e| format!("Failed to create local app data directory: {}", e))?;
    }

    let db_path = app_dir.join("storeos.db");
    log::info!("Database path: {:?}", db_path);

    let manager = SqliteConnectionManager::file(db_path);
    let pool =
        Pool::new(manager).map_err(|e| format!("Failed to create connection pool: {}", e))?;

    // Run migrations using a connection from the pool
    let mut conn = pool
        .get()
        .map_err(|e| format!("Failed to get connection from pool: {}", e))?;

    run_migrations(&mut conn).map_err(|e| format!("Migration failed: {}", e))?;

    // Seed sample data if empty
    crate::database::seeder::seed_if_empty(&mut conn)
        .map_err(|e| format!("Seeding failed: {}", e))?;

    Ok(pool)
}
