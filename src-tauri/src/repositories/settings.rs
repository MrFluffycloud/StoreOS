use crate::models::settings::Setting;
use rusqlite::{params, Connection, OptionalExtension};

pub struct SettingsRepository;

impl SettingsRepository {
    pub fn get(conn: &Connection, key: &str) -> Result<Option<String>, String> {
        conn.query_row(
            "SELECT value FROM settings WHERE key = ?",
            params![key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())
    }

    pub fn set(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            params![key, value],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list(conn: &Connection) -> Result<Vec<Setting>, String> {
        let mut stmt = conn
            .prepare("SELECT key, value FROM settings")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok(Setting {
                    key: row.get(0)?,
                    value: row.get(1)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut settings = Vec::new();
        for row in rows {
            settings.push(row.map_err(|e| e.to_string())?);
        }
        Ok(settings)
    }
}
