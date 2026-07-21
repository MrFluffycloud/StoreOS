use crate::database::connection::DbState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;
use bcrypt::{hash, verify, DEFAULT_COST};

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UserSession {
    pub username: String,
    pub role: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
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

pub fn verify_and_hash_pin(input_pin: &str, stored_pin: &str) -> (bool, Option<String>) {
    // 1. Try bcrypt verification
    if let Ok(valid) = verify(input_pin, stored_pin) {
        if valid {
            return (true, None);
        }
    }

    // 2. Fallback: Check plain text match (e.g., initial seed data)
    if input_pin == stored_pin {
        let hashed = hash(input_pin, DEFAULT_COST).ok();
        return (true, hashed);
    }

    (false, None)
}

#[tauri::command]
pub fn login_user(state: State<'_, DbState>, pin: String) -> Result<Option<UserSession>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, username, pin, role FROM users")
        .map_err(|e| e.to_string())?;

    let user_rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    for user_res in user_rows {
        if let Ok((id, username, stored_pin, role)) = user_res {
            let (is_valid, new_hash) = verify_and_hash_pin(&pin, &stored_pin);
            if is_valid {
                // If it matched plaintext seed, update DB to hashed PIN transparently
                if let Some(hashed_pin) = new_hash {
                    let _ = conn.execute(
                        "UPDATE users SET pin = ? WHERE id = ?",
                        params![hashed_pin, id],
                    );
                }
                return Ok(Some(UserSession { username, role }));
            }
        }
    }

    Ok(None)
}

#[tauri::command]
pub fn get_users(state: State<'_, DbState>) -> Result<Vec<UserInfo>, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, username, role, created_at FROM users ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;

    let user_iter = stmt
        .query_map([], |row| {
            Ok(UserInfo {
                id: row.get(0)?,
                username: row.get(1)?,
                pin: "****".to_string(), // Mask PIN for UI security
                role: row.get(2)?,
                createdAt: row.get(3)?,
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

    // 2. Validate unique username
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

    // 3. Hash PIN with bcrypt
    let hashed_pin = hash(&input.pin, DEFAULT_COST)
        .map_err(|e| format!("Failed to hash PIN: {}", e))?;

    let new_id = format!("usr-{}", &uuid::Uuid::new_v4().to_string()[0..8]);
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO users (id, username, pin, role, created_at) VALUES (?, ?, ?, ?, ?)",
        params![new_id, input.username, hashed_pin, input.role, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(UserInfo {
        id: new_id,
        username: input.username,
        pin: "****".to_string(),
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

    // 1. Validate unique username (excluding self)
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

    // 2. Handle PIN update if provided
    if pin != "****" && !pin.trim().is_empty() {
        if pin.len() != 4 || !pin.chars().all(|c| c.is_ascii_digit()) {
            return Err("PIN must be exactly 4 numeric digits.".to_string());
        }
        let hashed_pin = hash(&pin, DEFAULT_COST)
            .map_err(|e| format!("Failed to hash PIN: {}", e))?;

        conn.execute(
            "UPDATE users SET username = ?, pin = ?, role = ? WHERE id = ?",
            params![username, hashed_pin, role, id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "UPDATE users SET username = ?, role = ? WHERE id = ?",
            params![username, role, id],
        )
        .map_err(|e| e.to_string())?;
    }

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pin_verification_and_hashing() {
        let raw_pin = "1234";
        let hashed = hash(raw_pin, DEFAULT_COST).expect("Failed to hash pin");

        // Test bcrypt verification
        let (valid_bcrypt, new_hash) = verify_and_hash_pin(raw_pin, &hashed);
        assert!(valid_bcrypt);
        assert!(new_hash.is_none());

        // Test wrong bcrypt PIN
        let (invalid_bcrypt, _) = verify_and_hash_pin("9999", &hashed);
        assert!(!invalid_bcrypt);

        // Test plaintext fallback (seed data)
        let (valid_plaintext, auto_hashed) = verify_and_hash_pin("5555", "5555");
        assert!(valid_plaintext);
        assert!(auto_hashed.is_some());
    }
}
