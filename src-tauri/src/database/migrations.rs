use rusqlite::{params, Connection};

pub fn run_migrations(conn: &mut Connection) -> Result<(), String> {
    // Create migrations table if it doesn't exist
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create migrations table: {}", e))?;

    // List of migrations
    let migrations = vec![
        (
            1,
            "CREATE TABLE products (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                sku TEXT UNIQUE NOT NULL,
                barcode TEXT,
                description TEXT,
                price_cents INTEGER NOT NULL,
                cost_cents INTEGER NOT NULL,
                category TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE inventory_movements (
                id TEXT PRIMARY KEY,
                product_id TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                movement_type TEXT NOT NULL,
                reference_type TEXT,
                reference_id TEXT,
                employee_id TEXT,
                timestamp TEXT NOT NULL,
                FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
            );
            CREATE TABLE customers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT,
                phone TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE suppliers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                contact_name TEXT,
                email TEXT,
                phone TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
        ),
        (
            2,
            "INSERT OR IGNORE INTO settings (key, value) VALUES ('store_name', 'StoreOS Home & Kitchen');
             INSERT OR IGNORE INTO settings (key, value) VALUES ('currency', 'USD');
             INSERT OR IGNORE INTO settings (key, value) VALUES ('tax_rate', '0.0825');"
        ),
        (
            3,
            "CREATE TABLE users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                pin TEXT NOT NULL,
                role TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            INSERT OR IGNORE INTO users (id, username, pin, role, created_at) VALUES ('u1', 'Admin', '1234', 'Admin', '2026-07-10T15:50:00Z');
            INSERT OR IGNORE INTO users (id, username, pin, role, created_at) VALUES ('u2', 'Cashier', '5555', 'Cashier', '2026-07-10T15:50:00Z');
            INSERT OR IGNORE INTO users (id, username, pin, role, created_at) VALUES ('u3', 'Auditor', '9999', 'Auditor', '2026-07-10T15:50:00Z');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('onboarded', 'false');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('theme_color', 'slate');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('theme_mode', 'dark');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('product_id_format', 'sku_barcode');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('sync_status', 'Synced');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('last_sync_time', 'Never');"
        ),
        (
            4,
            "UPDATE users SET username = 'Super User' WHERE id = 'u1';
             UPDATE users SET username = 'Emily Watson' WHERE id = 'u2';
             UPDATE users SET username = 'Arthur Dent' WHERE id = 'u3';"
        ),
        (
            5,
            "ALTER TABLE products ADD COLUMN brand TEXT;"
        ),
        (
            6,
            "ALTER TABLE products ADD COLUMN image_url TEXT;"
        ),
        (
            7,
            "ALTER TABLE products ADD COLUMN gst_rate REAL DEFAULT 0.0;"
        ),
        (
            8,
            "ALTER TABLE products ADD COLUMN unit TEXT DEFAULT 'PCs';"
        ),
    ];

    for (version, sql) in migrations {
        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM schema_migrations WHERE version = ?",
                params![version],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if count == 0 {
            log::info!("Applying migration version {}", version);
            let tx = conn
                .transaction()
                .map_err(|e| format!("Failed to begin transaction: {}", e))?;

            // Execute multiple statements split by semicolon
            for statement in sql.split(';') {
                let trimmed = statement.trim();
                if !trimmed.is_empty() {
                    tx.execute(trimmed, []).map_err(|e| {
                        format!("Failed executing statement: {}\nError: {}", trimmed, e)
                    })?;
                }
            }

            let now = chrono::Utc::now().to_rfc3339();
            tx.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
                params![version, now],
            )
            .map_err(|e| format!("Failed to log migration: {}", e))?;

            tx.commit()
                .map_err(|e| format!("Failed to commit migration transaction: {}", e))?;
        }
    }

    Ok(())
}
