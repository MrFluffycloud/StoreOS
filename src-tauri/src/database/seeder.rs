use rusqlite::Connection;

pub fn seed_if_empty(_conn: &Connection) -> Result<(), String> {
    // Sample product seeding disabled per user request to keep new environments empty and clean.
    Ok(())
}
