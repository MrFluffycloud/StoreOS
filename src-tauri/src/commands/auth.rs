use crate::database::connection::DbState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserSession {
    pub username: String,
    pub role: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserInfo {
    pub id: String,
    pub username: String,
    pub pin: String,
    pub role: String,
    pub createdAt: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUserInput {
    pub username: String,
    pub pin: String,
    pub role: String,
}

#[tauri::command]
pub fn login_user(state: State<'_, DbState>, pin: String) -> Result<Option<UserSession>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;

    let result = conn.query_row(
        "SELECT username, role FROM users WHERE pin = ?",
        params![pin],
        |row| {
            Ok(UserSession {
                username: row.get(0)?,
                role: row.get(1)?,
            })
        },
    );

    match result {
        Ok(session) => Ok(Some(session)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn get_users(state: State<'_, DbState>) -> Result<Vec<UserInfo>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, username, pin, role, created_at FROM users ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;

    let user_iter = stmt
        .query_map([], |row| {
            Ok(UserInfo {
                id: row.get(0)?,
                username: row.get(1)?,
                pin: row.get(2)?,
                role: row.get(3)?,
                createdAt: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut users = Vec::new();
    for user in user_iter {
        users.push(user.map_err(|e| e.to_string())?);
    }

    Ok(users)
}

#[tauri::command]
pub fn create_user(state: State<'_, DbState>, input: CreateUserInput) -> Result<UserInfo, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;

    // 1. Validate PIN is exactly 4 digits
    if input.pin.len() != 4 || !input.pin.chars().all(|c| c.is_ascii_digit()) {
        return Err("PIN must be exactly 4 numeric digits.".to_string());
    }

    // 2. Validate unique PIN
    let pin_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE pin = ?",
            params![input.pin],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if pin_count > 0 {
        return Err("This PIN is already assigned to another user.".to_string());
    }

    // 3. Validate unique username
    let user_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE username = ?",
            params![input.username],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if user_count > 0 {
        return Err("This username already exists.".to_string());
    }

    // 4. Insert user
    let new_id = format!("usr-{}", &uuid::Uuid::new_v4().to_string()[0..8]);
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO users (id, username, pin, role, created_at) VALUES (?, ?, ?, ?, ?)",
        params![new_id, input.username, input.pin, input.role, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(UserInfo {
        id: new_id,
        username: input.username,
        pin: input.pin,
        role: input.role,
        createdAt: now,
    })
}

#[tauri::command]
pub fn update_user(
    state: State<'_, DbState>,
    id: String,
    username: String,
    pin: String,
    role: String,
) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;

    // 1. Validate PIN is exactly 4 digits
    if pin.len() != 4 || !pin.chars().all(|c| c.is_ascii_digit()) {
        return Err("PIN must be exactly 4 numeric digits.".to_string());
    }

    // 2. Validate unique PIN (excluding self)
    let pin_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE pin = ? AND id != ?",
            params![pin, id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if pin_count > 0 {
        return Err("This PIN is already assigned to another user.".to_string());
    }

    // 3. Validate unique username (excluding self)
    let user_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE username = ? AND id != ?",
            params![username, id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if user_count > 0 {
        return Err("This username already exists.".to_string());
    }

    conn.execute(
        "UPDATE users SET username = ?, pin = ?, role = ? WHERE id = ?",
        params![username, pin, role, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn delete_user(
    state: State<'_, DbState>,
    id: String,
    current_username: String,
) -> Result<(), String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;

    // 1. Verify we are not deleting our own active session
    let target_username: String = conn
        .query_row(
            "SELECT username FROM users WHERE id = ?",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if target_username == current_username {
        return Err("You cannot delete your own active user account.".to_string());
    }

    // 2. Verify we don't delete the last Admin user
    let admin_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE role = 'Admin'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let target_role: String = conn
        .query_row("SELECT role FROM users WHERE id = ?", params![id], |row| {
            row.get(0)
        })
        .map_err(|e| e.to_string())?;

    if target_role == "Admin" && admin_count <= 1 {
        return Err(
            "Lockout Prevention: You must leave at least one administrator user active."
                .to_string(),
        );
    }

    conn.execute("DELETE FROM users WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;

    Ok(())
}
